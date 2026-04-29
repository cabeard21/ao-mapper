using AoMapper.Sniffer.Core.Capture;

namespace AoMapper.Sniffer.Capture.Windows;

public enum CaptureProviderMode
{
    Auto,
    Npcap,
    Raw
}

public static class CaptureProviderFactory
{
    public static ICaptureProvider Create(CaptureProviderMode mode, Action<string>? debugLog = null)
    {
        return mode switch
        {
            CaptureProviderMode.Npcap => CreateNpcapOrThrow(debugLog),
            CaptureProviderMode.Raw => new RawSocketCaptureProvider(),
            _ => TryCreateNpcap(debugLog) ?? new RawSocketCaptureProvider()
        };
    }

    private static ICaptureProvider CreateNpcapOrThrow(Action<string>? debugLog)
    {
        return TryCreateNpcap(debugLog) ?? throw new InvalidOperationException("Npcap was requested but wpcap.dll was not found.");
    }

    private static ICaptureProvider? TryCreateNpcap(Action<string>? debugLog)
    {
        return NpcapCaptureProvider.IsAvailable ? new NpcapCaptureProvider(debugLog) : null;
    }
}
