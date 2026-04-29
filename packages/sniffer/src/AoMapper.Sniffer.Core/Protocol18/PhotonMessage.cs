namespace AoMapper.Sniffer.Core.Protocol18;

public enum PhotonMessageKind
{
    Request,
    Response,
    Event
}

public sealed record PhotonMessage(PhotonMessageKind Kind, int Code, IReadOnlyDictionary<byte, object?> Parameters);

public sealed record Protocol18CustomValue(byte TypeCode, byte[] Data);
