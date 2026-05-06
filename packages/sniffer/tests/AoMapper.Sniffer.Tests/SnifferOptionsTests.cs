using AoMapper.Sniffer.App;
using AoMapper.Sniffer.Capture.Windows;

namespace AoMapper.Sniffer.Tests;

[TestClass]
public sealed class SnifferOptionsTests
{
    [TestMethod]
    public void ParseDebugZoneEnablesFocusedDebug()
    {
        var options = SnifferOptions.Parse(["--provider", "raw", "--debug-zone"]);

        Assert.AreEqual(CaptureProviderMode.Raw, options.Provider);
        Assert.IsTrue(options.Debug);
        Assert.IsTrue(options.DebugZone);
        Assert.IsFalse(options.DebugVerbose);
    }
}
