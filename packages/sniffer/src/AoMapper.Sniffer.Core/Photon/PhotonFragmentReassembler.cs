namespace AoMapper.Sniffer.Core.Photon;

public sealed record PhotonFragmentKey(ushort PeerId, byte ChannelId, int StartSequenceNumber);

public sealed record PhotonFragment(int FragmentCount, int FragmentNumber, int TotalLength, int Offset, byte[] Data);

public sealed class PhotonFragmentReassembler
{
    private readonly Dictionary<PhotonFragmentKey, FragmentSet> _fragments = [];

    public byte[]? Add(PhotonFragmentKey key, PhotonFragment fragment)
    {
        if (!IsValid(fragment))
        {
            return null;
        }

        if (!_fragments.TryGetValue(key, out var set))
        {
            set = new FragmentSet(fragment.FragmentCount, fragment.TotalLength);
            _fragments[key] = set;
        }

        if (set.FragmentCount != fragment.FragmentCount || set.TotalLength != fragment.TotalLength)
        {
            _fragments.Remove(key);
            return null;
        }

        if (!set.Add(fragment))
        {
            return null;
        }

        if (!set.IsComplete)
        {
            return null;
        }

        _fragments.Remove(key);
        return set.ToArray();
    }

    private static bool IsValid(PhotonFragment fragment)
    {
        return fragment.FragmentCount > 0
            && fragment.FragmentNumber >= 0
            && fragment.FragmentNumber < fragment.FragmentCount
            && fragment.TotalLength > 0
            && fragment.Offset >= 0
            && fragment.Data.Length > 0
            && fragment.Offset + fragment.Data.Length <= fragment.TotalLength;
    }

    private sealed class FragmentSet(int fragmentCount, int totalLength)
    {
        private readonly byte[] _buffer = new byte[totalLength];
        private readonly bool[] _seen = new bool[fragmentCount];

        public int FragmentCount { get; } = fragmentCount;
        public int TotalLength { get; } = totalLength;

        public bool IsComplete => _seen.All(static seen => seen);

        public bool Add(PhotonFragment fragment)
        {
            if (_seen[fragment.FragmentNumber])
            {
                return false;
            }

            fragment.Data.CopyTo(_buffer.AsSpan(fragment.Offset));
            _seen[fragment.FragmentNumber] = true;
            return true;
        }

        public byte[] ToArray() => [.. _buffer];
    }
}
