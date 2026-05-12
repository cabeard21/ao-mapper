using AoMapper.Sniffer.Core.Photon;
using AoMapper.Sniffer.Core.Protocol18;

namespace AoMapper.Sniffer.Core.Mapping;

public sealed record ZoneChangeEvent(string ZoneUniqueName);

public sealed record ZoneTokenCandidate(string Path, string Value);

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
            PhotonConstants.JoinOperationCode when message.Kind == PhotonMessageKind.Response => GetString(message.Parameters, 8) ?? GetString(message.Parameters, 65),
            PhotonConstants.GetGameServerByClusterOperationCode when message.Kind == PhotonMessageKind.Request => GetString(message.Parameters, 0),
            PhotonConstants.GetGameServerByClusterOperationCode when message.Kind == PhotonMessageKind.Response => FindKnownZoneToken(message.Parameters),
            PhotonConstants.ChangeClusterOperationCode when message.Kind == PhotonMessageKind.Response => GetString(message.Parameters, 0),
            PhotonConstants.LegacyChangeClusterOperationCode when message.Kind == PhotonMessageKind.Response => GetString(message.Parameters, 0),
            PhotonConstants.BuyJourneyOperationCode when IsRequestOrResponse(message) => FindKnownZoneToken(message.Parameters),
            PhotonConstants.TeleportBackOperationCode when IsRequestOrResponse(message) => FindKnownZoneToken(message.Parameters),
            PhotonConstants.TravelFactionWarfarePortalOperationCode when IsRequestOrResponse(message) => FindKnownZoneToken(message.Parameters),
            _ => null
        };

        var zone = NormalizeZoneValue(directZone);
        return zone is null ? null : new ZoneChangeEvent(zone);
    }

    public IReadOnlyList<ZoneTokenCandidate> FindKnownZoneCandidates(PhotonMessage message)
    {
        return IsRequestOrResponse(message) ? FindKnownZoneCandidates(message.Parameters) : [];
    }

    private static bool IsRequestOrResponse(PhotonMessage message)
    {
        return message.Kind is PhotonMessageKind.Request or PhotonMessageKind.Response;
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

    private string? FindKnownZoneToken(IReadOnlyDictionary<byte, object?> parameters)
    {
        return FindKnownZoneCandidates(parameters).FirstOrDefault()?.Value;
    }

    private IReadOnlyList<ZoneTokenCandidate> FindKnownZoneCandidates(IReadOnlyDictionary<byte, object?> parameters)
    {
        var candidates = new List<ZoneTokenCandidate>();
        foreach (var (key, value) in parameters.OrderBy(pair => pair.Key))
        {
            if (IsPhotonMetadataParameter(key))
            {
                continue;
            }

            FindKnownZoneCandidatesInValue(value, $"p{key}", candidates);
        }

        return candidates;
    }

    private static bool IsPhotonMetadataParameter(byte key)
    {
        return key is PhotonConstants.EventCodeParameter
            or PhotonConstants.OperationCodeParameter
            or PhotonConstants.ResponseStatusParameter;
    }

    private void FindKnownZoneCandidatesInValue(object? value, string path, ICollection<ZoneTokenCandidate> candidates)
    {
        switch (value)
        {
            case string text:
                AddKnownZoneCandidate(path, text, candidates);
                break;
            case byte or short or int or long:
                AddKnownZoneCandidate(path, Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture), candidates);
                break;
            case IReadOnlyDictionary<byte, object?> table:
                foreach (var (key, nested) in table.OrderBy(pair => pair.Key))
                {
                    FindKnownZoneCandidatesInValue(nested, $"{path}.p{key}", candidates);
                }
                break;
            case IDictionary<object, object?> dictionary:
            {
                var index = 0;
                foreach (var nested in dictionary.Values)
                {
                    FindKnownZoneCandidatesInValue(nested, $"{path}.{index}", candidates);
                    index++;
                }
                break;
            }
            case IEnumerable<object?> values:
            {
                var index = 0;
                foreach (var nested in values)
                {
                    FindKnownZoneCandidatesInValue(nested, $"{path}[{index}]", candidates);
                    index++;
                }
                break;
            }
        }
    }

    private void AddKnownZoneCandidate(string path, string? value, ICollection<ZoneTokenCandidate> candidates)
    {
        var normalized = NormalizeZoneValue(value);
        if (normalized is not null && _isKnownZoneToken(normalized))
        {
            candidates.Add(new ZoneTokenCandidate(path, normalized));
        }
    }
}
