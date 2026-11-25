using System.ComponentModel.DataAnnotations;

namespace LeadLens.Application.DTOs;

public record CreateCampaignRequest(
    [Required, MinLength(3), MaxLength(80)] string Name,
    [Required, MinLength(2), MaxLength(100)] string Niche,
    [MaxLength(100)] string? Region = null,
    [RegularExpression("^(uk|en)$")] string SearchLanguage = "uk",
    [Range(5, 200)] int SiteLimit = 50,
    IReadOnlyList<string>? ExclusionKeywords = null,
    string ProfileKey = "web_studio",
    int ProfileVersion = 1,
    [RegularExpression("^(OpenStreetMap|GooglePlaces|ManualList|CsvImport)$")] string SourceType = "ManualList",
    IReadOnlyList<string>? ManualUrls = null,
    string? CsvContent = null,
    bool StartImmediately = true);

public record CampaignProgressDto(
    Guid CampaignId,
    string Status,
    int Found,
    int Reachable,
    int Audited,
    int Failed,
    int Excluded);

public record CampaignSiteDto(
    Guid Id,
    string Domain,
    string Url,
    string? BusinessName,
    string Source,
    bool IsDuplicateAcrossAccount,
    string Status,
    int? NeedScore,
    string? Level,
    string LeadStatus);

public record CampaignSummaryDto(
    Guid Id,
    string Name,
    string Niche,
    string? Region,
    string SearchLanguage,
    int SiteLimit,
    string ProfileKey,
    int ProfileVersion,
    string Status,
    bool IsArchived,
    int SitesFound,
    int SitesAudited,
    int SitesFailed,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record CampaignNeedDistributionDto(
    int Healthy,
    int Moderate,
    int Weak,
    int Critical);

public record CampaignDetailDto(
    Guid Id,
    string Name,
    string Niche,
    string? Region,
    string SearchLanguage,
    int SiteLimit,
    IReadOnlyList<string> ExclusionKeywords,
    string ProfileKey,
    int ProfileVersion,
    string Status,
    bool IsArchived,
    CampaignProgressDto Progress,
    double? AverageNeedScore,
    CampaignNeedDistributionDto NeedDistribution,
    IReadOnlyList<CampaignSiteDto> Sites,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record PagedResponse<T>(
    IReadOnlyList<T> Items,
    string? NextCursor,
    bool HasMore);
