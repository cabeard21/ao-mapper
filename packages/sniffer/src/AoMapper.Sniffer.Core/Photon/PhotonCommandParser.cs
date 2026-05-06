using System.Buffers.Binary;

namespace AoMapper.Sniffer.Core.Photon;

public sealed class PhotonCommandParser
{
    private const int HeaderLength = 12;
    private const int CommandPrefixLength = 8;
    private const int ReliableSequenceLength = 4;
    private const int ReliableHeaderLength = CommandPrefixLength + ReliableSequenceLength;
    private const int UnreliableHeaderLength = ReliableHeaderLength + 4;
    private const int FragmentHeaderLength = 20;

    private readonly PhotonFragmentReassembler _fragmentReassembler = new();

    public PhotonParseResult Parse(ReadOnlySpan<byte> packet)
    {
        var warnings = new List<string>();
        var payloads = new List<PhotonPayload>();

        if (packet.Length < HeaderLength)
        {
            return new PhotonParseResult(payloads, ["Photon packet too short."]);
        }

        var flags = packet[2];
        if (flags == PhotonConstants.EncryptedFlag)
        {
            return new PhotonParseResult(payloads, ["Encrypted Photon payload ignored."]);
        }

        var peerId = BinaryPrimitives.ReadUInt16LittleEndian(packet[..2]);
        var commandCount = packet[3];
        var offset = HeaderLength;
        if (flags == PhotonConstants.CrcFlag)
        {
            if (packet.Length < offset + 4)
            {
                return new PhotonParseResult(payloads, ["CRC-protected Photon packet is truncated."]);
            }

            offset += 4;
        }

        for (var i = 0; i < commandCount; i++)
        {
            if (packet.Length - offset < CommandPrefixLength)
            {
                warnings.Add("Photon command header truncated.");
                break;
            }

            var commandType = packet[offset];
            var channelId = packet[offset + 1];
            var commandLength = BinaryPrimitives.ReadInt32BigEndian(packet.Slice(offset + 4, 4));
            if (commandLength < CommandPrefixLength || offset + commandLength > packet.Length)
            {
                warnings.Add($"Photon command length is malformed: type={commandType} offset={offset} commandLength={commandLength} packetLength={packet.Length}.");
                break;
            }

            var command = packet.Slice(offset, commandLength);
            switch (commandType)
            {
                case PhotonConstants.ReliableCommand:
                    if (command.Length < ReliableHeaderLength)
                    {
                        warnings.Add("Reliable Photon command is truncated.");
                        break;
                    }
                    AddMessagePayload(commandType, command[ReliableHeaderLength..], payloads, warnings);
                    break;
                case PhotonConstants.UnreliableCommand:
                    if (command.Length < UnreliableHeaderLength)
                    {
                        warnings.Add("Unreliable Photon command is truncated.");
                        break;
                    }
                    AddMessagePayload(commandType, command[UnreliableHeaderLength..], payloads, warnings);
                    break;
                case PhotonConstants.ReliableFragmentCommand:
                    AddFragmentPayload(peerId, channelId, command, payloads, warnings);
                    break;
            }

            offset += commandLength;
        }

        return new PhotonParseResult(payloads, warnings);
    }

    private static void AddMessagePayload(
        byte commandType,
        ReadOnlySpan<byte> commandPayload,
        ICollection<PhotonPayload> payloads,
        ICollection<string> warnings)
    {
        if (commandPayload.Length < 2)
        {
            warnings.Add("Photon message payload is truncated.");
            return;
        }

        // Photon command payloads carry a serialization/protocol byte before the message type.
        payloads.Add(new PhotonPayload(commandType, commandPayload[1..].ToArray()));
    }

    private void AddFragmentPayload(
        ushort peerId,
        byte channelId,
        ReadOnlySpan<byte> command,
        ICollection<PhotonPayload> payloads,
        ICollection<string> warnings)
    {
        if (command.Length < ReliableHeaderLength + FragmentHeaderLength)
        {
            warnings.Add("Fragmented Photon command is truncated.");
            return;
        }

        var sequenceNumber = BinaryPrimitives.ReadInt32BigEndian(command.Slice(CommandPrefixLength, ReliableSequenceLength));
        var fragment = command[ReliableHeaderLength..];
        var startSequenceNumber = BinaryPrimitives.ReadInt32BigEndian(fragment[..4]);
        var fragmentCount = BinaryPrimitives.ReadInt32BigEndian(fragment.Slice(4, 4));
        var fragmentNumber = BinaryPrimitives.ReadInt32BigEndian(fragment.Slice(8, 4));
        var totalLength = BinaryPrimitives.ReadInt32BigEndian(fragment.Slice(12, 4));
        var fragmentOffset = BinaryPrimitives.ReadInt32BigEndian(fragment.Slice(16, 4));
        var data = fragment[FragmentHeaderLength..].ToArray();

        var completed = _fragmentReassembler.Add(
            new PhotonFragmentKey(peerId, channelId, startSequenceNumber),
            new PhotonFragment(fragmentCount, fragmentNumber, totalLength, fragmentOffset, data));

        if (completed is not null)
        {
            AddMessagePayload(PhotonConstants.ReliableCommand, completed, payloads, warnings);
        }
        else if (fragmentCount <= 0 || totalLength <= 0 || fragmentOffset < 0 || sequenceNumber < 0)
        {
            warnings.Add("Invalid Photon fragment ignored.");
        }
    }
}
