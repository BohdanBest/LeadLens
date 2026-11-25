using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
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

public sealed class StageM9TestFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"LeadLensM9_{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("UseInMemoryDatabase", "true");
        builder.UseSetting("InMemoryDatabaseName", _dbName);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICampaignJobScheduler>();
            services.AddSingleton<ICampaignJobScheduler, NoOpScheduler>();
            services.RemoveAll<IMlClient>();
            services.AddSingleton<IMlClient, FakeMlClient>();
        });
    }

    private sealed class NoOpScheduler : ICampaignJobScheduler
    {
        public void EnqueueDiscovery(Guid campaignId, string sourceType, IReadOnlyList<string> manualUrls, string? csvContent) { }
        public void EnqueuePendingAudits(Guid campaignId) { }
        public void EnqueueSiteAudit(Guid siteId) { }
    }

    private sealed class FakeMlClient : IMlClient
    {
        public Task<MlGeneratedEmailDto> GenerateEmailAsync(MlGenerateEmailPayload payload, CancellationToken ct = default)
        {
            var top = payload.Findings.FirstOrDefault();
            var claims = top is null
                ? new List<MlGeneratedClaimDto>()
                : new List<MlGeneratedClaimDto>
                {
                    new(top.Id, top.CheckId, $"виявлено проблему {top.CheckId}: {top.Value}", "Verified")
                };

            return Task.FromResult(new MlGeneratedEmailDto(
                $"Що можна покращити на сайті {payload.Domain}",
                $"Добрий день!\n\n- {claims.FirstOrDefault()?.Text}\n\n{payload.Signature}\n\nЯкщо неактуально — дайте знати.",
                claims,
                25));
        }

        public Task<MlVerifyEmailResultDto> VerifyEmailAsync(MlVerifyEmailPayload payload, CancellationToken ct = default)
        {
            var rebound = payload.Claims.Select(c =>
            {
                var target = payload.Findings.FirstOrDefault(f => c.Text.Contains(f.CheckId, StringComparison.OrdinalIgnoreCase));
                if (target is not null)
                {
                    return new MlVerifiedClaimDto(c.Id, target.Id, target.CheckId, c.Text, "Verified", "rebound");
                }
                return new MlVerifiedClaimDto(c.Id, null, null, c.Text, "Unverified", "no_match");
            }).ToList();

            var allOk = rebound.All(r => r.VerificationStatus == "Verified");
            return Task.FromResult(new MlVerifyEmailResultDto(allOk, rebound, allOk ? Array.Empty<string>() : new[] { "Unverified claim" }));
        }
    }
}

public class StageM9EmailIntegrationTests : IClassFixture<StageM9TestFactory>
{
    private readonly StageM9TestFactory _factory;
    private readonly HttpClient _client;

    public StageM9EmailIntegrationTests(StageM9TestFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task EmailGeneration_Max10Versions_EditRebind_EmlExport_AndMarkSent()
    {
        var regResp = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email = $"m9_{Guid.NewGuid():N}@example.com",
            password = "StrongPassword123!",
            studioName = "M9 Studio"
        });
        regResp.EnsureSuccessStatusCode();
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        Guid siteId;
        Guid findingSeoId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LeadLensDbContext>();
            var campaign = new Campaign
            {
                WorkspaceId = auth.WorkspaceId,
                Name = "M9 Campaign",
                Niche = "Retail",
                Status = CampaignStatus.Completed
            };
            var site = new Site
            {
                CampaignId = campaign.Id,
                Domain = "shop-test.ua",
                Url = "https://shop-test.ua",
                Status = SiteStatus.Audited,
                NeedScore = 60,
                Level = NeedLevel.Weak
            };
            site.Contacts.Add(new Contact
            {
                Kind = ContactKind.Email,
                Value = "sales@shop-test.ua"
            });
            var audit = new Audit
            {
                SiteId = site.Id,
                Version = 1,
                Status = AuditStatus.Completed,
                Score = 60,
                CoverageRatio = 1m
            };
            var fMob = new Finding
            {
                AuditId = audit.Id,
                CheckId = "MOB-01",
                Category = "mobile",
                Result = CheckResultStatus.Fail,
                Value = "missing viewport",
                Impact = 5,
                Effort = 1,
                Service = "responsive_redesign",
                ScoreContribution = 20m
            };
            var fSeo = new Finding
            {
                AuditId = audit.Id,
                CheckId = "SEO-02",
                Category = "seo",
                Result = CheckResultStatus.Fail,
                Value = "відсутній",
                Impact = 3,
                Effort = 1,
                Service = "technical_seo",
                ScoreContribution = 8m
            };

