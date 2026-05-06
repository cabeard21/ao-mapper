using AoMapper.Sniffer.App;
using AoMapper.Sniffer.Capture.Windows;
using AoMapper.Sniffer.Core.Capture;
using AoMapper.Sniffer.Core.Mapping;
using AoMapper.Sniffer.Core.Photon;
using AoMapper.Sniffer.Core.Protocol18;

var options = SnifferOptions.Parse(args);
Action<string>? debugLog = options.Debug ? message => Console.WriteLine($"[debug] {message}") : null;
await using var captureProvider = CaptureProviderFactory.Create(options.Provider, options.DebugVerbose || options.DebugZone ? debugLog : null);
await using var webSocketServer = new SnifferWebSocketServer(options.Host, options.Port, captureProvider.Name);
var zoneNameResolver = ZoneNameResolver.CreateDefault(debugLog);

using var cancellation = new CancellationTokenSource();
Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    cancellation.Cancel();
};

Console.WriteLine($"Ao Mapper sniffer listening on ws://{options.Host}:{options.Port}/ws using {captureProvider.Name}.");

var serverTask = webSocketServer.RunAsync(cancellation.Token);
var pipeline = new SnifferPipeline(zoneNameResolver.Contains);
var debugZoneExtractor = options.Debug ? new ZoneEventExtractor(zoneNameResolver.Contains) : null;
var packetCount = 0;
var photonPayloadCount = 0;
var decodedMessageCount = 0;
var lastStats = DateTimeOffset.UtcNow;
var lastStatsPacketCount = 0;
var lastStatsPhotonPayloadCount = 0;
var lastStatsDecodedMessageCount = 0;
var debugOperationCounts = new Dictionary<string, int>(StringComparer.Ordinal);
var debugRequestResponseCounts = new Dictionary<string, int>(StringComparer.Ordinal);
var debugWarningCounts = new Dictionary<string, int>(StringComparer.Ordinal);
var debugWarningCount = 0;

