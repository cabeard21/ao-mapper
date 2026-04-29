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
    public void ExtractPrefersSourceClusterFromJoinResponse()
    {
        var message = _decoder.DecodeMessage(PacketFixture.JoinResponse("CORRUPTED_SOLO_LETHAL", "4206"))!;

        Assert.AreEqual("4206", _extractor.Extract(message)?.ZoneUniqueName);
    }

    [TestMethod]
    public void ExtractProducesZoneFromChangeClusterResponse()
    {
        var message = _decoder.DecodeMessage(PacketFixture.ChangeClusterResponse("OPEN_WORLD_ROYAL_ForestCross"))!;

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
}
