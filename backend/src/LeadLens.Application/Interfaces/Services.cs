using LeadLens.Application.DTOs;
using LeadLens.Domain.Entities;
using LeadLens.Domain.Enums;

namespace LeadLens.Application.Interfaces;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string passwordHash);
}

public interface IJwtTokenService
{
    string GenerateAccessToken(User user, Guid workspaceId);
    string GenerateRefreshToken();
    string HashRefreshToken(string refreshToken);
    int AccessTokenExpiresInSeconds { get; }
    int RefreshTokenDays { get; }
}

public interface IQuotaService
{
    Task<QuotaSummaryDto> GetQuotaSummaryAsync(Guid userId, CancellationToken ct = default);
    Task<(bool Allowed, string? Message)> CanStartCampaignAsync(Guid userId, CancellationToken ct = default);
    Task<(bool Allowed, string? Message)> CanRunAuditsAsync(Guid userId, int count, CancellationToken ct = default);
}

public record CrawlerDiscoveryPayload(
    Guid CampaignId,
    string Niche,
    string? Region,
    string Language,
    int SiteLimit,
    string SourceType,
    IReadOnlyList<string> ExclusionKeywords,
    IReadOnlyList<string> ManualUrls,
    string? CsvContent);

public record CrawlerDiscoveredSiteDto(
    string Domain,
    string Url,
    string? BusinessName,
    string Source,
    string Status,
    string? Reason,
    string? PageTitle);

public record CrawlerJobStatusDto(
    string JobId,
    string Status,
    int Processed,
    IReadOnlyList<CrawlerDiscoveredSiteDto> Sites,
    string? Error);

public interface ICrawlerClient
{
    Task<string> EnqueueDiscoveryAsync(CrawlerDiscoveryPayload payload, CancellationToken ct = default);
    Task<CrawlerJobStatusDto> GetJobStatusAsync(string jobId, CancellationToken ct = default);
}

public record AuditEvidencePayload(
    string Kind,
    string? Ref,
    string? Snippet,
    object? Metric);

public record AuditFindingPayload(
    string CheckId,
    string Category,
    string Result,
    string? Value,
    int Impact,
    int Effort,
    string Service,
    IReadOnlyList<AuditEvidencePayload> Evidence);

public record AuditContactPayload(
    string Kind,
    string Value,
    string? SourcePage);

public record AuditJobStatusDto(
    string JobId,
    string Status,
    string? FailureReason,
    string? Detail,
    string? FinalUrl,
    IReadOnlyList<AuditFindingPayload> Findings,
    IReadOnlyList<AuditContactPayload> Contacts);

public interface IAuditClient
{
    Task<string> EnqueueAuditAsync(Guid auditId, Guid siteId, string url, string profileKey, int profileVersion, CancellationToken ct = default);
    Task<AuditJobStatusDto> GetAuditJobStatusAsync(string jobId, CancellationToken ct = default);
    Task<byte[]> RenderPdfAsync(string html, CancellationToken ct = default);
    Task<(byte[] Content, string ContentType)> DownloadArtifactAsync(string key, CancellationToken ct = default);
}

public record AuditCheckInput(
    string CheckId,
    string Category,
    CheckResultStatus Result);

public interface INeedScoreCalculator
{
    NeedScoreResult Calculate(ServiceProfileDto profile, IReadOnlyList<AuditCheckInput> checks);
}

public interface ICampaignJobScheduler
{
    void EnqueueDiscovery(Guid campaignId, string sourceType, IReadOnlyList<string> manualUrls, string? csvContent);
    void EnqueuePendingAudits(Guid campaignId);
    void EnqueueSiteAudit(Guid siteId);
}

public interface ICampaignOrchestrator
{
    Task ExecuteDiscoveryAsync(Guid campaignId, string sourceType, IReadOnlyList<string> manualUrls, string? csvContent, CancellationToken ct = default);
    Task ExecutePendingAuditsAsync(Guid campaignId, CancellationToken ct = default);
    Task ExecuteSingleSiteAuditAsync(Guid siteId, CancellationToken ct = default);
}

public record MlFindingInput(
    Guid Id,
    string CheckId,
    string Result,
    string? Value,
    decimal ScoreContribution,
    IReadOnlyList<string> EvidenceRefs,
    string TitleUk,
    string TitleEn,
    string? ExpectedClaimUk,
    string? ExpectedClaimEn);

public record MlGenerateEmailPayload(
    string Domain,
    string ProfileKey,
    int ProfileVersion,
    string Language,
    string Tone,
    string Length,
    string Signature,
    IReadOnlyList<string> StudioServices,
    IReadOnlyList<MlFindingInput> Findings);

public record MlGeneratedClaimDto(
    Guid? FindingId,
    string? CheckId,
    string Text,
    string VerificationStatus);

public record MlGeneratedEmailDto(
    string Subject,
    string Body,
    IReadOnlyList<MlGeneratedClaimDto> Claims,
    int WordCount);

public record MlVerifyClaimInput(
    Guid? Id,
    Guid? FindingId,
    string? CheckId,
    string Text);

public record MlVerifyEmailPayload(
    string Subject,
    string Body,
    IReadOnlyList<MlVerifyClaimInput> Claims,
    IReadOnlyList<MlFindingInput> Findings);

public record MlVerifiedClaimDto(
    Guid? Id,
    Guid? FindingId,
    string? CheckId,
    string Text,
    string VerificationStatus,
    string? Reason);

public record MlVerifyEmailResultDto(
    bool AllVerified,
    IReadOnlyList<MlVerifiedClaimDto> Claims,
    IReadOnlyList<string> Warnings);

public interface IMlClient
{
    Task<MlGeneratedEmailDto> GenerateEmailAsync(MlGenerateEmailPayload payload, CancellationToken ct = default);
    Task<MlVerifyEmailResultDto> VerifyEmailAsync(MlVerifyEmailPayload payload, CancellationToken ct = default);
}