try
{
    await foreach (var packet in captureProvider.CaptureAsync(cancellation.Token))
    {
        packetCount++;
        var result = pipeline.ProcessDetailed(packet);
        photonPayloadCount += result.PhotonPayloadCount;
        decodedMessageCount += result.Messages.Count;
        if (options.Debug)
        {
            debugWarningCount += result.Warnings.Count;
            foreach (var warning in result.Warnings)
            {
                var key = NormalizeWarning(warning);
                debugWarningCounts[key] = debugWarningCounts.GetValueOrDefault(key) + 1;
            }

            foreach (var message in result.Messages)
            {
                var key = $"{message.Kind}:{message.Code}";
                debugOperationCounts[key] = debugOperationCounts.GetValueOrDefault(key) + 1;
                if (message.Kind is PhotonMessageKind.Request or PhotonMessageKind.Response)
                {
                    debugRequestResponseCounts[key] = debugRequestResponseCounts.GetValueOrDefault(key) + 1;
                }
            }
        }

        if (options.Debug)
        {
            if (options.DebugVerbose && !options.DebugZone)
            {
                foreach (var warning in result.Warnings)
                {
                    Console.WriteLine($"[debug] photon warning: {warning}");
                }
            }

            foreach (var message in result.Messages)
            {
                var knownZoneCandidates = debugZoneExtractor?.FindKnownZoneCandidates(message).Take(8).ToArray() ?? [];
                var zoneRelevant = SnifferDebug.IsZoneRelevantMessage(message);
                if (options.DebugZone)
                {
                    if (!SnifferDebug.ShouldPrintZoneFocusedMessage(message, knownZoneCandidates))
                    {
                        continue;
                    }

                    Console.WriteLine(
                        $"[debug] zone-focused {message.Kind} code={message.Code} "
                        + $"{FormatEndpoint(packet)} "
                        + $"params={string.Join(",", message.Parameters.Keys.Order())}");
                    Console.WriteLine($"[debug] zone-focused detail {message.Kind} code={message.Code} {FormatParameters(message.Parameters)}");
                    if (knownZoneCandidates.Length > 0)
                    {
                        Console.WriteLine(
                            $"[debug] decoded known zone candidates {message.Kind} code={message.Code} "
                            + string.Join("; ", knownZoneCandidates.Select(candidate => $"{candidate.Path}={Quote(candidate.Value)}")));
                    }
                    else
                    {
                        var stringCandidates = FindStringCandidates(message.Parameters).Take(8).ToArray();
                        Console.WriteLine(
                            $"[debug] zone-focused no known token {message.Kind} code={message.Code}"
                            + (stringCandidates.Length > 0 ? $" strings={string.Join("; ", stringCandidates)}" : string.Empty));
                    }

                    continue;
                }

                if (zoneRelevant && knownZoneCandidates.Length > 0)
                {
                    Console.WriteLine(
                        $"[debug] decoded known zone candidates {message.Kind} code={message.Code} "
                        + string.Join("; ", knownZoneCandidates.Select(candidate => $"{candidate.Path}={Quote(candidate.Value)}")));
                }

                if (options.DebugVerbose)
                {
                    Console.WriteLine($"[debug] decoded {message.Kind} code={message.Code} params={string.Join(",", message.Parameters.Keys.Order())}");
                    if (ShouldPrintParameterDetails(message))
                    {
                        Console.WriteLine($"[debug] decoded detail {message.Kind} code={message.Code} {FormatParameters(message.Parameters)}");
                    }

                    var stringCandidates = FindStringCandidates(message.Parameters).Take(8).ToArray();
                    if (stringCandidates.Length > 0)
                    {
                        Console.WriteLine($"[debug] decoded strings {message.Kind} code={message.Code} {string.Join("; ", stringCandidates)}");
                    }
                }
                else if (knownZoneCandidates.Length == 0 && zoneRelevant)
                {
                    var stringCandidates = FindStringCandidates(message.Parameters).Take(8).ToArray();
                    Console.WriteLine(
                        $"[debug] decoded zone op without known token {message.Kind} code={message.Code} "
                        + $"params={string.Join(",", message.Parameters.Keys.Order())}"
                        + (stringCandidates.Length > 0 ? $" strings={string.Join("; ", stringCandidates)}" : string.Empty));
                }
            }

            var now = DateTimeOffset.UtcNow;
            if (now - lastStats >= TimeSpan.FromSeconds(options.DebugVerbose ? 5 : 10))
            {
                Console.WriteLine(
                    $"[debug] traffic +{packetCount - lastStatsPacketCount} packets "
                    + $"+{photonPayloadCount - lastStatsPhotonPayloadCount} photonPayloads "
                    + $"+{decodedMessageCount - lastStatsDecodedMessageCount} decodedMessages"
                    + (debugOperationCounts.Count > 0 ? $" ops={FormatOperationCounts(debugOperationCounts)}" : string.Empty)
                    + (debugRequestResponseCounts.Count > 0 ? $" reqres={FormatOperationCounts(debugRequestResponseCounts, 16)}" : string.Empty)
                    + (debugWarningCount > 0 ? $" warnings={debugWarningCount} warningTypes={FormatOperationCounts(debugWarningCounts, 6)}" : string.Empty));
                debugOperationCounts.Clear();
                debugRequestResponseCounts.Clear();
                debugWarningCounts.Clear();
                debugWarningCount = 0;
                lastStatsPacketCount = packetCount;
                lastStatsPhotonPayloadCount = photonPayloadCount;
                lastStatsDecodedMessageCount = decodedMessageCount;
                lastStats = now;
            }
        }

        foreach (var zoneEvent in result.Events)
        {
            var resolvedZoneName = zoneNameResolver.Resolve(zoneEvent.ZoneUniqueName);
            if (options.Debug)
            {
                Console.WriteLine(resolvedZoneName == zoneEvent.ZoneUniqueName
                    ? $"zone:current {zoneEvent.ZoneUniqueName}"
                    : $"zone:current {resolvedZoneName} (from {zoneEvent.ZoneUniqueName})");
            }

            await webSocketServer.BroadcastZoneAsync(resolvedZoneName, packet.Timestamp, cancellation.Token);
        }
    }
}
catch (OperationCanceledException)
{
}
finally
{
    cancellation.Cancel();
    await serverTask.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
}

