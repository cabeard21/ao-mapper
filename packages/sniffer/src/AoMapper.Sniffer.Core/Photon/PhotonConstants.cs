namespace AoMapper.Sniffer.Core.Photon;

public static class PhotonConstants
{
    public static readonly ISet<int> AlbionPorts = new HashSet<int> { 5055, 5056, 5058 };

    public const byte EncryptedFlag = 0x01;
    public const byte CrcFlag = 0xcc;

    public const byte ReliableCommand = 6;
    public const byte UnreliableCommand = 7;
    public const byte ReliableFragmentCommand = 8;

    public const int JoinOperationCode = 2;
    public const int GetGameServerByClusterOperationCode = 17;
    public const int BuyJourneyOperationCode = 201;
    public const int TeleportBackOperationCode = 224;
    public const int LegacyChangeClusterOperationCode = 36;
    public const int ChangeClusterOperationCode = 41;
    public const int TravelFactionWarfarePortalOperationCode = 534;
    public const byte OperationCodeParameter = 253;
    public const byte EventCodeParameter = 252;
    public const byte ResponseStatusParameter = 255;

    public static bool LooksLikePhoton(ReadOnlySpan<byte> payload)
    {
        if (payload.Length < 3)
        {
            return false;
        }

        return payload[0] is 0xF1 or 0xF2 or 0xFE;
    }
}
