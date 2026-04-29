using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using AoMapper.Sniffer.Core.WebSockets;

namespace AoMapper.Sniffer.App;

public sealed class SnifferWebSocketServer : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly TcpListener _listener;
    private readonly ConcurrentDictionary<Guid, WebSocket> _clients = [];
    private readonly string _captureProvider;
    private readonly string _version;

    public SnifferWebSocketServer(string host, int port, string captureProvider)
    {
        _captureProvider = captureProvider;
        _version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";
        _listener = new TcpListener(IPAddress.Parse(host), port);
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        _listener.Start();
        using var registration = cancellationToken.Register(() => _listener.Stop());

        while (!cancellationToken.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await _listener.AcceptTcpClientAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (SocketException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            _ = Task.Run(() => HandleClientAsync(client, cancellationToken), cancellationToken);
        }
    }

    public Task BroadcastZoneAsync(string zoneUniqueName, DateTimeOffset timestamp, CancellationToken cancellationToken)
    {
        return BroadcastAsync(PhotonEventMessage.ZoneCurrent(zoneUniqueName, timestamp), cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        _listener.Stop();
        foreach (var socket in _clients.Values)
        {
            socket.Dispose();
        }
        await Task.CompletedTask;
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        await using var stream = client.GetStream();
        var webSocketKey = await ReadWebSocketKeyAsync(stream, cancellationToken);
        if (webSocketKey is null)
        {
            return;
        }

        await WriteHandshakeAsync(stream, webSocketKey, cancellationToken);
        using var socket = WebSocket.CreateFromStream(stream, true, null, TimeSpan.FromMinutes(2));
        var id = Guid.NewGuid();
        _clients[id] = socket;

        await SendAsync(socket, StatusMessage.Create(_captureProvider, _version), cancellationToken);
        await DrainAsync(socket, cancellationToken);
        _clients.TryRemove(id, out _);
    }

    private static async Task<string?> ReadWebSocketKeyAsync(NetworkStream stream, CancellationToken cancellationToken)
    {
        var buffer = new byte[4096];
        var length = await stream.ReadAsync(buffer, cancellationToken);
        if (length == 0)
        {
            return null;
        }

        var request = Encoding.ASCII.GetString(buffer, 0, length);
        if (!request.StartsWith("GET /ws", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        foreach (var line in request.Split("\r\n", StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = line.IndexOf(':', StringComparison.Ordinal);
            if (separator <= 0)
            {
                continue;
            }

            var name = line[..separator].Trim();
            if (name.Equals("Sec-WebSocket-Key", StringComparison.OrdinalIgnoreCase))
            {
                return line[(separator + 1)..].Trim();
            }
        }

        return null;
    }

    private static Task WriteHandshakeAsync(NetworkStream stream, string webSocketKey, CancellationToken cancellationToken)
    {
        const string websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        var acceptBytes = SHA1.HashData(Encoding.ASCII.GetBytes(webSocketKey + websocketGuid));
        var accept = Convert.ToBase64String(acceptBytes);
        var response = string.Concat(
            "HTTP/1.1 101 Switching Protocols\r\n",
            "Connection: Upgrade\r\n",
            "Upgrade: websocket\r\n",
            "Sec-WebSocket-Accept: ",
            accept,
            "\r\n\r\n");
        return stream.WriteAsync(Encoding.ASCII.GetBytes(response), cancellationToken).AsTask();
    }

    private static async Task DrainAsync(WebSocket socket, CancellationToken cancellationToken)
    {
        var buffer = new byte[256];
        while (!cancellationToken.IsCancellationRequested && socket.State == WebSocketState.Open)
        {
            var result = await socket.ReceiveAsync(buffer, cancellationToken);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "closing", cancellationToken);
                break;
            }
        }
    }

    private async Task BroadcastAsync<T>(T message, CancellationToken cancellationToken)
    {
        foreach (var (id, socket) in _clients)
        {
            if (socket.State != WebSocketState.Open)
            {
                _clients.TryRemove(id, out _);
                continue;
            }

            await SendAsync(socket, message, cancellationToken);
        }
    }

    private static Task SendAsync<T>(WebSocket socket, T message, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(message, JsonOptions);
        return socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, cancellationToken);
    }
}
