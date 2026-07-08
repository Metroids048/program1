using System.Text.Json;

namespace AudioBridge;

// 本地持久化配对令牌：配对一次后记住，以后自动连接，不需要每次都重新输入配对码。
internal sealed class BridgeConfig
{
    public string ServerUrl { get; set; } = "http://127.0.0.1:8787";
    public string? DeviceToken { get; set; }
    public string DeviceName { get; set; } = Environment.MachineName;

    private static string ConfigPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AudioBridge", "config.json");

    public static BridgeConfig Load()
    {
        try
        {
            var path = ConfigPath;
            if (!File.Exists(path)) return new BridgeConfig();
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<BridgeConfig>(json) ?? new BridgeConfig();
        }
        catch
        {
            return new BridgeConfig();
        }
    }

    public void Save()
    {
        var path = ConfigPath;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
    }

    public void ClearToken()
    {
        DeviceToken = null;
        Save();
    }
}
