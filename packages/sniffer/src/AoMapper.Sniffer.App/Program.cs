using AoMapper.Sniffer.App;
using AoMapper.Sniffer.Capture.Windows;
using AoMapper.Sniffer.Core.Mapping;
using AoMapper.Sniffer.Core.Photon;
using AoMapper.Sniffer.Core.Protocol18;

var options = SnifferOptions.Parse(args);
Action<string>? debugLog = options.Debug ? message => Console.WriteLine($"[debug] {message}") : null;
await using var captureProvider = CaptureProviderFactory.Create(options.Provider, debugLog);
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
var packetCount = 0;
var photonPayloadCount = 0;
var decodedMessageCount = 0;
var lastStats = DateTimeOffset.UtcNow;

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
            foreach (var warning in result.Warnings)
            {
                Console.WriteLine($"[debug] photon warning: {warning}");
            }

            foreach (var message in result.Messages)
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

            var now = DateTimeOffset.UtcNow;
            if (now - lastStats >= TimeSpan.FromSeconds(5))
            {
                Console.WriteLine($"[debug] stats packets={packetCount} photonPayloads={photonPayloadCount} decodedMessages={decodedMessageCount}");
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

static bool ShouldPrintParameterDetails(PhotonMessage message)
{
    return message.Kind switch
    {
        PhotonMessageKind.Response => message.Code != 1
            || message.Code is PhotonConstants.JoinOperationCode or PhotonConstants.ChangeClusterOperationCode
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
