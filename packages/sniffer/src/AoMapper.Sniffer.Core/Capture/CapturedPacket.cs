namespace AoMapper.Sniffer.Core.Capture;

public sealed record CapturedPacket(
    DateTimeOffset Timestamp,
    byte[] UdpPayload,
    string SourceAddress,
    int SourcePort,
    string DestinationAddress,
    int DestinationPort);
