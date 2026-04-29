using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using AoMapper.Sniffer.App;
using AoMapper.Sniffer.Capture.Windows;
using AoMapper.Sniffer.Core.Capture;
using AoMapper.Sniffer.Core.Mapping;

namespace AoMapper.Sniffer.Tests;

[TestClass]
public sealed class IntegrationTests
{
    [TestMethod]
    public void PipelineExtractsZoneFromCapturedUdpPayload()
    {
        var payload = PacketFixture.ReliablePacket(PacketFixture.JoinResponse("OPEN_WORLD_BLACK_TharcalFissure"));
        var packet = new CapturedPacket(DateTimeOffset.UtcNow, payload, "10.0.0.1", 5055, "10.0.0.2", 5056);

        var events = new SnifferPipeline().Process(packet);

        Assert.HasCount(1, events);
        Assert.AreEqual("OPEN_WORLD_BLACK_TharcalFissure", events[0].ZoneUniqueName);
    }

    [TestMethod]
    public void RawSocketParserDropsFragmentsAndExtractsUdpPayload()
    {
        var udpPayload = PacketFixture.ReliablePacket(PacketFixture.JoinResponse("OPEN_WORLD_BLACK_TharcalFissure"));

        Assert.IsNull(RawSocketCaptureProvider.TryParseIPv4Udp(PacketFixture.IPv4UdpPacket(udpPayload, fragmentOffset: 1)));

        var parsed = RawSocketCaptureProvider.TryParseIPv4Udp(PacketFixture.IPv4UdpPacket(udpPayload));
        Assert.IsNotNull(parsed);
        CollectionAssert.AreEqual(udpPayload, parsed.UdpPayload);
    }

    [TestMethod]
    public async Task WebSocketServerSendsStatusAndZoneEvents()
    {
        var port = 18_401;
        await using var server = new SnifferWebSocketServer("127.0.0.1", port, "test");
        using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var serverTask = server.RunAsync(cancellation.Token);

        using var client = new ClientWebSocket();
        await ConnectWithRetryAsync(client, new Uri($"ws://127.0.0.1:{port}/ws/"), serverTask, cancellation.Token);

        var status = await ReceiveTextAsync(client, cancellation.Token);
        Assert.AreEqual("status", JsonDocument.Parse(status).RootElement.GetProperty("type").GetString());

        await server.BroadcastZoneAsync("OPEN_WORLD_BLACK_TharcalFissure", DateTimeOffset.FromUnixTimeSeconds(1_679_580_125), cancellation.Token);
        var zoneEvent = JsonDocument.Parse(await ReceiveTextAsync(client, cancellation.Token)).RootElement;

        Assert.AreEqual("photonEvent", zoneEvent.GetProperty("type").GetString());
        Assert.AreEqual("zone:current", zoneEvent.GetProperty("data").GetProperty("eventCode").GetString());
        Assert.AreEqual(
            "OPEN_WORLD_BLACK_TharcalFissure",
            zoneEvent.GetProperty("data").GetProperty("parameters").GetProperty("zoneUniqueName").GetString());

        cancellation.Cancel();
        await serverTask.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
    }

    private static async Task<string> ReceiveTextAsync(ClientWebSocket socket, CancellationToken cancellationToken)
    {
        var buffer = new byte[4096];
        var result = await socket.ReceiveAsync(buffer, cancellationToken);
        return Encoding.UTF8.GetString(buffer, 0, result.Count);
    }

    private static async Task ConnectWithRetryAsync(
        ClientWebSocket client,
        Uri uri,
        Task serverTask,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 20; attempt++)
        {
            if (serverTask.IsFaulted)
            {
                await serverTask;
            }

            try
            {
                await client.ConnectAsync(uri, cancellationToken);
                return;
            }
            catch (WebSocketException) when (attempt < 19)
            {
                await Task.Delay(100, cancellationToken);
            }
        }
    }
}
