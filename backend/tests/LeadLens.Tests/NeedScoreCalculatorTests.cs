using LeadLens.Application.Interfaces;
using LeadLens.Domain.Enums;
using LeadLens.Infrastructure.Profiles;
using LeadLens.Infrastructure.Services;
using Xunit;

namespace LeadLens.Tests;

public class NeedScoreCalculatorTests
{
    private static LeadLens.Application.DTOs.ServiceProfileDto LoadProfile()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "profiles")))
        {
            dir = dir.Parent;
        }
        var registry = new YamlServiceProfileRegistry(Path.Combine(dir!.FullName, "profiles"));
        return registry.GetProfile("web_studio", 1)!;
    }

    [Fact]
    public void Calculate_AllPass_ReturnsZeroHealthy()
    {
        var profile = LoadProfile();
        var checks = profile.Checks.Select(c => new AuditCheckInput(c.Id, c.Category, CheckResultStatus.Pass)).ToList();

        var result = new NeedScoreCalculator().Calculate(profile, checks);

        Assert.Equal(0, result.Score);
        Assert.Equal(NeedLevel.Healthy, result.Level);
        Assert.Equal(1.0m, result.CoverageRatio);
        Assert.False(result.IsPartial);
    }

    [Fact]
    public void Calculate_AllFail_ReturnsHundredCritical()
    {
        var profile = LoadProfile();
        var checks = profile.Checks.Select(c => new AuditCheckInput(c.Id, c.Category, CheckResultStatus.Fail)).ToList();

        var result = new NeedScoreCalculator().Calculate(profile, checks);

        Assert.Equal(100, result.Score);
        Assert.Equal(NeedLevel.Critical, result.Level);
    }

    [Fact]
    public void Calculate_HighUnavailableCount_FlagsPartialWithoutDivideByZero()
    {
        var profile = LoadProfile();
        // Mark all except 2 checks as Unavailable
        var checks = profile.Checks.Select((c, idx) =>
            new AuditCheckInput(c.Id, c.Category, idx < 2 ? CheckResultStatus.Fail : CheckResultStatus.Unavailable)).ToList();

        var result = new NeedScoreCalculator().Calculate(profile, checks);

        Assert.True(result.IsPartial);
        Assert.True(result.CoverageRatio < 0.60m);
    }

    [Fact]
    public void Calculate_NotApplicableStoreCheck_DoesNotLowerCoverage()
    {
        var profile = LoadProfile();
        var checks = profile.Checks.Select(c =>
            new AuditCheckInput(
                c.Id,
                c.Category,
                c.Id == "BIZ-03" ? CheckResultStatus.NotApplicable : CheckResultStatus.Pass)).ToList();

        var result = new NeedScoreCalculator().Calculate(profile, checks);

        Assert.Equal(1.0m, result.CoverageRatio);
        Assert.Equal(0, result.Score);
    }
}
