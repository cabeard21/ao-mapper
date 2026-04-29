using System.Runtime.InteropServices;
using System.Text;
using AoMapper.Sniffer.Core.Capture;
using AoMapper.Sniffer.Core.Photon;

namespace AoMapper.Sniffer.Capture.Windows;

public sealed class NpcapCaptureProvider : ICaptureProvider
{
    private const int DataLinkNull = 0;
    private const int DataLinkEthernet = 1;
    private const int DataLinkRaw = 12;
    private const int DataLinkLoop = 108;
    private const int SnapshotLength = 65_535;
    private const int ReadTimeoutMs = 50;
    private const string Filter = "udp";
    private readonly Action<string>? _debugLog;

    public NpcapCaptureProvider(Action<string>? debugLog = null)
    {
        _debugLog = debugLog;
    }

    public string Name => "npcap";

    public static bool IsAvailable => NativeLibrary.TryLoad("wpcap.dll", out var handle) && Release(handle);

    public async IAsyncEnumerable<CapturedPacket> CaptureAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var handles = OpenDevices(_debugLog);
        if (handles.Count == 0)
        {
            _debugLog?.Invoke("npcap opened 0 adapters; try --provider raw or verify Npcap is installed with WinPcap API compatibility.");
            yield break;
        }

        _debugLog?.Invoke($"npcap opened {handles.Count} adapter(s).");
        try
        {
            var packetCount = 0;
            var lastIdleLog = DateTimeOffset.UtcNow;
            while (!cancellationToken.IsCancellationRequested)
            {
                foreach (var handle in handles)
                {
                    var result = NativeMethods.pcap_next_ex(handle.Handle, out var headerPointer, out var dataPointer);
                    if (result <= 0)
                    {
                        continue;
                    }

                    var header = Marshal.PtrToStructure<PcapPacketHeader>(headerPointer);
                    var frame = new byte[header.Caplen];
                    Marshal.Copy(dataPointer, frame, 0, checked((int)header.Caplen));
                    var packet = TryParseFrame(frame, handle.DataLink);
                    if (packet is not null)
                    {
                        packetCount++;
                        if (_debugLog is not null && !PhotonConstants.AlbionPorts.Contains(packet.SourcePort) && !PhotonConstants.AlbionPorts.Contains(packet.DestinationPort))
                        {
                            _debugLog($"captured Photon-looking UDP on non-standard ports {packet.SourcePort}->{packet.DestinationPort}");
                        }
                        yield return packet;
                    }
                }

                if (packetCount == 0 && _debugLog is not null && DateTimeOffset.UtcNow - lastIdleLog >= TimeSpan.FromSeconds(5))
                {
                    _debugLog("npcap is open but has not seen known-port or Photon-looking UDP traffic yet.");
                    lastIdleLog = DateTimeOffset.UtcNow;
                }

                await Task.Delay(1, cancellationToken);
            }
        }
        finally
        {
            foreach (var handle in handles)
            {
                NativeMethods.pcap_close(handle.Handle);
            }
        }
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    private static bool Release(IntPtr handle)
    {
        NativeLibrary.Free(handle);
        return true;
    }

