using AoMapper.Sniffer.Core.Protocol18;

namespace AoMapper.Sniffer.Core.Mapping;

public sealed record SnifferPipelineResult(
    IReadOnlyList<ZoneChangeEvent> Events,
    int PhotonPayloadCount,
    IReadOnlyList<PhotonMessage> Messages,
    IReadOnlyList<string> Warnings);
