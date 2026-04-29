using AoMapper.Sniffer.Core.Photon;
using AoMapper.Sniffer.Core.Protocol18;

namespace AoMapper.Sniffer.Core.Mapping;

public sealed record ZoneChangeEvent(string ZoneUniqueName);

public sealed class ZoneEventExtractor
{
    private readonly Func<string, bool> _isKnownZoneToken;

    public ZoneEventExtractor(Func<string, bool>? isKnownZoneToken = null)
    {
        _isKnownZoneToken = isKnownZoneToken ?? (_ => false);
    }

    public ZoneChangeEvent? Extract(PhotonMessage message)
    {
        var directZone = message.Code switch
        {
            PhotonConstants.JoinOperationCode when message.Kind == PhotonMessageKind.Response => GetString(message.Parameters, 65) ?? GetString(message.Parameters, 8),
            PhotonConstants.GetGameServerByClusterOperationCode when message.Kind == PhotonMessageKind.Request => GetString(message.Parameters, 0),
            PhotonConstants.ChangeClusterOperationCode when message.Kind == PhotonMessageKind.Response => GetString(message.Parameters, 0),
            _ => null
        };

        var zone = NormalizeZoneValue(directZone) ?? GetKnownZoneFromResponse(message);
        return zone is null ? null : new ZoneChangeEvent(zone);
    }

    private static string? GetString(IReadOnlyDictionary<byte, object?> parameters, byte key)
    {
        return parameters.TryGetValue(key, out var value) ? value?.ToString() : null;
    }

    private static string? NormalizeZoneValue(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private string? GetKnownZoneFromResponse(PhotonMessage message)
    {
        if (message.Kind != PhotonMessageKind.Response)
        {
            return null;
        }

        var value = NormalizeZoneValue(GetString(message.Parameters, 0));
        return value is not null && _isKnownZoneToken(value) ? value : null;
    }
}
