using System.Text.Json;

namespace AoMapper.Sniffer.App;

public sealed class ZoneNameResolver
{
    private readonly IReadOnlyDictionary<string, string> _namesByToken;

    public ZoneNameResolver(IReadOnlyDictionary<string, string> namesByToken)
    {
        _namesByToken = namesByToken;
    }

    public string Resolve(string token)
    {
        var trimmed = token.Trim();
        return _namesByToken.TryGetValue(trimmed, out var uniqueName) ? uniqueName : trimmed;
    }

    public bool Contains(string token)
    {
        return _namesByToken.ContainsKey(token.Trim());
    }

    public static ZoneNameResolver CreateDefault(Action<string>? debugLog = null)
    {
        var path = FindWorldJsonPath();
        if (path is null)
        {
            debugLog?.Invoke("zone resolver disabled: refs/ao-bin-dumps/formatted/world.json was not found.");
            return new ZoneNameResolver(new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase));
        }

        try
        {
            var resolver = FromWorldJson(path);
            debugLog?.Invoke($"zone resolver loaded {resolver._namesByToken.Count} token(s) from {path}.");
            return resolver;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            debugLog?.Invoke($"zone resolver disabled: {ex.Message}");
            return new ZoneNameResolver(new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase));
        }
    }

    public static ZoneNameResolver FromWorldJson(string path)
    {
        using var stream = File.OpenRead(path);
        using var document = JsonDocument.Parse(stream);
        var namesByToken = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in document.RootElement.EnumerateArray())
        {
            if (!TryGetString(entry, "UniqueName", out var uniqueName))
            {
                continue;
            }

            AddToken(namesByToken, uniqueName, uniqueName);
            if (TryGetString(entry, "Index", out var index))
            {
                AddToken(namesByToken, index, uniqueName);
                AddToken(namesByToken, index.TrimStart('0'), uniqueName);
            }
        }

        return new ZoneNameResolver(namesByToken);
    }

    private static string? FindWorldJsonPath()
    {
        foreach (var root in CandidateRoots())
        {
            var path = Path.Combine(root, "refs", "ao-bin-dumps", "formatted", "world.json");
            if (File.Exists(path))
            {
                return path;
            }
        }

        return null;
    }

    private static IEnumerable<string> CandidateRoots()
    {
        yield return Environment.CurrentDirectory;

        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            yield return directory.FullName;
            directory = directory.Parent;
        }
    }

    private static bool TryGetString(JsonElement element, string propertyName, out string value)
    {
        value = string.Empty;
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var text = property.GetString()?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        value = text;
        return true;
    }

    private static void AddToken(Dictionary<string, string> namesByToken, string token, string uniqueName)
    {
        var normalized = token.Trim();
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            namesByToken.TryAdd(normalized, uniqueName);
        }
    }
}
