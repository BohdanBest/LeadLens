using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using LeadLens.Domain.Entities;
using LeadLens.Domain.Enums;
using LeadLens.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace LeadLens.Tests;

public sealed class StageB2TestFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"LeadLensB2_{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("UseInMemoryDatabase", "true");
        builder.UseSetting("InMemoryDatabaseName", _dbName);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICampaignJobScheduler>();
            services.AddSingleton<ICampaignJobScheduler, NoOpScheduler>();
            services.RemoveAll<IAuditClient>();
            services.AddSingleton<IAuditClient, StubAuditClient>();
        });
    }

    private sealed class NoOpScheduler : ICampaignJobScheduler
    {
        public void EnqueueDiscovery(Guid campaignId, string sourceType, IReadOnlyList<string> manualUrls, string? csvContent) { }
        public void EnqueuePendingAudits(Guid campaignId) { }
        public void EnqueueSiteAudit(Guid siteId) { }
    }

    private sealed class StubAuditClient : IAuditClient
    {
        public Task<string> EnqueueAuditAsync(Guid auditId, Guid siteId, string url, string profileKey, int profileVersion, CancellationToken ct = default) =>
            Task.FromResult($"aud-{auditId}");

        public Task<AuditJobStatusDto> GetAuditJobStatusAsync(string jobId, CancellationToken ct = default) =>
            Task.FromResult(new AuditJobStatusDto(jobId, "completed", null, null, null, Array.Empty<AuditFindingPayload>(), Array.Empty<AuditContactPayload>()));

        public Task<byte[]> RenderPdfAsync(string html, CancellationToken ct = default) =>
            Task.FromResult("%PDF-1.4 stub"u8.ToArray());

        public Task<(byte[] Content, string ContentType)> DownloadArtifactAsync(string key, CancellationToken ct = default) =>
            Task.FromResult((new byte[] { 137, 80, 78, 71 }, "image/png"));
    }
}

public class StageB2IntegrationTests : IClassFixture<StageB2TestFactory>
{
    private readonly StageB2TestFactory _factory;
    private readonly HttpClient _client;

    public StageB2IntegrationTests(StageB2TestFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task ReportsContactsLeadsAndDashboard_WorkEndToEnd()
    {
        // 1. Register user
        var regResp = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email = $"b2_{Guid.NewGuid():N}@example.com",
            password = "StrongPassword123!",
            studioName = "B2 Studio"
        });
        regResp.EnsureSuccessStatusCode();
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        // 2. Seed audited campaign + site + findings + contacts directly in DB
        Guid siteId;
        Guid auditId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LeadLensDbContext>();
            var campaign = new Campaign
            {
                WorkspaceId = auth.WorkspaceId,
                Name = "Dentists Kyiv",
                Niche = "Dentistry",
                Status = CampaignStatus.Completed
            };
            var site = new Site
            {
                CampaignId = campaign.Id,
                Domain = "dentist-kyiv.ua",
                Url = "https://dentist-kyiv.ua",
                BusinessName = "Dentist Kyiv",
                Status = SiteStatus.Audited,
                NeedScore = 65,
                Level = NeedLevel.Weak,
                LeadStatus = LeadStatus.New
            };
            var audit = new Audit
            {
                SiteId = site.Id,
                Version = 1,
                Status = AuditStatus.Completed,
                Score = 65,
                CoverageRatio = 1.0m,
                CategoryScoresJson = "{\"mobile\":70,\"seo\":60}",
                Summary = "Site has weak mobile and SEO indicators."
            };
            var finding = new Finding
            {
                AuditId = audit.Id,
                CheckId = "MOB-01",
                Category = "mobile",
                Result = CheckResultStatus.Fail,
                Value = "missing viewport",
                Impact = 5,
                Effort = 1,
                Service = "responsive_redesign",
                ScoreContribution = 25m
            };
            finding.Evidences.Add(new Evidence
            {
                Kind = EvidenceKind.HtmlSnippet,
                PayloadJson = "<head></head>"
            });

            db.Campaigns.Add(campaign);
            db.Sites.Add(site);
            db.Audits.Add(audit);
            db.Findings.Add(finding);
            await db.SaveChangesAsync();

