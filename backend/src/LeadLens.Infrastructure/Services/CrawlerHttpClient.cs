using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using LeadLens.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace LeadLens.Infrastructure.Services;

public sealed class CrawlerHttpClient : ICrawlerClient
{
    private readonly HttpClient _http;
    private readonly string _internalToken;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    public CrawlerHttpClient(HttpClient http, IConfiguration configuration)
    {
        _http = http;
        _internalToken = configuration["Services:InternalToken"]
                         ?? "dev_internal_service_token_change_me";
    }

    public async Task<string> EnqueueDiscoveryAsync(CrawlerDiscoveryPayload payload, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/jobs/discover");
        request.Headers.Add("X-Internal-Token", _internalToken);
        request.Content = JsonContent.Create(new
        {
            campaign_id = payload.CampaignId.ToString(),
            niche = payload.Niche,
            region = payload.Region,
            language = payload.Language,
            site_limit = payload.SiteLimit,
            source_type = payload.SourceType,
            exclusion_keywords = payload.ExclusionKeywords,
            manual_urls = payload.ManualUrls,
            csv_content = payload.CsvContent
        });

        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<JobAcceptedPayload>(JsonOptions, ct)
                   ?? throw new InvalidOperationException("Empty response from crawler service.");
        return body.JobId;
    }

    public async Task<CrawlerJobStatusDto> GetJobStatusAsync(string jobId, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/internal/jobs/{Uri.EscapeDataString(jobId)}");
        request.Headers.Add("X-Internal-Token", _internalToken);

        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<JobStatusPayload>(JsonOptions, ct)
                   ?? throw new InvalidOperationException("Empty status response from crawler service.");

        var sites = body.Sites.Select(s => new CrawlerDiscoveredSiteDto(
            s.Domain,
            s.Url,
            s.BusinessName,
            s.Source,
            s.Status,
            s.Reason,
            s.PageTitle)).ToList();

        return new CrawlerJobStatusDto(body.JobId, body.Status, body.Processed, sites, body.Error);
    }

    private sealed class JobAcceptedPayload
    {
        [JsonPropertyName("job_id")]
        public string JobId { get; set; } = string.Empty;
    }

    private sealed class JobStatusPayload
    {
        [JsonPropertyName("job_id")]
        public string JobId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public int Processed { get; set; }
        public List<DiscoveredSitePayload> Sites { get; set; } = new();
        public string? Error { get; set; }
    }

    private sealed class DiscoveredSitePayload
    {
        public string Domain { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        [JsonPropertyName("business_name")]
        public string? BusinessName { get; set; }
        public string Source { get; set; } = "ManualList";
        public string Status { get; set; } = "Pending";
        public string? Reason { get; set; }
        [JsonPropertyName("page_title")]
        public string? PageTitle { get; set; }
    }
}
