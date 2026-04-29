using AoMapper.Sniffer.Capture.Windows;

namespace AoMapper.Sniffer.App;

public sealed record SnifferOptions(string Host, int Port, CaptureProviderMode Provider, bool Debug)
{
    public static SnifferOptions Parse(string[] args)
    {
        var host = "127.0.0.1";
        var port = 10001;
        var provider = CaptureProviderMode.Auto;
        var debug = false;

        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--host" when i + 1 < args.Length:
                    host = args[++i];
                    break;
                case "--port" when i + 1 < args.Length && int.TryParse(args[++i], out var parsedPort):
                    port = parsedPort;
                    break;
                case "--provider" when i + 1 < args.Length:
                    provider = ParseProvider(args[++i]);
                    break;
                case "--debug":
                    debug = true;
                    break;
            }
        }

        return new SnifferOptions(host, port, provider, debug);
    }

    private static CaptureProviderMode ParseProvider(string value)
    {
        return value.ToLowerInvariant() switch
        {
            "npcap" => CaptureProviderMode.Npcap,
            "raw" => CaptureProviderMode.Raw,
            _ => CaptureProviderMode.Auto
        };
    }
}
