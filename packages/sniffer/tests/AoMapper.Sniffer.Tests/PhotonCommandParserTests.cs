using AoMapper.Sniffer.Core.Photon;

namespace AoMapper.Sniffer.Tests;

[TestClass]
public sealed class PhotonCommandParserTests
{
    [TestMethod]
    public void ParseRejectsShortEncryptedCrcAndMalformedPackets()
    {
        var parser = new PhotonCommandParser();

        Assert.IsEmpty(parser.Parse([1, 2, 3]).Payloads);
        Assert.IsEmpty(parser.Parse(PacketFixture.ReliablePacket([1], PhotonConstants.EncryptedFlag)).Payloads);
        Assert.IsEmpty(parser.Parse(PacketFixture.ReliablePacket([1], PhotonConstants.CrcFlag)).Payloads);

        var malformed = PacketFixture.ReliablePacket([1, 2, 3]);
        malformed[16] = 200;
        Assert.IsEmpty(parser.Parse(malformed).Payloads);
    }

    [TestMethod]
    public void ParseDispatchesReliableAndUnreliablePayloads()
    {
        var parser = new PhotonCommandParser();

        CollectionAssert.AreEqual(new byte[] { 1, 2 }, parser.Parse(PacketFixture.ReliablePacket([1, 2])).Payloads[0].Data);
        CollectionAssert.AreEqual(new byte[] { 3, 4 }, parser.Parse(PacketFixture.UnreliablePacket([3, 4])).Payloads[0].Data);
    }

    [TestMethod]
    public void ParseReassemblesFragmentsAfterAllBytesArrive()
    {
        var parser = new PhotonCommandParser();
        var payload = new byte[] { 10, 11, 12, 13, 14 };

        Assert.IsEmpty(parser.Parse(PacketFixture.FragmentPacket(payload, 1, 2, 3, 2)).Payloads);
        var result = parser.Parse(PacketFixture.FragmentPacket(payload, 0, 2, 0, 3));

        Assert.HasCount(1, result.Payloads);
        CollectionAssert.AreEqual(payload, result.Payloads[0].Data);
    }

    [TestMethod]
    public void ParseDiscardsInvalidFragments()
    {
        var parser = new PhotonCommandParser();

        var packet = PacketFixture.FragmentPacket([1, 2], 0, 1, 0, 1);
        packet[28] = 0;
        packet[29] = 0;
        packet[30] = 0;
        packet[31] = 0;

        Assert.IsEmpty(parser.Parse(packet).Payloads);
    }
}
