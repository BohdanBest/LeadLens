using System.Net;
using System.Net.Http.Json;
using LeadLens.Application.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace LeadLens.Tests;

public sealed class TightRateLimitFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"LeadLensRateLimit_{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("UseInMemoryDatabase", "true");
        builder.UseSetting("InMemoryDatabaseName", _dbName);
        builder.UseSetting("RateLimiting:AuthPermitLimit", "2");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICampaignJobScheduler>();
            services.AddSingleton<ICampaignJobScheduler, NoOpScheduler>();
        });
    }

    private sealed class NoOpScheduler : ICampaignJobScheduler
    {
        public void EnqueueDiscovery(Guid campaignId, string sourceType, IReadOnlyList<string> manualUrls, string? csvContent) { }
        public void EnqueuePendingAudits(Guid campaignId) { }
        public void EnqueueSiteAudit(Guid siteId) { }
    }
}

public class RateLimiterTests : IClassFixture<TightRateLimitFactory>
{
    private readonly HttpClient _client;

    public RateLimiterTests(TightRateLimitFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task AuthEndpoint_ExceedingLimit_Returns429ProblemDetails()
    {
        for (var i = 0; i < 2; i++)
        {
            var resp = await _client.PostAsJsonAsync("/api/v1/auth/login", new { email = "x@y.com", password = "wrong" });
            Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
        }

        var throttled = await _client.PostAsJsonAsync("/api/v1/auth/login", new { email = "x@y.com", password = "wrong" });
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.Equal("application/problem+json", throttled.Content.Headers.ContentType?.MediaType);
    }
}
