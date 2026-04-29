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

    public string Name => "raw";

    public async IAsyncEnumerable<CapturedPacket> CaptureAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var addresses = GetActiveIPv4Addresses();
        if (addresses.Count == 0)
        {
            yield break;
        }

        var sockets = addresses.Select(CreateSocket).ToList();
        var buffer = new byte[ReceiveBufferLength];
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                foreach (var socket in sockets)
                {
                    if (socket.Available == 0)
                    {
                        continue;
                    }

                    EndPoint remote = new IPEndPoint(IPAddress.Any, 0);
                    var length = await socket.ReceiveFromAsync(buffer, SocketFlags.None, remote, cancellationToken);
                    var parsed = TryParseIPv4Udp(buffer.AsSpan(0, length.ReceivedBytes), allowPhotonLikePorts: true);
                    if (parsed is not null)
                    {
                        yield return parsed;
                    }
                }

                await Task.Delay(5, cancellationToken);
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

    private static List<IPAddress> GetActiveIPv4Addresses()
    {
        return NetworkInterface
            .GetAllNetworkInterfaces()
            .Where(adapter => adapter.OperationalStatus == OperationalStatus.Up && adapter.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .SelectMany(adapter => adapter.GetIPProperties().UnicastAddresses)
            .Where(address => address.Address.AddressFamily == AddressFamily.InterNetwork)
            .Select(address => address.Address)
            .ToList();
    }

    private static Socket CreateSocket(IPAddress address)
    {
        var socket = new Socket(AddressFamily.InterNetwork, SocketType.Raw, ProtocolType.IP);
        socket.Bind(new IPEndPoint(address, 0));
        socket.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.HeaderIncluded, true);
        socket.IOControl(IOControlCode.ReceiveAll, BitConverter.GetBytes(1), new byte[4]);
        socket.Blocking = false;
        return socket;
    }
}
