using System.ComponentModel.DataAnnotations;

namespace LeadLens.Application.DTOs;

public record GenerateEmailRequest(
    IReadOnlyList<Guid>? FindingIds = null,
    [RegularExpression("^(uk|en)$")] string? Language = null,
    [RegularExpression("^(formal|friendly)$")] string? Tone = null,
    [RegularExpression("^(short|medium)$")] string? Length = null);

public record EmailClaimDto(
    Guid Id,
    Guid? FindingId,
    string? CheckId,
    string Text,
    string VerificationStatus);

public record EmailDraftDto(
    Guid Id,
    Guid SiteId,
    int Version,
    string Language,
    string Tone,
    string Length,
    string Subject,
    string Body,
    string Status,
    IReadOnlyList<EmailClaimDto> Claims,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record UpdateEmailClaimInput(
    Guid? Id,
    Guid? FindingId,
    [Required, MinLength(3), MaxLength(500)] string Text);

public record UpdateEmailDraftRequest(
    [Required, MinLength(3), MaxLength(70)] string Subject,
    [Required, MinLength(10), MaxLength(5000)] string Body,
    [Required] IReadOnlyList<UpdateEmailClaimInput> Claims);

public record EmailVerificationResultDto(
    Guid DraftId,
    bool AllVerified,
    IReadOnlyList<EmailClaimDto> Claims,
    IReadOnlyList<string> Warnings);
