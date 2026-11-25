using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using LeadLens.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace LeadLens.Infrastructure.Services;

public sealed class AuditHttpClient : IAuditClient
{
    private readonly HttpClient _http;
    private readonly string _internalToken;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    public AuditHttpClient(HttpClient http, IConfiguration configuration)
    {
        _http = http;
        _internalToken = configuration["Services:InternalToken"]
                         ?? "dev_internal_service_token_change_me";
    }

    public async Task<string> EnqueueAuditAsync(
        Guid auditId,
        Guid siteId,
        string url,
        string profileKey,
        int profileVersion,
        CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/jobs/audit");
        request.Headers.Add("X-Internal-Token", _internalToken);
        request.Content = JsonContent.Create(new
        {
            audit_id = auditId.ToString(),
            site_id = siteId.ToString(),
            url,
            profile_key = profileKey,
            profile_version = profileVersion
        });

        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<JobAcceptedPayload>(JsonOptions, ct)
                   ?? throw new InvalidOperationException("Empty response from audit service.");
        return body.JobId;
    }

    public async Task<AuditJobStatusDto> GetAuditJobStatusAsync(string jobId, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/internal/jobs/{Uri.EscapeDataString(jobId)}");
        request.Headers.Add("X-Internal-Token", _internalToken);

        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<AuditJobPayload>(JsonOptions, ct)
                   ?? throw new InvalidOperationException("Empty status response from audit service.");

        var findings = body.Findings.Select(f => new AuditFindingPayload(
            f.CheckId,
            f.Category,
            f.Result,
            f.Value,
            f.Impact,
            f.Effort,
            f.Service,
            f.Evidence.Select(e => new AuditEvidencePayload(e.Kind, e.Ref, e.Snippet, e.Metric)).ToList()
        )).ToList();

        var contacts = body.Contacts.Select(c => new AuditContactPayload(c.Kind, c.Value, c.SourcePage)).ToList();

        return new AuditJobStatusDto(
            body.JobId,
            body.Status,
            body.FailureReason,
            body.Detail,
            body.FinalUrl,
            findings,
            contacts);
    }

    public async Task<byte[]> RenderPdfAsync(string html, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/reports/pdf");
        request.Headers.Add("X-Internal-Token", _internalToken);
        request.Content = JsonContent.Create(new { html });

        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<PdfResponsePayload>(JsonOptions, ct)
                      ?? throw new InvalidOperationException("Empty PDF response from audit service.");
        return Convert.FromBase64String(payload.PdfBase64);
    }

    public async Task<(byte[] Content, string ContentType)> DownloadArtifactAsync(string key, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/internal/artifacts/{key}");
        request.Headers.Add("X-Internal-Token", _internalToken);

        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        var contentType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
        return (bytes, contentType);
    }

    private sealed class JobAcceptedPayload
    {
        [JsonPropertyName("job_id")]
        public string JobId { get; set; } = string.Empty;
    }

    private sealed class PdfResponsePayload
    {
        [JsonPropertyName("pdf_base64")]
        public string PdfBase64 { get; set; } = string.Empty;
    }

    private sealed class AuditJobPayload
    {
        [JsonPropertyName("job_id")]
        public string JobId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        [JsonPropertyName("failure_reason")]
        public string? FailureReason { get; set; }
        public string? Detail { get; set; }
        [JsonPropertyName("final_url")]
        public string? FinalUrl { get; set; }
        public List<FindingItemPayload> Findings { get; set; } = new();
        public List<ContactItemPayload> Contacts { get; set; } = new();
    }

    private sealed class FindingItemPayload
    {
        [JsonPropertyName("check_id")]
        public string CheckId { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Result { get; set; } = string.Empty;
        public string? Value { get; set; }
        public int Impact { get; set; }
        public int Effort { get; set; }
        public string Service { get; set; } = string.Empty;
        public List<EvidenceItemPayload> Evidence { get; set; } = new();
    }

    private sealed class EvidenceItemPayload
    {
        public string Kind { get; set; } = string.Empty;
        public string? Ref { get; set; }
        public string? Snippet { get; set; }
        public object? Metric { get; set; }
    }

    private sealed class ContactItemPayload
    {
        public string Kind { get; set; } = string.Empty;
        public string Value { get; set; } = string.Empty;
        [JsonPropertyName("source_page")]
        public string? SourcePage { get; set; }
    }
}
