using AoMapper.Sniffer.Core.Mapping;
using AoMapper.Sniffer.Core.Photon;
using AoMapper.Sniffer.Core.Protocol18;

namespace AoMapper.Sniffer.Tests;

[TestClass]
public sealed class ZoneEventExtractorTests
{
    private readonly Protocol18Decoder _decoder = new();
    private readonly ZoneEventExtractor _extractor = new();

    [TestMethod]
    public void ExtractProducesZoneFromJoinResponse()
    {
        var message = _decoder.DecodeMessage(PacketFixture.JoinResponse("OPEN_WORLD_BLACK_TharcalFissure"))!;

        Assert.AreEqual("OPEN_WORLD_BLACK_TharcalFissure", _extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractPrefersCurrentMapFromJoinResponse()
    {
        var message = _decoder.DecodeMessage(PacketFixture.JoinResponse("CORRUPTED_SOLO_LETHAL", "4206"))!;

        Assert.AreEqual("CORRUPTED_SOLO_LETHAL", _extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractProducesZoneFromChangeClusterResponse()
    {
        var message = _decoder.DecodeMessage(PacketFixture.ChangeClusterResponse("OPEN_WORLD_ROYAL_ForestCross"))!;

        Assert.AreEqual("OPEN_WORLD_ROYAL_ForestCross", _extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractProducesZoneFromLegacyChangeClusterResponse()
    {
        var message = _decoder.DecodeMessage(PacketFixture.ChangeClusterResponse(
            "OPEN_WORLD_ROYAL_ForestCross",
            PhotonConstants.LegacyChangeClusterOperationCode))!;

        Assert.AreEqual(PhotonConstants.LegacyChangeClusterOperationCode, message.Code);
        Assert.AreEqual("OPEN_WORLD_ROYAL_ForestCross", _extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractProducesNonPrefixedMapIndexFromChangeClusterResponse()
    {
        var message = _decoder.DecodeMessage(PacketFixture.ChangeClusterResponse("4206"))!;

        Assert.AreEqual("4206", _extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractUsesOperationCodeParameterFromAlbionResponse()
    {
        var message = _decoder.DecodeMessage(PacketFixture.AlbionChangeClusterResponse("4206"))!;

        Assert.AreEqual(PhotonConstants.ChangeClusterOperationCode, message.Code);
        Assert.AreEqual("4206", _extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractProducesZoneFromGetGameServerByClusterRequest()
    {
        var message = _decoder.DecodeMessage(PacketFixture.GetGameServerByClusterRequest("4206"))!;

        Assert.AreEqual(PhotonConstants.GetGameServerByClusterOperationCode, message.Code);
        Assert.AreEqual("4206", _extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractProducesKnownZoneTokenFromVersionShiftedResponse()
    {
        var extractor = new ZoneEventExtractor(token => token == "2308");
        var message = new PhotonMessage(PhotonMessageKind.Response, 41, new Dictionary<byte, object?>
        {
            [0] = "2308",
            [253] = 41
        });

        Assert.AreEqual("2308", extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractProducesKnownZoneTokenFromTravelPlannerResponse()
    {
        var extractor = new ZoneEventExtractor(token => token == "2308");
        var message = _decoder.DecodeMessage(PacketFixture.OperationResponse(
            PhotonConstants.BuyJourneyOperationCode,
            new Dictionary<byte, Action<PacketFixture.ProtocolWriter>>
            {
                [3] = w => w.String("2308")
            }))!;

        Assert.AreEqual(PhotonConstants.BuyJourneyOperationCode, message.Code);
        Assert.AreEqual("2308", extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractProducesKnownZoneTokenFromTeleportBackRequest()
    {
        var extractor = new ZoneEventExtractor(token => token == "2308");
        var message = _decoder.DecodeMessage(PacketFixture.OperationRequest(
            PhotonConstants.TeleportBackOperationCode,
            new Dictionary<byte, Action<PacketFixture.ProtocolWriter>>
            {
                [1] = w => w.String("2308")
            }))!;

        Assert.AreEqual(PhotonConstants.TeleportBackOperationCode, message.Code);
        Assert.AreEqual("2308", extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractIgnoresUnknownTravelPlannerResponseStrings()
    {
        var extractor = new ZoneEventExtractor(token => token == "2308");
        var message = _decoder.DecodeMessage(PacketFixture.OperationResponse(
            PhotonConstants.BuyJourneyOperationCode,
            new Dictionary<byte, Action<PacketFixture.ProtocolWriter>>
            {
                [3] = w => w.String("ADCSEASON_04@2026")
            }))!;

        Assert.IsNull(extractor.Extract(message));
    }

    [TestMethod]
    public void ExtractIgnoresKnownZoneTokenFromUnrelatedResponse()
    {
        var extractor = new ZoneEventExtractor(token => token == "1207");
        var message = new PhotonMessage(PhotonMessageKind.Response, 197, new Dictionary<byte, object?>
        {
            [0] = "1207",
            [253] = 197
        });

        Assert.IsNull(extractor.Extract(message));
    }

    [TestMethod]
    public void ExtractIgnoresUnknownResponseStrings()
    {
        var extractor = new ZoneEventExtractor(token => token == "2308");
        var message = new PhotonMessage(PhotonMessageKind.Response, 369, new Dictionary<byte, object?>
        {
            [0] = "ADCSEASON_04@2026",
            [253] = 369
        });

        Assert.IsNull(extractor.Extract(message));
    }

    [TestMethod]
    public void ExtractIgnoresZoneLikeStringsFromUnrelatedEvents()
    {
        var message = new PhotonMessage(PhotonMessageKind.Event, 99, new Dictionary<byte, object?>
        {
            [1] = new object?[] { "not a zone", "CORRUPTED_SOLO_LETHAL" }
        });

        Assert.IsNull(_extractor.Extract(message));
    }

    [TestMethod]
    public void ExtractIgnoresGameServerResponseWithoutKnownZoneToken()
    {
        var extractor = new ZoneEventExtractor(token => token == "2308");
        var message = new PhotonMessage(PhotonMessageKind.Response, PhotonConstants.GetGameServerByClusterOperationCode, new Dictionary<byte, object?>
        {
            [0] = "live01-win-15.dc02.albiononline.com:5056",
            [253] = PhotonConstants.GetGameServerByClusterOperationCode
        });

        Assert.IsNull(extractor.Extract(message));
    }

    [TestMethod]
    public void ExtractIgnoresGameServerResponseStatusEvenWhenItMatchesKnownZoneIndex()
    {
        var extractor = new ZoneEventExtractor(token => token == "6");
        var message = new PhotonMessage(PhotonMessageKind.Response, PhotonConstants.GetGameServerByClusterOperationCode, new Dictionary<byte, object?>
        {
            [0] = "live01-win-45.dc02.albiononline.com:5056",
            [253] = PhotonConstants.GetGameServerByClusterOperationCode,
            [255] = 6
        });

        Assert.IsNull(extractor.Extract(message));
        Assert.HasCount(0, extractor.FindKnownZoneCandidates(message));
    }

    [TestMethod]
    public void ExtractProducesKnownZoneTokenFromGameServerResponse()
    {
        var extractor = new ZoneEventExtractor(token => token == "2308");
        var message = new PhotonMessage(PhotonMessageKind.Response, PhotonConstants.GetGameServerByClusterOperationCode, new Dictionary<byte, object?>
        {
            [0] = "live01-win-15.dc02.albiononline.com:5056",
            [1] = "2308",
            [253] = PhotonConstants.GetGameServerByClusterOperationCode
        });

        Assert.AreEqual("2308", extractor.Extract(message)?.ZoneUniqueName);
    }
}