    private static List<PcapHandle> OpenDevices(Action<string>? debugLog)
    {
        var handles = new List<PcapHandle>();
        var errorBuffer = new StringBuilder(256);
        if (NativeMethods.pcap_findalldevs(out var devices, errorBuffer) != 0 || devices == IntPtr.Zero)
        {
            debugLog?.Invoke($"pcap_findalldevs failed: {errorBuffer}");
            return handles;
        }

        try
        {
            for (var current = devices; current != IntPtr.Zero;)
            {
                var device = Marshal.PtrToStructure<PcapInterface>(current);
                current = device.Next;

                var name = Marshal.PtrToStringAnsi(device.Name);
                var description = Marshal.PtrToStringAnsi(device.Description) ?? "";
                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                var handle = NativeMethods.pcap_open_live(name, SnapshotLength, 1, ReadTimeoutMs, errorBuffer);
                if (handle == IntPtr.Zero)
                {
                    debugLog?.Invoke($"npcap skipped {descriptionOrName(description, name)}: open failed: {errorBuffer}");
                    continue;
                }

                if (!ApplyFilter(handle))
                {
                    debugLog?.Invoke($"npcap skipped {descriptionOrName(description, name)}: filter compile/apply failed.");
                    NativeMethods.pcap_close(handle);
                    continue;
                }

                var dataLink = NativeMethods.pcap_datalink(handle);
                debugLog?.Invoke($"npcap adapter opened: {descriptionOrName(description, name)} datalink={dataLink}");
                handles.Add(new PcapHandle(handle, dataLink));
            }
        }
        finally
        {
            NativeMethods.pcap_freealldevs(devices);
        }

        return handles;
    }

    private static string descriptionOrName(string description, string name)
    {
        return string.IsNullOrWhiteSpace(description) ? name : description;
    }

    private static bool ApplyFilter(IntPtr handle)
    {
        if (NativeMethods.pcap_compile(handle, out var program, Filter, 1, 0) != 0)
        {
            return false;
        }

        try
        {
            return NativeMethods.pcap_setfilter(handle, ref program) == 0;
        }
        finally
        {
            NativeMethods.pcap_freecode(ref program);
        }
    }

    private static CapturedPacket? TryParseFrame(ReadOnlySpan<byte> frame, int dataLink)
    {
        return dataLink switch
        {
            DataLinkEthernet => TryParseEthernetFrame(frame),
            DataLinkRaw => RawSocketCaptureProvider.TryParseIPv4Udp(frame, allowPhotonLikePorts: true),
            DataLinkNull or DataLinkLoop when frame.Length > 4 => RawSocketCaptureProvider.TryParseIPv4Udp(frame[4..], allowPhotonLikePorts: true),
            _ => null
        };
    }

    private static CapturedPacket? TryParseEthernetFrame(ReadOnlySpan<byte> frame)
    {
        if (frame.Length < 14)
        {
            return null;
        }

        var etherType = (frame[12] << 8) | frame[13];
        var ipOffset = 14;
        if (etherType == 0x8100 && frame.Length >= 18)
        {
            etherType = (frame[16] << 8) | frame[17];
            ipOffset = 18;
        }

        return etherType == 0x0800
            ? RawSocketCaptureProvider.TryParseIPv4Udp(frame[ipOffset..], allowPhotonLikePorts: true)
            : null;
    }

    private sealed record PcapHandle(IntPtr Handle, int DataLink);

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct PcapInterface
    {
        public readonly IntPtr Next;
        public readonly IntPtr Name;
        public readonly IntPtr Description;
        public readonly IntPtr Addresses;
        public readonly uint Flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PcapProgram
    {
        public uint Length;
        public IntPtr Instructions;
    }

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct PcapPacketHeader
    {
        public readonly int Seconds;
        public readonly int Microseconds;
        public readonly uint Caplen;
        public readonly uint Length;
    }

    private static class NativeMethods
    {
        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        public static extern int pcap_findalldevs(out IntPtr alldevs, StringBuilder errbuf);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void pcap_freealldevs(IntPtr alldevs);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        public static extern IntPtr pcap_open_live(string source, int snapshotLength, int promiscuous, int readTimeout, StringBuilder errbuf);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void pcap_close(IntPtr handle);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int pcap_datalink(IntPtr handle);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        public static extern int pcap_compile(IntPtr handle, out PcapProgram program, string filter, int optimize, uint netmask);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int pcap_setfilter(IntPtr handle, ref PcapProgram program);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void pcap_freecode(ref PcapProgram program);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int pcap_next_ex(IntPtr handle, out IntPtr packetHeader, out IntPtr packetData);
    }
}
