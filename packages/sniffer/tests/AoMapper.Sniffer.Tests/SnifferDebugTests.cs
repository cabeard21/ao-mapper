using AoMapper.Sniffer.App;
using AoMapper.Sniffer.Core.Mapping;
using AoMapper.Sniffer.Core.Photon;
using AoMapper.Sniffer.Core.Protocol18;

namespace AoMapper.Sniffer.Tests;

[TestClass]
public sealed class SnifferDebugTests
{
    [TestMethod]
    public void ZoneFocusedDebugIncludesGameServerResponseAsContext()
    {
        var message = new PhotonMessage(PhotonMessageKind.Response, PhotonConstants.GetGameServerByClusterOperationCode, new Dictionary<byte, object?>());

        Assert.IsTrue(SnifferDebug.ShouldPrintZoneFocusedMessage(message, []));
    }

    [TestMethod]
    public void ZoneFocusedDebugSuppressesOrdinaryEvents()
    {
        var message = new PhotonMessage(PhotonMessageKind.Event, 3, new Dictionary<byte, object?>());

        Assert.IsFalse(SnifferDebug.ShouldPrintZoneFocusedMessage(message, []));
    }

    [TestMethod]
    public void ZoneFocusedDebugIncludesKnownZoneCandidateInRequestOrResponse()
    {
        var message = new PhotonMessage(PhotonMessageKind.Response, 999, new Dictionary<byte, object?>());
        var candidates = new[] { new ZoneTokenCandidate("p1", "2308") };

        Assert.IsTrue(SnifferDebug.ShouldPrintZoneFocusedMessage(message, candidates));
    }
}
