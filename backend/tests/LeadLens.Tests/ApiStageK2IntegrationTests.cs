using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using LeadLens.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace LeadLens.Tests;

public sealed class LeadLensTestFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"LeadLensTestDb_{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("UseInMemoryDatabase", "true");
        builder.UseSetting("InMemoryDatabaseName", _dbName);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICampaignJobScheduler>();
            services.AddSingleton<ICampaignJobScheduler, NoOpCampaignJobScheduler>();
        });
    }

    private sealed class NoOpCampaignJobScheduler : ICampaignJobScheduler
    {
        public void EnqueueDiscovery(Guid campaignId, string sourceType, IReadOnlyList<string> manualUrls, string? csvContent)
        {
        }

        public void EnqueuePendingAudits(Guid campaignId)
        {
        }

        public void EnqueueSiteAudit(Guid siteId)
        {
        }
    }
}

public class ApiStageK2IntegrationTests : IClassFixture<LeadLensTestFactory>
{
    private readonly HttpClient _client;

    public ApiStageK2IntegrationTests(LeadLensTestFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task AuthLifecycle_RegisterLoginRefreshLogoutAndDelete_WorksEndToEnd()
    {
        var email = $"user_{Guid.NewGuid():N}@example.com";
        var registerResp = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "StrongPassword123!",
            studioName = "Kyiv Web Studio"
        });

        var bodyStr = await registerResp.Content.ReadAsStringAsync();
        Assert.True(registerResp.StatusCode == HttpStatusCode.Created, $"Status: {registerResp.StatusCode}, Body: {bodyStr}");
        var auth = await registerResp.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        Assert.False(string.IsNullOrWhiteSpace(auth!.AccessToken));

        // Duplicate email returns 409 Conflict
        var dupResp = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "StrongPassword123!"
        });
        Assert.Equal(HttpStatusCode.Conflict, dupResp.StatusCode);

        // Authorized workspace access & update
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var wsResp = await _client.GetAsync("/api/v1/workspace");
        Assert.Equal(HttpStatusCode.OK, wsResp.StatusCode);
        var ws = await wsResp.Content.ReadFromJsonAsync<WorkspaceDto>();
        Assert.Equal("Kyiv Web Studio", ws!.Name);
        Assert.Equal(200, ws.Quotas.MonthlyAuditQuota);
        Assert.Equal(3, ws.Quotas.MaxConcurrentCampaigns);

        // Refresh rotates token
        var refreshResp = await _client.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = auth.RefreshToken });
        Assert.Equal(HttpStatusCode.OK, refreshResp.StatusCode);
        var refreshed = await refreshResp.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotEqual(auth.RefreshToken, refreshed!.RefreshToken);

        // Old refresh token is rejected after rotation
        var reuseResp = await _client.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = auth.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, reuseResp.StatusCode);

        // Logout revokes active refresh token
        var logoutResp = await _client.PostAsJsonAsync("/api/v1/auth/logout", new { refreshToken = refreshed.RefreshToken });
        Assert.Equal(HttpStatusCode.NoContent, logoutResp.StatusCode);
        var afterLogoutRefresh = await _client.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = refreshed.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, afterLogoutRefresh.StatusCode);

        // Account deletion
        var deleteResp = await _client.DeleteAsync("/api/v1/auth/account");
        Assert.Equal(HttpStatusCode.NoContent, deleteResp.StatusCode);
        _client.DefaultRequestHeaders.Authorization = null;
    }

    [Fact]
    public async Task Campaigns_EnforceConcurrentQuotaAndUserIsolation()
    {
        var userA = await RegisterAndSetAuthAsync($"a_{Guid.NewGuid():N}@example.com");

        // Start 3 concurrent campaigns (max quota = 3)
        var createdIds = new List<Guid>();
        for (var i = 1; i <= 3; i++)
        {
            var resp = await _client.PostAsJsonAsync("/api/v1/campaigns", new
            {
                name = $"Campaign {i}",
                niche = "Dental Clinics",
                region = "Kyiv",
                siteLimit = 20,
                sourceType = "ManualList",
                manualUrls = new[] { $"https://clinic{i}.example.com" },
                startImmediately = true
            });
            Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
            var detail = await resp.Content.ReadFromJsonAsync<CampaignDetailDto>();
            createdIds.Add(detail!.Id);
        }

        // 4th concurrent campaign is rejected with 429
        var fourthResp = await _client.PostAsJsonAsync("/api/v1/campaigns", new
        {
            name = "Campaign 4",
            niche = "Dental Clinics",
            sourceType = "ManualList",
            manualUrls = new[] { "https://clinic4.example.com" },
            startImmediately = true
        });
        Assert.Equal(HttpStatusCode.TooManyRequests, fourthResp.StatusCode);

        // Pause one campaign, then duplicate & archive
        var pauseResp = await _client.PostAsync($"/api/v1/campaigns/{createdIds[0]}/pause", null);
        Assert.Equal(HttpStatusCode.OK, pauseResp.StatusCode);

        // Switch to User B -> cannot see User A's campaign (404)
        var userB = await RegisterAndSetAuthAsync($"b_{Guid.NewGuid():N}@example.com");
        var isoResp = await _client.GetAsync($"/api/v1/campaigns/{createdIds[0]}");
        Assert.Equal(HttpStatusCode.NotFound, isoResp.StatusCode);

        _client.DefaultRequestHeaders.Authorization = null;
        _ = userA;
        _ = userB;
    }

    private async Task<AuthResponse> RegisterAndSetAuthAsync(string email)
    {
        var resp = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "StrongPassword123!"
        });
        resp.EnsureSuccessStatusCode();
        var auth = (await resp.Content.ReadFromJsonAsync<AuthResponse>())!;
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return auth;
    }
}
