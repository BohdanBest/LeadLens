using LeadLens.Domain.Enums;

namespace LeadLens.Application.DTOs;

public record NeedScoreResult(
    int Score,
    NeedLevel Level,
    decimal CoverageRatio,
    bool IsPartial,
    IReadOnlyDictionary<string, decimal> CategoryScores,
    IReadOnlyDictionary<string, decimal> FindingContributions);

public record EvidenceDto(
    Guid Id,
    string Kind,
    string? FileRef,
    string? PayloadJson);

public record FindingDto(
    Guid Id,
    string CheckId,
    string Category,
    string TitleUk,
    string TitleEn,
    string DescriptionUk,
    string DescriptionEn,
    string Result,
    string? Value,
    int Impact,
    int Effort,
    string Service,
    decimal ScoreContribution,
    IReadOnlyList<EvidenceDto> Evidences);

public record CategoryComparisonDto(
    string Category,
    string NameUk,
    string NameEn,
    decimal SiteScore,
    decimal? CampaignMedianScore);

public record SiteReportDto(
    Guid SiteId,
    string Domain,
    string Url,
    Guid AuditId,
    int AuditVersion,
    DateTimeOffset? AuditedAt,
    string AuditStatus,
    int NeedScore,
    string Level,
    decimal CoverageRatio,
    string Summary,
    decimal? CampaignMedianScore,
    IReadOnlyList<CategoryComparisonDto> CategoryComparisons,
    IReadOnlyList<FindingDto> Findings,
    IReadOnlyList<ContactDto> Contacts);

public record ReportShareLinkDto(
    Guid Id,
    string Token,
    DateTimeOffset ExpiresAt,
    string PublicPath);

public record PublicFindingSummaryDto(
    string CheckId,
    string Category,
    string TitleUk,
    string TitleEn,
    string Result,
    string? Value,
    decimal ScoreContribution);

public record PublicReportDto(
    string Domain,
    string Url,
    int AuditVersion,
    DateTimeOffset? AuditedAt,
    int NeedScore,
    string Level,
    string Summary,
    IReadOnlyList<PublicFindingSummaryDto> TopFindings);
