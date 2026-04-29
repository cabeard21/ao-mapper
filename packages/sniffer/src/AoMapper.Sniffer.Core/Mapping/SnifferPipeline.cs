using AoMapper.Sniffer.Core.Capture;
using AoMapper.Sniffer.Core.Photon;
using AoMapper.Sniffer.Core.Protocol18;

namespace AoMapper.Sniffer.Core.Mapping;

public sealed class SnifferPipeline
{
    private readonly PhotonCommandParser _commandParser = new();
    private readonly Protocol18Decoder _decoder = new();
    private readonly ZoneEventExtractor _extractor;

    public SnifferPipeline(Func<string, bool>? isKnownZoneToken = null)
    {
        _extractor = new ZoneEventExtractor(isKnownZoneToken);
    }

    public IReadOnlyList<ZoneChangeEvent> Process(CapturedPacket packet)
    {
        return ProcessDetailed(packet).Events;
    }

    public SnifferPipelineResult ProcessDetailed(CapturedPacket packet)
    {
        if (!PhotonConstants.AlbionPorts.Contains(packet.SourcePort)
            && !PhotonConstants.AlbionPorts.Contains(packet.DestinationPort)
            && !PhotonConstants.LooksLikePhoton(packet.UdpPayload))
        {
            return new SnifferPipelineResult([], 0, [], []);
        }

        var parsed = _commandParser.Parse(packet.UdpPayload);
        var warnings = new List<string>(parsed.Warnings);
        var events = new List<ZoneChangeEvent>();
        var messages = new List<PhotonMessage>();
        foreach (var payload in parsed.Payloads)
        {
            if (!_decoder.TryDecodeMessage(payload.Data, out var message, out var warning) || message is null)
            {
                if (warning is not null)
                {
                    warnings.Add($"{warning} payload={DescribePayload(payload.Data)}");
                }

                continue;
            }

            messages.Add(message);
            var zoneEvent = _extractor.Extract(message);
            if (zoneEvent is not null)
            {
                events.Add(zoneEvent);
            }
        }

        return new SnifferPipelineResult(events, parsed.Payloads.Count, messages, warnings);
    }

    private static string DescribePayload(byte[] payload)
    {
        var length = Math.Min(payload.Length, 16);
        return $"len={payload.Length} head={Convert.ToHexString(payload.AsSpan(0, length))}";
    }
}
