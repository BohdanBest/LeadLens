using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using LeadLens.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace LeadLens.Infrastructure.Services;

public sealed class MlHttpClient : IMlClient
{
    private readonly HttpClient _http;
    private readonly string _internalToken;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    public MlHttpClient(HttpClient http, IConfiguration configuration)
    {
        _http = http;
        _internalToken = configuration["Services:InternalToken"]
                         ?? "dev_internal_service_token_change_me";
    }

    public async Task<MlGeneratedEmailDto> GenerateEmailAsync(MlGenerateEmailPayload payload, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/emails/generate");
        request.Headers.Add("X-Internal-Token", _internalToken);
        request.Content = JsonContent.Create(new
        {
            domain = payload.Domain,
            profile_key = payload.ProfileKey,
            profile_version = payload.ProfileVersion,
            language = payload.Language,
            tone = payload.Tone,
            length = payload.Length,
            signature = payload.Signature,
            studio_services = payload.StudioServices,
            findings = payload.Findings.Select(f => new
            {
                id = f.Id.ToString(),
                check_id = f.CheckId,
                result = f.Result,
                value = f.Value,
                score_contribution = f.ScoreContribution,
                evidence_refs = f.EvidenceRefs,
                title_uk = f.TitleUk,
                title_en = f.TitleEn,
                expected_claim_uk = f.ExpectedClaimUk,
                expected_claim_en = f.ExpectedClaimEn
            })
        });

        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<GenerateResponsePayload>(JsonOptions, ct)
                   ?? throw new InvalidOperationException("Empty response from ML service.");

        var claims = body.Claims.Select(c => new MlGeneratedClaimDto(
            Guid.TryParse(c.FindingId, out var fid) ? fid : null,
            c.CheckId,
            c.Text,
            c.VerificationStatus)).ToList();

        return new MlGeneratedEmailDto(body.Subject, body.Body, claims, body.WordCount);
    }

    public async Task<MlVerifyEmailResultDto> VerifyEmailAsync(MlVerifyEmailPayload payload, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/emails/verify");
        request.Headers.Add("X-Internal-Token", _internalToken);
        request.Content = JsonContent.Create(new
        {
            subject = payload.Subject,
            body = payload.Body,
            claims = payload.Claims.Select(c => new
            {
                id = c.Id?.ToString(),
                finding_id = c.FindingId?.ToString(),
                check_id = c.CheckId,
                text = c.Text
            }),
            findings = payload.Findings.Select(f => new
            {
                id = f.Id.ToString(),
                check_id = f.CheckId,
                result = f.Result,
                value = f.Value,
                score_contribution = f.ScoreContribution,
                evidence_refs = f.EvidenceRefs,
                title_uk = f.TitleUk,
                title_en = f.TitleEn,
                expected_claim_uk = f.ExpectedClaimUk,
                expected_claim_en = f.ExpectedClaimEn
            })
        });

        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<VerifyResponsePayload>(JsonOptions, ct)
                   ?? throw new InvalidOperationException("Empty verification response from ML service.");

        var claims = body.Claims.Select(c => new MlVerifiedClaimDto(
            Guid.TryParse(c.Id, out var cid) ? cid : null,
            Guid.TryParse(c.FindingId, out var fid) ? fid : null,
            c.CheckId,
            c.Text,
            c.VerificationStatus,
            c.Reason)).ToList();

        return new MlVerifyEmailResultDto(body.AllVerified, claims, body.Warnings);
    }

    private sealed class GenerateResponsePayload
    {
        public string Subject { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public List<ClaimPayload> Claims { get; set; } = new();
        [JsonPropertyName("word_count")]
        public int WordCount { get; set; }
    }

    private sealed class VerifyResponsePayload
    {
        [JsonPropertyName("all_verified")]
        public bool AllVerified { get; set; }
        public List<ClaimPayload> Claims { get; set; } = new();
        public List<string> Warnings { get; set; } = new();
    }

    private sealed class ClaimPayload
    {
        public string? Id { get; set; }
        [JsonPropertyName("finding_id")]
        public string? FindingId { get; set; }
        [JsonPropertyName("check_id")]
        public string? CheckId { get; set; }
        public string Text { get; set; } = string.Empty;
        [JsonPropertyName("verification_status")]
        public string VerificationStatus { get; set; } = "Verified";
        public string? Reason { get; set; }
    }
}
