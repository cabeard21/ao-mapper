namespace AoMapper.Sniffer.Core.Photon;

public sealed record PhotonParseResult(IReadOnlyList<PhotonPayload> Payloads, IReadOnlyList<string> Warnings)
{
    public static PhotonParseResult Empty { get; } = new([], []);
}

public sealed record PhotonPayload(byte CommandType, byte[] Data);