static string FormatOperationCounts(IReadOnlyDictionary<string, int> counts, int limit = 12)
{
    return string.Join(", ", counts
        .OrderByDescending(pair => pair.Value)
        .ThenBy(pair => pair.Key)
        .Take(limit)
        .Select(pair => $"{pair.Key}={pair.Value}"));
}

static string FormatEndpoint(CapturedPacket packet)
{
    return $"{packet.SourceAddress}:{packet.SourcePort}->{packet.DestinationAddress}:{packet.DestinationPort}";
}

static string NormalizeWarning(string warning)
{
    var payloadIndex = warning.IndexOf(" payload=", StringComparison.Ordinal);
    var normalized = payloadIndex >= 0 ? warning[..payloadIndex] : warning;
    return TrimForLog(normalized, 80);
}

static bool ShouldPrintParameterDetails(PhotonMessage message)
{
    return message.Kind switch
    {
        PhotonMessageKind.Response => message.Code != 1
            || message.Code is PhotonConstants.JoinOperationCode
                or PhotonConstants.ChangeClusterOperationCode
                or PhotonConstants.LegacyChangeClusterOperationCode
            || message.Parameters.ContainsKey(8)
            || message.Parameters.ContainsKey(65),
        PhotonMessageKind.Request => message.Code is PhotonConstants.JoinOperationCode
            or PhotonConstants.GetGameServerByClusterOperationCode
            or PhotonConstants.ChangeClusterOperationCode,
        PhotonMessageKind.Event => message.Code != 3,
        _ => false
    };
}

static string FormatParameters(IReadOnlyDictionary<byte, object?> parameters)
{
    return string.Join("; ", parameters.OrderBy(pair => pair.Key).Select(pair => $"p{pair.Key}={FormatValue(pair.Value)}"));
}

static string FormatValue(object? value)
{
    return value switch
    {
        null => "null",
        string text => Quote(TrimForLog(text, 96)),
        byte[] bytes => $"byte[{bytes.Length}]",
        Protocol18CustomValue custom => $"custom[{custom.TypeCode}:{custom.Data.Length}]",
        IReadOnlyDictionary<byte, object?> table => $"{{{FormatParameters(table)}}}",
        IDictionary<object, object?> dictionary => $"{{{string.Join("; ", dictionary.Take(8).Select(pair => $"{FormatValue(pair.Key)}={FormatValue(pair.Value)}"))}}}",
        IEnumerable<object?> values => $"[{string.Join(", ", values.Take(8).Select(FormatValue))}]",
        _ => Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty
    };
}

static IEnumerable<string> FindStringCandidates(IReadOnlyDictionary<byte, object?> parameters)
{
    foreach (var (key, value) in parameters.OrderBy(pair => pair.Key))
    {
        foreach (var candidate in FindStringCandidatesInValue(value, $"p{key}"))
        {
            yield return candidate;
        }
    }
}

static IEnumerable<string> FindStringCandidatesInValue(object? value, string path)
{
    switch (value)
    {
        case string text when !string.IsNullOrWhiteSpace(text):
            yield return $"{path}={Quote(TrimForLog(text.Trim(), 96))}";
            break;
        case IReadOnlyDictionary<byte, object?> table:
        {
            foreach (var (key, nested) in table.OrderBy(pair => pair.Key))
            {
                foreach (var candidate in FindStringCandidatesInValue(nested, $"{path}.p{key}"))
                {
                    yield return candidate;
                }
            }
            break;
        }
        case IDictionary<object, object?> dictionary:
        {
            var index = 0;
            foreach (var nested in dictionary.Values)
            {
                foreach (var candidate in FindStringCandidatesInValue(nested, $"{path}.{index}"))
                {
                    yield return candidate;
                }

                index++;
            }
            break;
        }
        case IEnumerable<object?> values:
        {
            var index = 0;
            foreach (var nested in values)
            {
                foreach (var candidate in FindStringCandidatesInValue(nested, $"{path}[{index}]"))
                {
                    yield return candidate;
                }

                index++;
            }
            break;
        }
    }
}

static string TrimForLog(string value, int maxLength)
{
    return value.Length <= maxLength ? value : string.Concat(value.AsSpan(0, maxLength - 3), "...");
}

static string Quote(string value)
{
    return $"\"{value.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";
}
