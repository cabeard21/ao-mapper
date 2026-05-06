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
    private const int ReadTimeoutMs = 5;
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
            var rawFrameCount = 0;
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
                    rawFrameCount++;
                    handle.FrameCount++;
                    var summary = TryGetUdpSummary(frame, handle.DataLink);
                    if (summary is not null)
                    {
                        handle.Record(summary);
                    }

                    var packet = TryParseFrame(frame, handle.DataLink);
                    if (packet is not null)
                    {
                        packetCount++;
                        handle.ParsedPacketCount++;
                        if (_debugLog is not null && !PhotonConstants.AlbionPorts.Contains(packet.SourcePort) && !PhotonConstants.AlbionPorts.Contains(packet.DestinationPort))
                        {
                            _debugLog($"captured Photon-looking UDP on non-standard ports {packet.SourcePort}->{packet.DestinationPort}");
                        }
                        yield return packet;
                    }
                    else if (_debugLog is not null && handle.RejectedLogCount < 5)
                    {
                        handle.RejectedLogCount++;
                        _debugLog($"npcap rejected frame on {handle.Description}: {DescribeFrame(frame, handle.DataLink)}");
                    }
                }

                if (packetCount == 0 && _debugLog is not null && DateTimeOffset.UtcNow - lastIdleLog >= TimeSpan.FromSeconds(5))
                {
                    _debugLog(rawFrameCount == 0
                        ? "npcap is open but has not seen any UDP frames yet."
                        : $"npcap has seen {rawFrameCount} UDP frame(s), but none parsed as known-port or Photon-looking traffic. {FormatNpcapDiagnosis(handles)} {FormatHandleStats(handles)} {FormatUdpSummary(handles)}");
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
                var addresses = FormatAddresses(device.Addresses);
                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                var handle = CreateLiveHandle(name, errorBuffer);
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
                debugLog?.Invoke($"npcap adapter opened: {descriptionOrName(description, name)} datalink={dataLink}{addresses}");
                handles.Add(new PcapHandle(handle, dataLink, descriptionOrName(description, name)));
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

    private static string FormatHandleStats(IEnumerable<PcapHandle> handles)
    {
        var active = handles
            .Where(handle => handle.FrameCount > 0 || handle.ParsedPacketCount > 0)
            .Select(handle => $"{handle.Description}: frames={handle.FrameCount} parsed={handle.ParsedPacketCount}")
            .ToArray();
        return active.Length == 0 ? string.Empty : string.Join("; ", active);
    }

    private static string FormatUdpSummary(IEnumerable<PcapHandle> handles)
    {
        var pairs = handles
            .SelectMany(handle => handle.UdpCounts.Select(pair => (Key: $"{handle.Description} {pair.Key}", pair.Value)))
            .OrderByDescending(pair => pair.Value)
            .Take(8)
            .Select(pair => $"{pair.Key}={pair.Value}")
            .ToArray();
        return pairs.Length == 0 ? string.Empty : $"udpTop={string.Join("; ", pairs)}";
    }

    private static string FormatNpcapDiagnosis(IEnumerable<PcapHandle> handles)
    {
        var handleList = handles.ToArray();
        var albionPortFrames = handleList.Sum(handle => handle.AlbionPortFrameCount);
        var photonLikeFrames = handleList.Sum(handle => handle.PhotonLikeFrameCount);
        if (albionPortFrames == 0 && photonLikeFrames == 0)
        {
            return "diagnosis=no UDP on Albion ports 5055/5056/5058 and no Photon marker payloads were seen;";
        }

        if (albionPortFrames > 0)
        {
            return $"diagnosis=saw {albionPortFrames} UDP frame(s) on Albion ports but parsed none; this points at packet/header parsing, truncation, or encrypted Photon commands;";
        }

        return $"diagnosis=saw {photonLikeFrames} Photon-marker UDP frame(s) on dynamic ports but parsed none; this points at parser/reassembly rather than adapter selection;";
    }

    private static string FormatAddresses(IntPtr addresses)
    {
        var values = new List<string>();
        for (var current = addresses; current != IntPtr.Zero && values.Count < 8;)
        {
            var address = Marshal.PtrToStructure<PcapAddress>(current);
            current = address.Next;
            var text = TryFormatSockaddr(address.Address);
            if (text is not null)
            {
                values.Add(text);
            }
        }

        return values.Count == 0 ? string.Empty : $" addresses={string.Join(",", values)}";
    }

    private static string? TryFormatSockaddr(IntPtr sockaddr)
    {
        if (sockaddr == IntPtr.Zero)
        {
            return null;
        }

        var family = Marshal.ReadInt16(sockaddr);
        return family switch
        {
            2 => $"{Marshal.ReadByte(sockaddr, 4)}.{Marshal.ReadByte(sockaddr, 5)}.{Marshal.ReadByte(sockaddr, 6)}.{Marshal.ReadByte(sockaddr, 7)}",
            23 => FormatIPv6Address(sockaddr),
            _ => null
        };
    }

    private static string FormatIPv6Address(IntPtr sockaddr)
    {
        var bytes = new byte[16];
        Marshal.Copy(sockaddr + 8, bytes, 0, bytes.Length);
        return new System.Net.IPAddress(bytes).ToString();
    }

    private static string DescribeFrame(ReadOnlySpan<byte> frame, int dataLink)
    {
        return dataLink switch
        {
            DataLinkEthernet => DescribeEthernetFrame(frame),
            DataLinkRaw => DescribeIpPacket(frame),
            DataLinkNull or DataLinkLoop when frame.Length > 4 => $"loopback family={BitConverter.ToString(frame[..4].ToArray())} {DescribeIpPacket(frame[4..])}",
            _ => $"datalink={dataLink} len={frame.Length} head={HeadHex(frame)}"
        };
    }

    private static UdpSummary? TryGetUdpSummary(ReadOnlySpan<byte> frame, int dataLink)
    {
        return dataLink switch
        {
            DataLinkEthernet => TryGetEthernetUdpSummary(frame),
            DataLinkRaw => TryGetIpUdpSummary(frame),
            DataLinkNull or DataLinkLoop when frame.Length > 4 => TryGetIpUdpSummary(frame[4..]),
            _ => null
        };
    }

    private static UdpSummary? TryGetEthernetUdpSummary(ReadOnlySpan<byte> frame)
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

        return etherType is 0x0800 or 0x86dd ? TryGetIpUdpSummary(frame[ipOffset..]) : null;
    }

    private static UdpSummary? TryGetIpUdpSummary(ReadOnlySpan<byte> packet)
    {
        if (packet.IsEmpty)
        {
            return null;
        }

        return (packet[0] >> 4) switch
        {
            4 => TryGetIPv4UdpSummary(packet),
            6 => TryGetIPv6UdpSummary(packet),
            _ => null
        };
    }

    private static UdpSummary? TryGetIPv4UdpSummary(ReadOnlySpan<byte> packet)
    {
        if (packet.Length < 28 || packet[9] != 17)
        {
            return null;
        }

        var headerLength = (packet[0] & 0x0f) * 4;
        if (headerLength < 20 || packet.Length < headerLength + 8)
        {
            return null;
        }

        var sourceAddress = $"{packet[12]}.{packet[13]}.{packet[14]}.{packet[15]}";
        var destinationAddress = $"{packet[16]}.{packet[17]}.{packet[18]}.{packet[19]}";
        var sourcePort = (packet[headerLength] << 8) | packet[headerLength + 1];
        var destinationPort = (packet[headerLength + 2] << 8) | packet[headerLength + 3];
        var udpLength = (packet[headerLength + 4] << 8) | packet[headerLength + 5];
        var payloadOffset = headerLength + 8;
        var payloadLength = Math.Min(packet.Length - payloadOffset, Math.Max(0, udpLength - 8));
        var payload = payloadLength > 0 ? packet.Slice(payloadOffset, payloadLength) : [];
        return new UdpSummary(
            sourceAddress,
            sourcePort,
            destinationAddress,
            destinationPort,
            IsAlbionPort(sourcePort, destinationPort),
            PhotonConstants.LooksLikePhoton(payload));
    }

    private static UdpSummary? TryGetIPv6UdpSummary(ReadOnlySpan<byte> packet)
    {
        if (packet.Length < 48 || packet[6] != 17)
        {
            return null;
        }

        var sourceAddress = new System.Net.IPAddress(packet.Slice(8, 16)).ToString();
        var destinationAddress = new System.Net.IPAddress(packet.Slice(24, 16)).ToString();
        var sourcePort = (packet[40] << 8) | packet[41];
        var destinationPort = (packet[42] << 8) | packet[43];
        var udpLength = (packet[44] << 8) | packet[45];
        var payloadLength = Math.Min(packet.Length - 48, Math.Max(0, udpLength - 8));
        var payload = payloadLength > 0 ? packet.Slice(48, payloadLength) : [];
        return new UdpSummary(
            sourceAddress,
            sourcePort,
            destinationAddress,
            destinationPort,
            IsAlbionPort(sourcePort, destinationPort),
            PhotonConstants.LooksLikePhoton(payload));
    }

    private static bool IsAlbionPort(int sourcePort, int destinationPort)
    {
        return PhotonConstants.AlbionPorts.Contains(sourcePort) || PhotonConstants.AlbionPorts.Contains(destinationPort);
    }

    private static string DescribeEthernetFrame(ReadOnlySpan<byte> frame)
    {
        if (frame.Length < 14)
        {
            return $"ethernet truncated len={frame.Length} head={HeadHex(frame)}";
        }

        var etherType = (frame[12] << 8) | frame[13];
        var ipOffset = 14;
        if (etherType == 0x8100 && frame.Length >= 18)
        {
            etherType = (frame[16] << 8) | frame[17];
            ipOffset = 18;
        }

        return $"etherType=0x{etherType:x4} {DescribeIpPacket(frame[ipOffset..])}";
    }

    private static string DescribeIpPacket(ReadOnlySpan<byte> packet)
    {
        if (packet.IsEmpty)
        {
            return "ip empty";
        }

        return (packet[0] >> 4) switch
        {
            4 => DescribeIPv4Packet(packet),
            6 => DescribeIPv6Packet(packet),
            var version => $"ipVersion={version} len={packet.Length} head={HeadHex(packet)}"
        };
    }

    private static string DescribeIPv4Packet(ReadOnlySpan<byte> packet)
    {
        if (packet.Length < 28)
        {
            return $"ipv4 truncated len={packet.Length} head={HeadHex(packet)}";
        }

        var headerLength = (packet[0] & 0x0f) * 4;
        var protocol = packet[9];
        if (protocol != 17 || packet.Length < headerLength + 8)
        {
            return $"ipv4 protocol={protocol} headerLength={headerLength} len={packet.Length} head={HeadHex(packet)}";
        }

        var sourcePort = (packet[headerLength] << 8) | packet[headerLength + 1];
        var destinationPort = (packet[headerLength + 2] << 8) | packet[headerLength + 3];
        return $"ipv4 udp {sourcePort}->{destinationPort} len={packet.Length} head={HeadHex(packet)} payloadHead={HeadHex(packet[(headerLength + 8)..])}";
    }

    private static string DescribeIPv6Packet(ReadOnlySpan<byte> packet)
    {
        if (packet.Length < 48)
        {
            return $"ipv6 truncated len={packet.Length} head={HeadHex(packet)}";
        }

        var nextHeader = packet[6];
        if (nextHeader != 17)
        {
            return $"ipv6 nextHeader={nextHeader} len={packet.Length} head={HeadHex(packet)}";
        }

        var sourcePort = (packet[40] << 8) | packet[41];
        var destinationPort = (packet[42] << 8) | packet[43];
        return $"ipv6 udp {sourcePort}->{destinationPort} len={packet.Length} head={HeadHex(packet)} payloadHead={HeadHex(packet[48..])}";
    }

    private static string HeadHex(ReadOnlySpan<byte> bytes)
    {
        return Convert.ToHexString(bytes[..Math.Min(bytes.Length, 24)]);
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

    private static IntPtr CreateLiveHandle(string name, StringBuilder errorBuffer)
    {
        try
        {
            var handle = NativeMethods.pcap_create(name, errorBuffer);
            if (handle == IntPtr.Zero)
            {
                return NativeMethods.pcap_open_live(name, SnapshotLength, 1, ReadTimeoutMs, errorBuffer);
            }

            NativeMethods.pcap_set_snaplen(handle, SnapshotLength);
            NativeMethods.pcap_set_promisc(handle, 1);
            NativeMethods.pcap_set_timeout(handle, ReadTimeoutMs);
            NativeMethods.pcap_set_immediate_mode(handle, 1);

            var activateResult = NativeMethods.pcap_activate(handle);
            if (activateResult == 0)
            {
                return handle;
            }

            var error = NativeMethods.pcap_geterr(handle);
            var message = Marshal.PtrToStringAnsi(error);
            if (!string.IsNullOrWhiteSpace(message))
            {
                errorBuffer.Clear();
                errorBuffer.Append(message);
            }

            NativeMethods.pcap_close(handle);
            return IntPtr.Zero;
        }
        catch (EntryPointNotFoundException)
        {
            return NativeMethods.pcap_open_live(name, SnapshotLength, 1, ReadTimeoutMs, errorBuffer);
        }
    }

    public static CapturedPacket? TryParseFrame(ReadOnlySpan<byte> frame, int dataLink)
    {
        return dataLink switch
        {
            DataLinkEthernet => TryParseEthernetFrame(frame),
            DataLinkRaw => TryParseIpUdp(frame),
            DataLinkNull or DataLinkLoop when frame.Length > 4 => TryParseIpUdp(frame[4..]),
            _ => null
        };
    }

    private static CapturedPacket? TryParseIpUdp(ReadOnlySpan<byte> packet)
    {
        if (packet.IsEmpty)
        {
            return null;
        }

        return (packet[0] >> 4) switch
        {
            4 => RawSocketCaptureProvider.TryParseIPv4Udp(packet, allowPhotonLikePorts: true),
            6 => RawSocketCaptureProvider.TryParseIPv6Udp(packet, allowPhotonLikePorts: true),
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

        return etherType switch
        {
            0x0800 => RawSocketCaptureProvider.TryParseIPv4Udp(frame[ipOffset..], allowPhotonLikePorts: true),
            0x86dd => RawSocketCaptureProvider.TryParseIPv6Udp(frame[ipOffset..], allowPhotonLikePorts: true),
            _ => null
        };
    }

    private sealed record PcapHandle(IntPtr Handle, int DataLink, string Description)
    {
        public Dictionary<string, int> UdpCounts { get; } = new(StringComparer.Ordinal);
        public int FrameCount { get; set; }
        public int ParsedPacketCount { get; set; }
        public int RejectedLogCount { get; set; }
        public int AlbionPortFrameCount { get; set; }
        public int PhotonLikeFrameCount { get; set; }

        public void Record(UdpSummary summary)
        {
            var key = $"{summary.SourceAddress}:{summary.SourcePort}->{summary.DestinationAddress}:{summary.DestinationPort}";
            UdpCounts[key] = UdpCounts.GetValueOrDefault(key) + 1;
            if (summary.IsAlbionPort)
            {
                AlbionPortFrameCount++;
            }

            if (summary.LooksLikePhoton)
            {
                PhotonLikeFrameCount++;
            }
        }
    }

    private sealed record UdpSummary(
        string SourceAddress,
        int SourcePort,
        string DestinationAddress,
        int DestinationPort,
        bool IsAlbionPort,
        bool LooksLikePhoton);

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
    private readonly struct PcapAddress
    {
        public readonly IntPtr Next;
        public readonly IntPtr Address;
        public readonly IntPtr Netmask;
        public readonly IntPtr BroadcastAddress;
        public readonly IntPtr DestinationAddress;
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

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        public static extern IntPtr pcap_create(string source, StringBuilder errbuf);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int pcap_set_snaplen(IntPtr handle, int snapshotLength);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int pcap_set_promisc(IntPtr handle, int promiscuous);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int pcap_set_timeout(IntPtr handle, int readTimeout);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int pcap_set_immediate_mode(IntPtr handle, int immediateMode);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int pcap_activate(IntPtr handle);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr pcap_geterr(IntPtr handle);

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
