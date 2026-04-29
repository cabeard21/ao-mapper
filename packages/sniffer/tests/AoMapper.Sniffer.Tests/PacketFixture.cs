using System.Buffers.Binary;
using System.Text;
using AoMapper.Sniffer.Core.Photon;

namespace AoMapper.Sniffer.Tests;

internal static class PacketFixture
{
    public static byte[] ReliablePacket(byte[] payload, byte flags = 0, byte commandCount = 1)
    {
        var commandLength = 13 + payload.Length;
        var packet = new byte[12 + commandLength];
        BinaryPrimitives.WriteUInt16LittleEndian(packet.AsSpan(0, 2), 1);
        packet[2] = flags;
        packet[3] = commandCount;
        packet[12] = PhotonConstants.ReliableCommand;
        packet[13] = 0;
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(16, 4), commandLength);
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(20, 4), 10);
        packet[24] = 0xf3;
        payload.CopyTo(packet.AsSpan(25));
        return packet;
    }

    public static byte[] UnreliablePacket(byte[] payload)
    {
        var commandLength = 17 + payload.Length;
        var packet = new byte[12 + commandLength];
        BinaryPrimitives.WriteUInt16LittleEndian(packet.AsSpan(0, 2), 1);
        packet[3] = 1;
        packet[12] = PhotonConstants.UnreliableCommand;
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(16, 4), commandLength);
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(20, 4), 11);
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(24, 4), 22);
        packet[28] = 0xf3;
        payload.CopyTo(packet.AsSpan(29));
        return packet;
    }

    public static byte[] FragmentPacket(byte[] payload, int fragmentNumber, int fragmentCount, int offset, int length)
    {
        var framedPayload = new byte[payload.Length + 1];
        framedPayload[0] = 0xf3;
        payload.CopyTo(framedPayload.AsSpan(1));
        var framedOffset = offset == 0 ? 0 : offset + 1;
        var framedLength = offset == 0 ? length + 1 : length;
        var fragmentData = framedPayload.AsSpan(framedOffset, framedLength);
        var commandLength = 32 + fragmentData.Length;
        var packet = new byte[12 + commandLength];
        BinaryPrimitives.WriteUInt16LittleEndian(packet.AsSpan(0, 2), 1);
        packet[3] = 1;
        packet[12] = PhotonConstants.ReliableFragmentCommand;
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(16, 4), commandLength);
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(20, 4), 100 + fragmentNumber);
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(24, 4), 100);
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(28, 4), fragmentCount);
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(32, 4), fragmentNumber);
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(36, 4), framedPayload.Length);
        BinaryPrimitives.WriteInt32BigEndian(packet.AsSpan(40, 4), framedOffset);
        fragmentData.CopyTo(packet.AsSpan(44));
        return packet;
    }

    public static byte[] IPv4UdpPacket(byte[] udpPayload, int sourcePort = 5055, int destinationPort = 5056, ushort fragmentOffset = 0)
    {
        var udpLength = 8 + udpPayload.Length;
        var packet = new byte[20 + udpLength];
        packet[0] = 0x45;
        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(2, 2), (ushort)packet.Length);
        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(6, 2), fragmentOffset);
        packet[8] = 64;
        packet[9] = 17;
        packet[12] = 10;
        packet[13] = 0;
        packet[14] = 0;
        packet[15] = 1;
        packet[16] = 10;
        packet[17] = 0;
        packet[18] = 0;
        packet[19] = 2;
        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(20, 2), (ushort)sourcePort);
        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(22, 2), (ushort)destinationPort);
        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(24, 2), (ushort)udpLength);
        udpPayload.CopyTo(packet.AsSpan(28));
        return packet;
    }

    public static byte[] JoinResponse(string zoneUniqueName)
    {
        var writer = new ProtocolWriter();
        writer.Byte(3);
        writer.Byte(PhotonConstants.JoinOperationCode);
        writer.Int16Little(0);
        writer.Null();
        writer.ParameterTable(new Dictionary<byte, Action<ProtocolWriter>>
        {
            [8] = w => w.String(zoneUniqueName)
        });
        return writer.ToArray();
    }

    public static byte[] JoinResponse(string mapIndex, string sourceClusterIndex)
    {
        var writer = new ProtocolWriter();
        writer.Byte(3);
        writer.Byte(PhotonConstants.JoinOperationCode);
        writer.Int16Little(0);
        writer.Null();
        writer.ParameterTable(new Dictionary<byte, Action<ProtocolWriter>>
        {
            [8] = w => w.String(mapIndex),
            [65] = w => w.String(sourceClusterIndex)
        });
        return writer.ToArray();
    }

    public static byte[] ChangeClusterResponse(string zoneUniqueName)
    {
        var writer = new ProtocolWriter();
        writer.Byte(3);
        writer.Byte(PhotonConstants.ChangeClusterOperationCode);
        writer.Int16Little(0);
        writer.Null();
        writer.ParameterTable(new Dictionary<byte, Action<ProtocolWriter>>
        {
            [0] = w => w.String(zoneUniqueName)
        });
        return writer.ToArray();
    }

    public static byte[] AlbionChangeClusterResponse(string zoneIndex)
    {
        var writer = new ProtocolWriter();
        writer.Byte(3);
        writer.Byte(1);
        writer.Int16Little(0);
        writer.Null();
        writer.ParameterTable(new Dictionary<byte, Action<ProtocolWriter>>
        {
            [0] = w => w.String(zoneIndex),
            [253] = w => w.CompressedInt(PhotonConstants.ChangeClusterOperationCode)
        });
        return writer.ToArray();
    }

    public static byte[] GetGameServerByClusterRequest(string zoneIndex)
    {
        var writer = new ProtocolWriter();
        writer.Byte(2);
        writer.Byte(1);
        writer.ParameterTable(new Dictionary<byte, Action<ProtocolWriter>>
        {
            [0] = w => w.String(zoneIndex),
            [253] = w => w.CompressedInt(PhotonConstants.GetGameServerByClusterOperationCode)
        });
        return writer.ToArray();
    }

    public sealed class ProtocolWriter
    {
        private readonly List<byte> _bytes = [];

        public void Byte(byte value) => _bytes.Add(value);

        public void Null() => Byte(42);

        public void Bool(bool value)
        {
            Byte(2);
            Byte(value ? (byte)1 : (byte)0);
        }

        public void RawByte(byte value)
        {
            Byte(3);
            Byte(value);
        }

        public void Int16(short value)
        {
            Span<byte> buffer = stackalloc byte[2];
            BinaryPrimitives.WriteInt16BigEndian(buffer, value);
            _bytes.AddRange(buffer.ToArray());
        }

        public void Short(short value)
        {
            Byte(4);
            Int16Little(value);
        }

        public void Int(int value)
        {
            Byte((byte)'i');
            Span<byte> buffer = stackalloc byte[4];
            BinaryPrimitives.WriteInt32LittleEndian(buffer, value);
            _bytes.AddRange(buffer.ToArray());
        }

        public void Long(long value)
        {
            Byte((byte)'l');
            Span<byte> buffer = stackalloc byte[8];
            BinaryPrimitives.WriteInt64LittleEndian(buffer, value);
            _bytes.AddRange(buffer.ToArray());
        }

        public void CompressedInt(int value)
        {
            Byte(9);
            VarUInt((uint)((value << 1) ^ (value >> 31)));
        }

        public void CompressedLong(long value)
        {
            Byte(10);
            VarUInt((ulong)((value << 1) ^ (value >> 63)));
        }

        public void String(string value)
        {
            Byte(7);
            var encoded = Encoding.UTF8.GetBytes(value);
            VarUInt((uint)encoded.Length);
            _bytes.AddRange(encoded);
        }

        public void ByteArray(byte[] value)
        {
            Byte(67);
            VarUInt((uint)value.Length);
            _bytes.AddRange(value);
        }

        public void FloatArray(params float[] values)
        {
            Byte(69);
            VarUInt((uint)values.Length);
            Span<byte> buffer = stackalloc byte[4];
            foreach (var value in values)
            {
                BinaryPrimitives.WriteSingleLittleEndian(buffer, value);
                _bytes.AddRange(buffer.ToArray());
            }
        }

        public void SlimCustom(byte typeCode, byte[] value)
        {
            Byte((byte)(128 + typeCode));
            VarUInt((uint)value.Length);
            _bytes.AddRange(value);
        }

        public void ObjectArray(params Action<ProtocolWriter>[] values)
        {
            Byte(23);
            VarUInt((uint)values.Length);
            foreach (var value in values)
            {
                value(this);
            }
        }

        public void ArrayInArray(params Action<ProtocolWriter>[] values)
        {
            Byte(64);
            VarUInt((uint)values.Length);
            foreach (var value in values)
            {
                value(this);
            }
        }

        public void Dictionary(params (Action<ProtocolWriter> Key, Action<ProtocolWriter> Value)[] values)
        {
            Byte(20);
            Byte(0);
            Byte(0);
            VarUInt((uint)values.Length);
            foreach (var (key, value) in values)
            {
                key(this);
                value(this);
            }
        }

        public void ParameterTable(Dictionary<byte, Action<ProtocolWriter>> parameters)
        {
            Byte((byte)parameters.Count);
            foreach (var (key, value) in parameters)
            {
                Byte(key);
                value(this);
            }
        }

        public byte[] ToArray() => [.. _bytes];

        public void Int16Little(short value)
        {
            Span<byte> buffer = stackalloc byte[2];
            BinaryPrimitives.WriteInt16LittleEndian(buffer, value);
            _bytes.AddRange(buffer.ToArray());
        }

        private void VarUInt(ulong value)
        {
            while (value >= 0x80)
            {
                Byte((byte)(value | 0x80));
                value >>= 7;
            }
            Byte((byte)value);
        }
    }
}
