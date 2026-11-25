using LeadLens.Infrastructure.Profiles;
using Xunit;

namespace LeadLens.Tests;

public class ProfileRegistryTests
{
    [Fact]
    public void LoadsAndValidatesWebStudioProfile()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "profiles")))
        {
            dir = dir.Parent;
        }
        Assert.NotNull(dir);
        var profilesDir = Path.Combine(dir!.FullName, "profiles");

        var registry = new YamlServiceProfileRegistry(profilesDir);
        var list = registry.ListProfiles();

        Assert.Single(list);
        Assert.Equal("web_studio", list[0].Key);
        Assert.Equal(1, list[0].Version);
        Assert.Equal(8, list[0].CategoriesCount);
        Assert.Equal(31, list[0].ChecksCount);

        var detail = registry.GetProfile("web_studio", 1);
        Assert.NotNull(detail);
        Assert.Equal(100m, detail!.Categories.Sum(c => c.Weight));
        Assert.Equal(8, detail.EmailTemplates.Count);
    }
}
