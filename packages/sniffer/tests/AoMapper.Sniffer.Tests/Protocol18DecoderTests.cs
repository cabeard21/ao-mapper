using AoMapper.Sniffer.Core.Protocol18;

namespace AoMapper.Sniffer.Tests;

[TestClass]
public sealed class Protocol18DecoderTests
{
    private readonly Protocol18Decoder _decoder = new();

    [TestMethod]
    public void DecodeTypedValueHandlesScalarValues()
    {
        Assert.IsNull(_decoder.DecodeTypedValue([42]));
        Assert.IsTrue((bool)_decoder.DecodeTypedValue([(byte)'o', 1])!);
        Assert.AreEqual((byte)7, _decoder.DecodeTypedValue([(byte)'b', 7]));
        Assert.AreEqual((short)300, _decoder.DecodeTypedValue([4, 44, 1]));
        Assert.AreEqual(42, _decoder.DecodeTypedValue([(byte)'i', 42, 0, 0, 0]));
        Assert.AreEqual(42L, _decoder.DecodeTypedValue([(byte)'l', 42, 0, 0, 0, 0, 0, 0, 0]));
    }

    [TestMethod]
    public void DecodeTypedValueHandlesCompressedNumbersStringsAndCollections()
    {
        var writer = new PacketFixture.ProtocolWriter();
        writer.ObjectArray(
            w => w.CompressedInt(-5),
            w => w.CompressedLong(123456789L),
            w => w.String("OPEN_WORLD_BLACK_TharcalFissure"),
            w => w.ByteArray([1, 2, 3]),
            w => w.Dictionary((w => w.String("key"), w => w.Int(9))));

        var values = (object?[])_decoder.DecodeTypedValue(writer.ToArray())!;
        Assert.AreEqual(-5, values[0]);
        Assert.AreEqual(123456789L, values[1]);
        Assert.AreEqual("OPEN_WORLD_BLACK_TharcalFissure", values[2]);
        CollectionAssert.AreEqual(new byte[] { 1, 2, 3 }, (byte[])values[3]!);
        Assert.AreEqual(9, ((Dictionary<object, object?>)values[4]!)["key"]);
    }

    [TestMethod]
    public void DecodeMessageAddsAlbionOperationParameter()
    {
        var message = _decoder.DecodeMessage(PacketFixture.JoinResponse("OPEN_WORLD_BLACK_TharcalFissure"));

        Assert.IsNotNull(message);
        Assert.AreEqual(PhotonMessageKind.Response, message.Kind);
        Assert.AreEqual(2, message.Parameters[253]);
        Assert.AreEqual("OPEN_WORLD_BLACK_TharcalFissure", message.Parameters[8]);
    }

    [TestMethod]
    public void DecodeTypedValueHandlesFloatArraysAndSlimCustomValues()
    {
        var writer = new PacketFixture.ProtocolWriter();
        writer.ObjectArray(
            w => w.FloatArray(1.5f, -2.25f),
            w => w.SlimCustom(65, [0x20, 0x02]));

        var values = (object?[])_decoder.DecodeTypedValue(writer.ToArray())!;
        CollectionAssert.AreEqual(new[] { 1.5f, -2.25f }, (float[])values[0]!);
        var custom = (Protocol18CustomValue)values[1]!;
        Assert.AreEqual((byte)65, custom.TypeCode);
        CollectionAssert.AreEqual(new byte[] { 0x20, 0x02 }, custom.Data);
    }

    [TestMethod]
    public void DecodeTypedValueHandlesGenericArrays()
    {
        var writer = new PacketFixture.ProtocolWriter();
        writer.ArrayInArray(
            w => w.String("Drybasin Riverbed"),
            w => w.Short(42),
            w => w.ByteArray([1, 2]));

        var values = (object?[])_decoder.DecodeTypedValue(writer.ToArray())!;
        Assert.AreEqual("Drybasin Riverbed", values[0]);
        Assert.AreEqual((short)42, values[1]);
        CollectionAssert.AreEqual(new byte[] { 1, 2 }, (byte[])values[2]!);
    }
}
