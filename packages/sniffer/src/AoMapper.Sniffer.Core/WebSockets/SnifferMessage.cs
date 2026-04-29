namespace AoMapper.Sniffer.Core.WebSockets;

public sealed record StatusMessage(string Type, StatusData Data)
{
    public static StatusMessage Create(string captureProvider, string version) =>
        new("status", new StatusData(true, captureProvider, version));
}

public sealed record StatusData(bool Active, string CaptureProvider, string Version);

public sealed record PhotonEventMessage(string Type, long Timestamp, PhotonEventData Data)
{
    public static PhotonEventMessage ZoneCurrent(string zoneUniqueName, DateTimeOffset timestamp) =>
        new(
            "photonEvent",
            timestamp.ToUnixTimeSeconds(),
            new PhotonEventData("zone:current", new Dictionary<string, string>
            {
                ["zoneUniqueName"] = zoneUniqueName
            }));
}

public sealed record PhotonEventData(string EventCode, IReadOnlyDictionary<string, string> Parameters);
