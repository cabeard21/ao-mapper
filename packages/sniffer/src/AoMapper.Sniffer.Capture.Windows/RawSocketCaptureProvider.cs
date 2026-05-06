using System.Buffers.Binary;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.CompilerServices;
using AoMapper.Sniffer.Core.Capture;
using AoMapper.Sniffer.Core.Photon;

namespace AoMapper.Sniffer.Capture.Windows;

public sealed class RawSocketCaptureProvider : ICaptureProvider
{
    private const int ReceiveBufferLength = 65_535;
    private const int SocketReceiveBufferLength = 4 * 1024 * 1024;
    private const int MaxReadsPerSocketPerTick = 256;
    private readonly Action<string>? _debugLog;

    public RawSocketCaptureProvider(Action<string>? debugLog = null)
    {
        _debugLog = debugLog;
    }

    public string Name => "raw";

    public async IAsyncEnumerable<CapturedPacket> CaptureAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var addresses = GetActiveAddresses();
        if (addresses.Count == 0)
        {
            _debugLog?.Invoke("raw opened 0 sockets; no active non-loopback local addresses were found.");
            yield break;
        }

        var sockets = addresses
            .Select(TryCreateSocket)
            .Where(socket => socket is not null)
            .Cast<Socket>()
            .ToList();
        if (sockets.Count == 0)
        {
            _debugLog?.Invoke("raw opened 0 sockets; run as administrator or verify raw sockets are permitted.");
            yield break;
        }

        _debugLog?.Invoke($"raw opened {sockets.Count} socket(s): {string.Join(", ", sockets.Select(socket => socket.LocalEndPoint?.ToString() ?? socket.AddressFamily.ToString()))}");
        var buffer = new byte[ReceiveBufferLength];
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                foreach (var socket in sockets)
                {
                    for (var reads = 0; reads < MaxReadsPerSocketPerTick && socket.Available > 0; reads++)
                    {
                        EndPoint remote = socket.AddressFamily == AddressFamily.InterNetworkV6
                            ? new IPEndPoint(IPAddress.IPv6Any, 0)
                            : new IPEndPoint(IPAddress.Any, 0);
                        var length = await socket.ReceiveFromAsync(buffer, SocketFlags.None, remote, cancellationToken);
                        var parsed = socket.AddressFamily == AddressFamily.InterNetworkV6
                            ? TryParseIPv6Udp(buffer.AsSpan(0, length.ReceivedBytes), allowPhotonLikePorts: true)
                            : TryParseIPv4Udp(buffer.AsSpan(0, length.ReceivedBytes), allowPhotonLikePorts: true);
                        if (parsed is not null)
                        {
                            yield return parsed;
                        }
                    }
                }

                await Task.Delay(1, cancellationToken);
            }
        }
        finally
        {
            foreach (var socket in sockets)
            {
                socket.Dispose();
            }
        }
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    public static CapturedPacket? TryParseIPv4Udp(ReadOnlySpan<byte> packet, bool allowPhotonLikePorts = false)
    {
        if (packet.Length < 20)
        {
            return null;
        }

        var version = packet[0] >> 4;
        var headerLength = (packet[0] & 0x0f) * 4;
        if (version != 4 || headerLength < 20 || packet.Length < headerLength + 8)
        {
            return null;
        }

        var flagsAndOffset = BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(6, 2));
        if ((flagsAndOffset & 0x3fff) != 0)
        {
            return null;
        }

        if (packet[9] != 17)
        {
            return null;
        }

        var sourcePort = BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(headerLength, 2));
        var destinationPort = BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(headerLength + 2, 2));
        var udpLength = BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(headerLength + 4, 2));
        if (udpLength < 8 || headerLength + udpLength > packet.Length)
        {
            return null;
        }

        var payload = packet.Slice(headerLength + 8, udpLength - 8);
        if (!PhotonConstants.AlbionPorts.Contains(sourcePort)
            && !PhotonConstants.AlbionPorts.Contains(destinationPort)
            && (!allowPhotonLikePorts || !PhotonConstants.LooksLikePhoton(payload)))
        {
            return null;
        }

        var sourceAddress = new IPAddress(packet.Slice(12, 4)).ToString();
        var destinationAddress = new IPAddress(packet.Slice(16, 4)).ToString();
        return new CapturedPacket(
            DateTimeOffset.UtcNow,
            payload.ToArray(),
            sourceAddress,
            sourcePort,
            destinationAddress,
            destinationPort);
    }

    public static CapturedPacket? TryParseIPv6Udp(ReadOnlySpan<byte> packet, bool allowPhotonLikePorts = false)
    {
        if (packet.Length < 40)
        {
            return null;
        }

        var version = packet[0] >> 4;
        if (version != 6)
        {
            return null;
        }

        var payloadLength = BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(4, 2));
        var nextHeader = packet[6];
        if (nextHeader != 17 || payloadLength < 8 || packet.Length < 40 + payloadLength)
        {
            return null;
        }

        var udpOffset = 40;
        var sourcePort = BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(udpOffset, 2));
        var destinationPort = BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(udpOffset + 2, 2));
        var udpLength = BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(udpOffset + 4, 2));
        if (udpLength < 8 || udpLength > payloadLength)
        {
            return null;
        }

        var payload = packet.Slice(udpOffset + 8, udpLength - 8);
        if (!PhotonConstants.AlbionPorts.Contains(sourcePort)
            && !PhotonConstants.AlbionPorts.Contains(destinationPort)
            && (!allowPhotonLikePorts || !PhotonConstants.LooksLikePhoton(payload)))
        {
            return null;
        }

        var sourceAddress = new IPAddress(packet.Slice(8, 16)).ToString();
        var destinationAddress = new IPAddress(packet.Slice(24, 16)).ToString();
        return new CapturedPacket(
            DateTimeOffset.UtcNow,
            payload.ToArray(),
            sourceAddress,
            sourcePort,
            destinationAddress,
            destinationPort);
    }

    private static List<IPAddress> GetActiveAddresses()
    {
        return NetworkInterface
            .GetAllNetworkInterfaces()
            .Where(adapter => adapter.OperationalStatus == OperationalStatus.Up && adapter.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .SelectMany(adapter => adapter.GetIPProperties().UnicastAddresses)
            .Where(address => address.Address.AddressFamily is AddressFamily.InterNetwork or AddressFamily.InterNetworkV6)
            .Select(address => address.Address)
            .ToList();
    }

    private static Socket? TryCreateSocket(IPAddress address)
    {
        Socket? socket = null;
        try
        {
            socket = address.AddressFamily == AddressFamily.InterNetworkV6
                ? new Socket(AddressFamily.InterNetworkV6, SocketType.Raw, ProtocolType.IPv6)
                : new Socket(AddressFamily.InterNetwork, SocketType.Raw, ProtocolType.IP);
            socket.ReceiveBufferSize = SocketReceiveBufferLength;
            socket.Bind(new IPEndPoint(address, 0));
            if (address.AddressFamily == AddressFamily.InterNetworkV6)
            {
                try
                {
                    socket.SetSocketOption(SocketOptionLevel.IPv6, (SocketOptionName)29, true);
                }
                catch
                {
                    // Not available on every Windows stack; packet capture still works on many adapters.
                }
            }
            else
            {
                socket.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.HeaderIncluded, true);
                socket.IOControl(IOControlCode.ReceiveAll, BitConverter.GetBytes(1), new byte[4]);
            }

            socket.Blocking = false;
            return socket;
        }
        catch
        {
            socket?.Dispose();
            return null;
        }
    }
}
