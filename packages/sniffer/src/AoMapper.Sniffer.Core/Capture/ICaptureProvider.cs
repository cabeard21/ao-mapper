namespace AoMapper.Sniffer.Core.Capture;

public interface ICaptureProvider : IAsyncDisposable
{
    string Name { get; }

    IAsyncEnumerable<CapturedPacket> CaptureAsync(CancellationToken cancellationToken);
}