            audit.Findings.Add(fMob);
            audit.Findings.Add(fSeo);
            db.Campaigns.Add(campaign);
            db.Sites.Add(site);
            db.Audits.Add(audit);
            await db.SaveChangesAsync();

            siteId = site.Id;
            findingSeoId = fSeo.Id;
        }

        // Generate 11 versions -> must retain max 10 versions (FR-EML-05)
        EmailDraftDto? latest = null;
        for (var i = 0; i < 11; i++)
        {
            var genResp = await _client.PostAsJsonAsync($"/api/v1/leads/{siteId}/emails/generate", new
            {
                language = "uk",
                tone = "formal",
                length = "short"
            });
            Assert.Equal(HttpStatusCode.Created, genResp.StatusCode);
            latest = await genResp.Content.ReadFromJsonAsync<EmailDraftDto>();
        }

        var list = await _client.GetFromJsonAsync<List<EmailDraftDto>>($"/api/v1/leads/{siteId}/emails");
        Assert.Equal(10, list!.Count);
        Assert.Equal(11, list[0].Version);

        // Edit draft to mention SEO-02 and an ungrounded claim -> verify re-binding (FR-EML-04)
        var editResp = await _client.PutAsJsonAsync($"/api/v1/emails/{latest!.Id}", new
        {
            subject = "Покращення для shop-test.ua",
            body = "Оновлений текст листа про SEO-02.",
            claims = new[]
            {
                new { id = (Guid?)latest.Claims[0].Id, findingId = latest.Claims[0].FindingId, text = "SEO-02: відсутній meta description" },
                new { id = (Guid?)null, findingId = (Guid?)null, text = "вигаданий факт без знахідки" }
            }
        });
        var editBody = await editResp.Content.ReadAsStringAsync();
        Assert.True(editResp.StatusCode == HttpStatusCode.OK, $"Status: {editResp.StatusCode}, Body: {editBody}");
        var updated = await editResp.Content.ReadFromJsonAsync<EmailDraftDto>();
        Assert.Equal(2, updated!.Claims.Count);
        Assert.Equal(findingSeoId, updated.Claims[0].FindingId);
        Assert.Equal("Verified", updated.Claims[0].VerificationStatus);
        Assert.Equal("Unverified", updated.Claims[1].VerificationStatus);

        // Verify endpoint
        var verifyResp = await _client.PostAsync($"/api/v1/emails/{latest.Id}/verify", null);
        Assert.Equal(HttpStatusCode.OK, verifyResp.StatusCode);
        var verification = await verifyResp.Content.ReadFromJsonAsync<EmailVerificationResultDto>();
        Assert.False(verification!.AllVerified);

        // Export .eml (FR-EML-06)
        var emlResp = await _client.GetAsync($"/api/v1/emails/{latest.Id}/eml");
        Assert.Equal(HttpStatusCode.OK, emlResp.StatusCode);
        Assert.Equal("message/rfc822", emlResp.Content.Headers.ContentType!.MediaType);
        var emlText = Encoding.ASCII.GetString(await emlResp.Content.ReadAsByteArrayAsync());
        Assert.Contains("To: sales@shop-test.ua", emlText);
        Assert.Contains("MIME-Version: 1.0", emlText);

        // Mark sent (FR-EML-07)
        var sentResp = await _client.PostAsync($"/api/v1/emails/{latest.Id}/mark-sent", null);
        Assert.Equal(HttpStatusCode.OK, sentResp.StatusCode);
        var sentDraft = await sentResp.Content.ReadFromJsonAsync<EmailDraftDto>();
        Assert.Equal("Sent", sentDraft!.Status);

        var leadDetail = await _client.GetFromJsonAsync<LeadDetailDto>($"/api/v1/leads/{siteId}");
        Assert.Equal("Sent", leadDetail!.LeadStatus);
    }
}
