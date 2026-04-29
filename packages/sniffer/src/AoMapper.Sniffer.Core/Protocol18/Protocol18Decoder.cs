using System.Buffers.Binary;
using System.Globalization;
using System.Text;
using AoMapper.Sniffer.Core.Photon;

namespace AoMapper.Sniffer.Core.Protocol18;

public sealed class Protocol18Decoder
{
    private const byte CustomTypeSlimStart = 128;
    private const byte CustomTypeSlimEnd = 228;

    public PhotonMessage? DecodeMessage(ReadOnlySpan<byte> payload)
    {
        return TryDecodeMessage(payload, out var message, out _) ? message : null;
    }

    public bool TryDecodeMessage(ReadOnlySpan<byte> payload, out PhotonMessage? message, out string? warning)
    {
        if (payload.Length < 2)
        {
            message = null;
            warning = "Protocol18 payload is too short.";
            return false;
        }

        var reader = new ProtocolReader(payload);
        try
        {
            var messageType = reader.ReadByte();
            message = messageType switch
            {
                2 => DecodeRequest(ref reader),
                3 => DecodeResponse(ref reader),
                4 => DecodeEvent(ref reader),
                _ => null
            };

            warning = message is null ? $"Unsupported Protocol18 message type {messageType}." : null;
            return message is not null;
        }
        catch (Protocol18Exception ex)
        {
            message = null;
            warning = ex.Message;
            return false;
        }
    }

    public object? DecodeTypedValue(ReadOnlySpan<byte> payload)
    {
        var reader = new ProtocolReader(payload);
        return reader.ReadTypedValue();
    }

    private static PhotonMessage DecodeRequest(ref ProtocolReader reader)
    {
        var envelopeCode = reader.ReadByte();
        var parameters = reader.ReadParameterTable();
        return new PhotonMessage(
            PhotonMessageKind.Request,
            ResolveCode(parameters, PhotonConstants.OperationCodeParameter, envelopeCode),
            WithCodeFallback(parameters, PhotonConstants.OperationCodeParameter, envelopeCode));
    }

    private static PhotonMessage DecodeResponse(ref ProtocolReader reader)
    {
        var envelopeCode = reader.ReadByte();
        _ = reader.ReadInt16();
        _ = reader.ReadTypedValue();
        var parameters = reader.ReadParameterTable();
        return new PhotonMessage(
            PhotonMessageKind.Response,
            ResolveCode(parameters, PhotonConstants.OperationCodeParameter, envelopeCode),
            WithCodeFallback(parameters, PhotonConstants.OperationCodeParameter, envelopeCode));
    }

    private static PhotonMessage DecodeEvent(ref ProtocolReader reader)
    {
        var envelopeCode = reader.ReadByte();
        var parameters = reader.ReadParameterTable();
        return new PhotonMessage(
            PhotonMessageKind.Event,
            ResolveCode(parameters, PhotonConstants.EventCodeParameter, envelopeCode),
            WithCodeFallback(parameters, PhotonConstants.EventCodeParameter, envelopeCode));
    }

    private static IReadOnlyDictionary<byte, object?> WithCodeFallback(Dictionary<byte, object?> parameters, byte key, int code)
    {
        if (parameters.ContainsKey(key))
        {
            return parameters;
        }

        var copy = new Dictionary<byte, object?>(parameters)
        {
            [key] = code
        };
        return copy;
    }

    private static int ResolveCode(IReadOnlyDictionary<byte, object?> parameters, byte key, int fallback)
    {
        return parameters.TryGetValue(key, out var value) && TryConvertCode(value, out var code) ? code : fallback;
    }

