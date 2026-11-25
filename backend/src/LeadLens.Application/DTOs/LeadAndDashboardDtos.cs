using System.ComponentModel.DataAnnotations;

namespace LeadLens.Application.DTOs;

public record ContactDto(
    Guid Id,
    string Kind,
    string Value,
    string? SourcePage,
    bool IsManual);

public record CreateContactRequest(
    [RegularExpression("^(Email|Phone|ContactForm)$")] string Kind,
    [Required, MinLength(2), MaxLength(500)] string Value,
    [MaxLength(1000)] string? SourcePage = null);

public record UpdateContactRequest(
    [RegularExpression("^(Email|Phone|ContactForm)$")] string Kind,
    [Required, MinLength(2), MaxLength(500)] string Value,
    [MaxLength(1000)] string? SourcePage = null);

public record LeadListItemDto(
    Guid Id,
    Guid CampaignId,
    string CampaignName,
    string Domain,
    string Url,
    string? BusinessName,
    int? NeedScore,
    string? Level,
    string Status,
    string LeadStatus,
    bool NoContactsFound,
    IReadOnlyList<string> Tags,
    DateTimeOffset CreatedAt);

public record LeadEventDto(
    Guid Id,
    string Type,
    string? Note,
    DateTimeOffset? DueAt,
    DateTimeOffset CreatedAt);

public record LeadDetailDto(
    Guid Id,
    Guid CampaignId,
    string CampaignName,
    string Domain,
    string Url,
    string? BusinessName,
    string Source,
    bool IsDuplicateAcrossAccount,
    string Status,
    int? NeedScore,
    string? Level,
    string LeadStatus,
    bool NoContactsFound,
    IReadOnlyList<string> Tags,
    IReadOnlyList<ContactDto> Contacts,
    IReadOnlyList<LeadEventDto> Events,
    Guid? LatestAuditId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record UpdateLeadStatusRequest(
    [RegularExpression("^(New|DraftReady|Sent|Replied|Rejected)$")] string LeadStatus,
    [MaxLength(500)] string? Note = null);

public record BulkUpdateLeadStatusRequest(
    [Required, MinLength(1)] IReadOnlyList<Guid> LeadIds,
    [RegularExpression("^(New|DraftReady|Sent|Replied|Rejected)$")] string LeadStatus);

public record UpdateLeadTagsRequest(
    [Required] IReadOnlyList<string> Tags);

public record CreateLeadEventRequest(
    [RegularExpression("^(Note|Reminder)$")] string Type,
    [Required, MinLength(1), MaxLength(2000)] string Note,
    DateTimeOffset? DueAt = null);

public record TopIssueDto(
    string CheckId,
    string Category,
    int Count);

public record CampaignAverageScoreDto(
    Guid CampaignId,
    string CampaignName,
    double AverageScore,
    int LeadsCount);

public record DashboardDto(
    string Period,
    int TotalCampaigns,
    int TotalLeads,
    CampaignNeedDistributionDto NeedDistribution,
    IReadOnlyDictionary<string, int> StatusFunnel,
    IReadOnlyList<TopIssueDto> TopIssues,
    IReadOnlyList<CampaignAverageScoreDto> CampaignAverageScores);
