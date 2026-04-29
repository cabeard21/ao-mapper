using AoMapper.Sniffer.App;

namespace AoMapper.Sniffer.Tests;

[TestClass]
public sealed class ZoneNameResolverTests
{
    [TestMethod]
    public void ResolveMapsWorldIndexToUniqueName()
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.world.json");
        File.WriteAllText(path, """
            [
              { "Index": "4206", "UniqueName": "Tharcal Fissure" },
              { "Index": "0004", "UniqueName": "Swamp Cross" }
            ]
            """);

        try
        {
            var resolver = ZoneNameResolver.FromWorldJson(path);

            Assert.AreEqual("Tharcal Fissure", resolver.Resolve("4206"));
            Assert.AreEqual("Swamp Cross", resolver.Resolve("4"));
            Assert.AreEqual("Forest Cross", resolver.Resolve("Forest Cross"));
        }
        finally
        {
            File.Delete(path);
        }
    }
}