    private static bool TryConvertCode(object? value, out int code)
    {
        switch (value)
        {
            case byte byteValue:
                code = byteValue;
                return true;
            case short shortValue:
                code = shortValue;
                return true;
            case int intValue:
                code = intValue;
                return true;
            case long longValue when longValue is >= int.MinValue and <= int.MaxValue:
                code = (int)longValue;
                return true;
            case string text when int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed):
                code = parsed;
                return true;
            default:
                code = 0;
                return false;
        }
    }

    private ref struct ProtocolReader(ReadOnlySpan<byte> data)
    {
        private ReadOnlySpan<byte> _data = data;
        private int _offset;

        public byte ReadByte()
        {
            Ensure(1);
            return _data[_offset++];
        }

        public short ReadInt16()
        {
            Ensure(2);
            var value = BinaryPrimitives.ReadInt16LittleEndian(_data.Slice(_offset, 2));
            _offset += 2;
            return value;
        }

        public int ReadInt32()
        {
            Ensure(4);
            var value = BinaryPrimitives.ReadInt32LittleEndian(_data.Slice(_offset, 4));
            _offset += 4;
            return value;
        }

        public long ReadInt64()
        {
            Ensure(8);
            var value = BinaryPrimitives.ReadInt64LittleEndian(_data.Slice(_offset, 8));
            _offset += 8;
            return value;
        }

        public object? ReadTypedValue()
        {
            var typeCode = ReadByte();
            if (typeCode is >= CustomTypeSlimStart and <= CustomTypeSlimEnd)
            {
                return ReadCustomType(typeCode);
            }

            return typeCode switch
            {
                8 or 42 => null,
                2 or (byte)'o' => ReadByte() != 0,
                3 or (byte)'b' => ReadByte(),
                4 or (byte)'k' => ReadInt16(),
                5 => ReadFloat(),
                6 => ReadDouble(),
                9 or (byte)'n' => ReadCompressedInt(),
                10 or (byte)'m' => ReadCompressedLong(),
                11 => ReadSignedByte(signNegative: false),
                12 => ReadSignedByte(signNegative: true),
                13 => ReadInt16WithSign(signNegative: false),
                14 => ReadInt16WithSign(signNegative: true),
                15 => ReadSignedByte(signNegative: false),
                16 => ReadSignedByte(signNegative: true),
                17 => ReadInt16WithSign(signNegative: false),
                18 => ReadInt16WithSign(signNegative: true),
                19 => ReadCustomType(),
                21 or (byte)'h' => ReadHashtable(),
                23 or (byte)'z' => ReadObjectArray(),
                20 => ReadDictionary(),
                27 => false,
                28 => true,
                29 => (short)0,
                30 => 0,
                31 => 0L,
                32 => 0f,
                33 => 0d,
                34 => (byte)0,
                64 => ReadArrayInArray(),
                66 => ReadBooleanArray(),
                7 or (byte)'s' => ReadString(),
                67 or (byte)'x' => ReadByteArray(),
                68 => ReadShortArray(),
                69 => ReadFloatArray(),
                70 => ReadDoubleArray(),
                71 => ReadStringArray(),
                73 => ReadCompressedIntArray(),
                74 => ReadCompressedLongArray(),
                83 => ReadCustomTypeArray(),
                (byte)'i' => ReadInt32(),
                (byte)'l' => ReadInt64(),
                _ => throw new Protocol18Exception($"Unsupported Protocol18 type code {typeCode}.")
            };
        }

        public Dictionary<byte, object?> ReadParameterTable()
        {
            var count = ReadByte();
            var parameters = new Dictionary<byte, object?>(count);
            for (var i = 0; i < count; i++)
            {
                var key = ReadByte();
                parameters[key] = ReadTypedValue();
            }

            return parameters;
        }

        private Dictionary<object, object?> ReadHashtable()
        {
            var count = (int)ReadCompressedUInt32();
            var table = new Dictionary<object, object?>(count);
            for (var i = 0; i < count; i++)
            {
                var key = ReadTypedValue();
                if (key is null)
                {
                    throw new Protocol18Exception("Hashtable keys cannot be null.");
                }
                table[key] = ReadTypedValue();
            }

            return table;
        }

        private string ReadString()
        {
            var length = (int)ReadCompressedUInt32();

            Ensure(length);
            var value = Encoding.UTF8.GetString(_data.Slice(_offset, length));
            _offset += length;
            return value;
        }

        private byte[] ReadByteArray()
        {
            var length = (int)ReadCompressedUInt32();

            Ensure(length);
            var value = _data.Slice(_offset, length).ToArray();
            _offset += length;
            return value;
        }

        private float ReadFloat()
        {
            Ensure(4);
            var value = BinaryPrimitives.ReadSingleLittleEndian(_data.Slice(_offset, 4));
            _offset += 4;
            return value;
        }

        private double ReadDouble()
        {
            Ensure(8);
            var value = BinaryPrimitives.ReadDoubleLittleEndian(_data.Slice(_offset, 8));
            _offset += 8;
            return value;
        }

        private bool[] ReadBooleanArray()
        {
            var count = (int)ReadCompressedUInt32();
            var values = new bool[count];
            for (var i = 0; i < count; i += 8)
            {
                var packed = ReadByte();
                for (var bit = 0; bit < 8 && i + bit < count; bit++)
                {
                    values[i + bit] = (packed & (1 << bit)) != 0;
                }
            }

            return values;
        }

        private short[] ReadShortArray()
        {
            var count = (int)ReadCompressedUInt32();
            var values = new short[count];
            for (var i = 0; i < count; i++)
            {
                values[i] = ReadInt16();
            }

            return values;
        }

        private float[] ReadFloatArray()
        {
            var count = (int)ReadCompressedUInt32();
            var values = new float[count];
            for (var i = 0; i < count; i++)
            {
                values[i] = ReadFloat();
            }

            return values;
        }

        private double[] ReadDoubleArray()
        {
            var count = (int)ReadCompressedUInt32();
            var values = new double[count];
            for (var i = 0; i < count; i++)
            {
                values[i] = ReadDouble();
            }

            return values;
        }

        private string[] ReadStringArray()
        {
            var count = (int)ReadCompressedUInt32();
            var values = new string[count];
            for (var i = 0; i < count; i++)
            {
                values[i] = ReadString();
            }

            return values;
        }

        private int[] ReadCompressedIntArray()
        {
            var count = (int)ReadCompressedUInt32();
            var values = new int[count];
            for (var i = 0; i < count; i++)
            {
                values[i] = ReadCompressedInt();
            }

            return values;
        }

        private long[] ReadCompressedLongArray()
        {
            var count = (int)ReadCompressedUInt32();
            var values = new long[count];
            for (var i = 0; i < count; i++)
            {
                values[i] = ReadCompressedLong();
            }

            return values;
        }

        private Protocol18CustomValue ReadCustomType(byte? slimTypeCode = null)
        {
            var typeCode = slimTypeCode.HasValue ? (byte)(slimTypeCode.Value - CustomTypeSlimStart) : ReadByte();
            var length = (int)ReadCompressedUInt32();
            Ensure(length);
            var data = _data.Slice(_offset, length).ToArray();
            _offset += length;
            return new Protocol18CustomValue(typeCode, data);
        }

        private Protocol18CustomValue[] ReadCustomTypeArray()
        {
            var count = (int)ReadCompressedUInt32();
            var typeCode = ReadByte();
            var values = new Protocol18CustomValue[count];
            for (var i = 0; i < count; i++)
            {
                var length = (int)ReadCompressedUInt32();
                Ensure(length);
                var data = _data.Slice(_offset, length).ToArray();
                _offset += length;
                values[i] = new Protocol18CustomValue(typeCode, data);
            }

            return values;
        }

        private object?[] ReadArrayInArray()
        {
            var count = (int)ReadCompressedUInt32();
            var values = new object?[count];
            for (var i = 0; i < count; i++)
            {
                values[i] = ReadTypedValue();
            }

            return values;
        }

        private object?[] ReadObjectArray()
        {
            var count = (int)ReadCompressedUInt32();

            var values = new object?[count];
            for (var i = 0; i < count; i++)
            {
                values[i] = ReadTypedValue();
            }

            return values;
        }

        private Dictionary<object, object?> ReadDictionary()
        {
            _ = ReadByte();
            _ = ReadByte();
            var count = (int)ReadCompressedUInt32();

            var dictionary = new Dictionary<object, object?>(count);
            for (var i = 0; i < count; i++)
            {
                var key = ReadTypedValue();
                if (key is null)
                {
                    throw new Protocol18Exception("Dictionary keys cannot be null.");
                }
                dictionary[key] = ReadTypedValue();
            }

            return dictionary;
        }

        private int ReadCompressedInt()
        {
            var unsigned = ReadCompressedUInt64();
            return (int)((unsigned >> 1) ^ (ulong)-(long)(unsigned & 1));
        }

        private long ReadCompressedLong()
        {
            var unsigned = ReadCompressedUInt64();
            return (long)((unsigned >> 1) ^ (ulong)-(long)(unsigned & 1));
        }

        private uint ReadCompressedUInt32()
        {
            return (uint)ReadCompressedUInt64();
        }

        private ulong ReadCompressedUInt64()
        {
            ulong result = 0;
            var shift = 0;
            while (shift < 64)
            {
                var current = ReadByte();
                result |= (ulong)(current & 0x7f) << shift;
                if ((current & 0x80) == 0)
                {
                    return result;
                }
                shift += 7;
            }

            throw new Protocol18Exception("Compressed integer is too long.");
        }

        private int ReadSignedByte(bool signNegative)
        {
            var value = ReadByte();
            return signNegative ? -value : value;
        }

        private int ReadInt16WithSign(bool signNegative)
        {
            var value = ReadInt16();
            return signNegative ? -value : value;
        }

        private void Ensure(int length)
        {
            if (length < 0 || _offset + length > _data.Length)
            {
                throw new Protocol18Exception("Protocol18 payload is truncated.");
            }
        }
    }
}

public sealed class Protocol18Exception(string message) : Exception(message);
