using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using LeadLens.Domain.Entities;
using LeadLens.Domain.Enums;
using LeadLens.Infrastructure.Persistence;
using LeadLens.Infrastructure.Profiles;
using LeadLens.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LeadLens.Tests;

public class CampaignOrchestratorTests
{
    [Fact]
    public async Task ExecuteDiscoveryAndAudit_StoresFindingsAndMarksAccountDuplicates()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "profiles")))
        {
            dir = dir.Parent;
        }
        var profileRegistry = new YamlServiceProfileRegistry(Path.Combine(dir!.FullName, "profiles"));
        var dbName = $"OrchestratorTest_Shared_{Guid.NewGuid()}";

        var services = new ServiceCollection();
        services.AddDbContext<LeadLensDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddSingleton<IServiceProfileRegistry>(profileRegistry);
        services.AddSingleton<INeedScoreCalculator, NeedScoreCalculator>();
        services.AddSingleton<ICrawlerClient, FakeCrawlerClient>();
        services.AddSingleton<IAuditClient>(new FakeAuditClient(profileRegistry.GetProfile("web_studio", 1)!));
        services.AddScoped<IQuotaService, QuotaService>();
        services.AddScoped<ICampaignOrchestrator, CampaignOrchestrator>();
        services.AddLogging();

        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LeadLensDbContext>();

        var user = new User { Email = "studio@example.com", PasswordHash = "hash" };
        var workspace = new Workspace { UserId = user.Id, Name = "Studio" };
        var oldCampaign = new Campaign
        {
            WorkspaceId = workspace.Id,
            Name = "Old",
            Niche = "Tech",
            Status = CampaignStatus.Completed
        };
        var existingSite = new Site
        {
            CampaignId = oldCampaign.Id,
            Domain = "already-seen.ua",
            Url = "https://already-seen.ua",
            Status = SiteStatus.Pending
        };
        var newCampaign = new Campaign
        {
            WorkspaceId = workspace.Id,
            Name = "New",
            Niche = "Tech",
            Status = CampaignStatus.Discovering
        };

        db.Users.Add(user);
        db.Workspaces.Add(workspace);
        db.Campaigns.AddRange(oldCampaign, newCampaign);
        db.Sites.Add(existingSite);
        await db.SaveChangesAsync();

        var orchestrator = scope.ServiceProvider.GetRequiredService<ICampaignOrchestrator>();
        await orchestrator.ExecuteDiscoveryAsync(
            newCampaign.Id,
            "ManualList",
            new[] { "https://already-seen.ua", "https://fresh-lead.ua" },
            null);

        db.ChangeTracker.Clear();

        var reloaded = await db.Campaigns
            .AsNoTracking()
            .Include(c => c.Sites)
            .ThenInclude(s => s.Audits)
            .ThenInclude(a => a.Findings)
            .Include(c => c.Sites)
            .ThenInclude(s => s.Contacts)
            .FirstAsync(c => c.Id == newCampaign.Id);

        Assert.Equal(CampaignStatus.Completed, reloaded.Status);
        Assert.Equal(2, reloaded.Sites.Count);

        var dupSite = reloaded.Sites.First(s => s.Domain == "already-seen.ua");
        var freshSite = reloaded.Sites.First(s => s.Domain == "fresh-lead.ua");

        Assert.True(dupSite.IsDuplicateAcrossAccount);
        Assert.False(freshSite.IsDuplicateAcrossAccount);
        Assert.Equal(SiteStatus.Audited, freshSite.Status);
        Assert.True(freshSite.NeedScore > 0);
        Assert.Single(freshSite.Audits);
        Assert.Single(freshSite.Contacts);
    }

    private sealed class FakeCrawlerClient : ICrawlerClient
    {
        public Task<string> EnqueueDiscoveryAsync(CrawlerDiscoveryPayload payload, CancellationToken ct = default) =>
            Task.FromResult($"disc-{payload.CampaignId}");

        public Task<CrawlerJobStatusDto> GetJobStatusAsync(string jobId, CancellationToken ct = default) =>
            Task.FromResult(new CrawlerJobStatusDto(
                jobId,
                "completed",
                2,
                new[]
                {
                    new CrawlerDiscoveredSiteDto("already-seen.ua", "https://already-seen.ua", null, "ManualList", "Pending", null, "Seen"),
                    new CrawlerDiscoveredSiteDto("fresh-lead.ua", "https://fresh-lead.ua", "Fresh Biz", "ManualList", "Pending", null, "Fresh")
                },
                null));
    }

    private sealed class FakeAuditClient : IAuditClient
    {
        private readonly ServiceProfileDto _profile;

        public FakeAuditClient(ServiceProfileDto profile) => _profile = profile;

        public Task<string> EnqueueAuditAsync(Guid auditId, Guid siteId, string url, string profileKey, int profileVersion, CancellationToken ct = default) =>
            Task.FromResult($"aud-{auditId}");

        public Task<AuditJobStatusDto> GetAuditJobStatusAsync(string jobId, CancellationToken ct = default)
        {
            var findings = _profile.Checks.Select(c =>
                c.Id == "MOB-01"
                    ? new AuditFindingPayload("MOB-01", c.Category, "fail", "missing viewport", c.Impact, c.Effort, c.Service,
                        new[] { new AuditEvidencePayload("html_snippet", null, "<head></head>", null) })
                    : new AuditFindingPayload(c.Id, c.Category, "pass", "ok", c.Impact, c.Effort, c.Service,
                        new[] { new AuditEvidencePayload("metric", null, null, "ok") }))
                .ToList();

            return Task.FromResult(new AuditJobStatusDto(
                jobId,
                "completed",
                null,
                null,
                "https://fresh-lead.ua",
                findings,
                new[] { new AuditContactPayload("Email", "hello@fresh-lead.ua", "https://fresh-lead.ua") }));
        }

        public Task<byte[]> RenderPdfAsync(string html, CancellationToken ct = default) =>
            Task.FromResult("%PDF-1.4\n"u8.ToArray());

        public Task<(byte[] Content, string ContentType)> DownloadArtifactAsync(string key, CancellationToken ct = default) =>
            Task.FromResult((new byte[] { 1, 2, 3 }, "image/png"));
    }
}
