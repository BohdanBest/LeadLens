using System.ComponentModel.DataAnnotations;

namespace LeadLens.Application.DTOs;

public record QuotaSummaryDto(
    int MonthlyAuditsUsed,
    int MonthlyAuditQuota,
    int ActiveCampaigns,
    int MaxConcurrentCampaigns);

public record WorkspaceDto(
    Guid Id,
    string Name,
    string? SiteUrl,
    string? PortfolioUrl,
    IReadOnlyList<string> Services,
    string Signature,
    string DefaultEmailLanguage,
    string DefaultEmailTone,
    string UiTheme,
    string UiLanguage,
    QuotaSummaryDto Quotas);

public record UpdateWorkspaceRequest(
    [Required, MinLength(1), MaxLength(120)] string Name,
    [MaxLength(500)] string? SiteUrl,
    [MaxLength(500)] string? PortfolioUrl,
    IReadOnlyList<string>? Services,
    [MaxLength(1000)] string? Signature,
    [RegularExpression("^(uk|en)$")] string DefaultEmailLanguage = "uk",
    [RegularExpression("^(formal|friendly)$")] string DefaultEmailTone = "formal",
    [RegularExpression("^(light|dark|system)$")] string UiTheme = "system",
    [RegularExpression("^(uk|en)$")] string UiLanguage = "uk");
