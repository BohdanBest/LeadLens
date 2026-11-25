namespace LeadLens.Application.DTOs;

public record LocalizedTextDto(string Uk, string En);

public record ServiceProfileCategoryDto(string Key, decimal Weight, LocalizedTextDto Name);

public record ServiceProfileCheckDto(
    string Id,
    string Category,
    decimal Weight,
    int Impact,
    int Effort,
    string Service,
    LocalizedTextDto? ServiceLabel,
    LocalizedTextDto Title,
    LocalizedTextDto Description,
    LocalizedTextDto? ClaimTemplate,
    Dictionary<string, object?> Thresholds);

public record EmailTemplateDto(
    string Language,
    string Tone,
    string Length,
    string Subject,
    string Body);

public record ServiceProfileDto(
    string Key,
    int Version,
    LocalizedTextDto Name,
    IReadOnlyList<ServiceProfileCategoryDto> Categories,
    IReadOnlyList<ServiceProfileCheckDto> Checks,
    IReadOnlyList<EmailTemplateDto> EmailTemplates);

public record ServiceProfileSummaryDto(
    string Key,
    int Version,
    LocalizedTextDto Name,
    int CategoriesCount,
    int ChecksCount);
