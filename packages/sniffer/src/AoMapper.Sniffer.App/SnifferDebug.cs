using AoMapper.Sniffer.Core.Mapping;
using AoMapper.Sniffer.Core.Photon;
using AoMapper.Sniffer.Core.Protocol18;

namespace AoMapper.Sniffer.App;

public static class SnifferDebug
{
    public static bool IsZoneRelevantMessage(PhotonMessage message)
    {
        return message.Code switch
        {
            PhotonConstants.JoinOperationCode => message.Kind == PhotonMessageKind.Response,
            PhotonConstants.GetGameServerByClusterOperationCode => message.Kind is PhotonMessageKind.Request or PhotonMessageKind.Response,
            PhotonConstants.ChangeClusterOperationCode => message.Kind == PhotonMessageKind.Response,
            PhotonConstants.LegacyChangeClusterOperationCode => message.Kind == PhotonMessageKind.Response,
            PhotonConstants.BuyJourneyOperationCode => IsRequestOrResponse(message),
            PhotonConstants.TeleportBackOperationCode => IsRequestOrResponse(message),
            PhotonConstants.TravelFactionWarfarePortalOperationCode => IsRequestOrResponse(message),
            _ => false
        };
    }

    public static bool ShouldPrintZoneFocusedMessage(PhotonMessage message, IReadOnlyList<ZoneTokenCandidate> knownZoneCandidates)
    {
        return IsZoneRelevantMessage(message)
            || knownZoneCandidates.Count > 0 && IsRequestOrResponse(message);
    }

    private static bool IsRequestOrResponse(PhotonMessage message)
    {
        return message.Kind is PhotonMessageKind.Request or PhotonMessageKind.Response;
    }
}