            siteId = site.Id;
            auditId = audit.Id;
        }

        // 3. Site report JSON + PDF + Artifact proxy
        var reportResp = await _client.GetAsync($"/api/v1/leads/{siteId}/report");
        Assert.Equal(HttpStatusCode.OK, reportResp.StatusCode);
        var report = await reportResp.Content.ReadFromJsonAsync<SiteReportDto>();
        Assert.Equal(65, report!.NeedScore);
        Assert.Single(report.Findings);

        var pdfResp = await _client.GetAsync($"/api/v1/leads/{siteId}/report.pdf");
        Assert.Equal(HttpStatusCode.OK, pdfResp.StatusCode);
        Assert.Equal("application/pdf", pdfResp.Content.Headers.ContentType!.MediaType);

        var artResp = await _client.GetAsync($"/api/v1/artifacts/audits/{auditId}/mobile.png");
        Assert.Equal(HttpStatusCode.OK, artResp.StatusCode);

        // 3b. Public share link create, anonymous view, and revoke (FR-RPT-07)
        var shareResp = await _client.PostAsync($"/api/v1/leads/{siteId}/report/share", null);
        Assert.Equal(HttpStatusCode.Created, shareResp.StatusCode);
        var shareLink = await shareResp.Content.ReadFromJsonAsync<ReportShareLinkDto>();

        using (var anonClient = _factory.CreateClient())
        {
            var pubResp = await anonClient.GetAsync($"/api/v1/public/reports/{shareLink!.Token}");
            Assert.Equal(HttpStatusCode.OK, pubResp.StatusCode);
            var pubReport = await pubResp.Content.ReadFromJsonAsync<PublicReportDto>();
            Assert.Equal("dentist-kyiv.ua", pubReport!.Domain);
            Assert.Equal(65, pubReport.NeedScore);
        }

        var revokeResp = await _client.DeleteAsync($"/api/v1/leads/{siteId}/report/share/{shareLink!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, revokeResp.StatusCode);

        using (var anonClientAfter = _factory.CreateClient())
        {
            var revokedResp = await anonClientAfter.GetAsync($"/api/v1/public/reports/{shareLink.Token}");
            Assert.Equal(HttpStatusCode.NotFound, revokedResp.StatusCode);
        }

        // 4. Contacts CRUD (M8)
        var addContactResp = await _client.PostAsJsonAsync($"/api/v1/leads/{siteId}/contacts", new
        {
            kind = "Email",
            value = "owner@dentist-kyiv.ua",
            sourcePage = "https://dentist-kyiv.ua/contacts"
        });
        Assert.Equal(HttpStatusCode.Created, addContactResp.StatusCode);
        var createdContact = await addContactResp.Content.ReadFromJsonAsync<ContactDto>();

        var listContactsResp = await _client.GetFromJsonAsync<List<ContactDto>>($"/api/v1/leads/{siteId}/contacts");
        Assert.Single(listContactsResp!);

        // 5. Leads CRM filtering, status, tags, events, CSV export (M10)
        var leadsResp = await _client.GetFromJsonAsync<PagedResponse<LeadListItemDto>>("/api/v1/leads?level=Weak&search=dentist");
        Assert.Single(leadsResp!.Items);

        var bulkResp = await _client.PatchAsJsonAsync("/api/v1/leads/bulk-status", new
        {
            leadIds = new[] { siteId },
            leadStatus = "Sent"
        });
        Assert.Equal(HttpStatusCode.OK, bulkResp.StatusCode);

        var tagResp = await _client.PutAsJsonAsync($"/api/v1/leads/{siteId}/tags", new { tags = new[] { "vip", "kyiv" } });
        Assert.Equal(HttpStatusCode.OK, tagResp.StatusCode);

        var noteResp = await _client.PostAsJsonAsync($"/api/v1/leads/{siteId}/events", new
        {
            type = "Note",
            note = "Called reception, follow up next week"
        });
        Assert.Equal(HttpStatusCode.Created, noteResp.StatusCode);

        var csvResp = await _client.GetAsync("/api/v1/leads/export.csv");
        Assert.Equal(HttpStatusCode.OK, csvResp.StatusCode);
        var csvText = await csvResp.Content.ReadAsStringAsync();
        Assert.Contains("dentist-kyiv.ua", csvText);
        Assert.Contains("owner@dentist-kyiv.ua", csvText);

        // 6. Dashboard (M11)
        var dash = await _client.GetFromJsonAsync<DashboardDto>("/api/v1/dashboard?period=30d");
        Assert.Equal(1, dash!.TotalCampaigns);
        Assert.Equal(1, dash.TotalLeads);
        Assert.Equal(1, dash.NeedDistribution.Weak);
        Assert.Single(dash.TopIssues);
        Assert.Equal("MOB-01", dash.TopIssues[0].CheckId);

        // Delete contact -> clean
        var delContactResp = await _client.DeleteAsync($"/api/v1/leads/{siteId}/contacts/{createdContact!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delContactResp.StatusCode);
    }
}
