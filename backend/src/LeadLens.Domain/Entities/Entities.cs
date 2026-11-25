using LeadLens.Domain.Enums;

namespace LeadLens.Domain.Entities;

public class User : BaseEntity
{
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public int MonthlyAuditQuota { get; set; } = 200;
    public int MaxConcurrentCampaigns { get; set; } = 3;
    public int FailedLoginAttempts { get; set; }
    public DateTimeOffset? LockoutEndAt { get; set; }

    public Workspace? Workspace { get; set; }
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}

public class RefreshToken : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid FamilyId { get; set; } = Guid.NewGuid();
    public string TokenHash { get; set; } = string.Empty;
    public string? ReplacedByTokenHash { get; set; }
    public string? UserAgent { get; set; }
    public string? IpAddress { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public User User { get; set; } = null!;
}

public class Workspace : BaseEntity
{
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? SiteUrl { get; set; }
    public string? PortfolioUrl { get; set; }
    public List<string> Services { get; set; } = new();
    public string Signature { get; set; } = string.Empty;
    public EmailLanguage DefaultEmailLanguage { get; set; } = EmailLanguage.Uk;
    public EmailTone DefaultEmailTone { get; set; } = EmailTone.Formal;
    public string UiTheme { get; set; } = "system";
    public string UiLanguage { get; set; } = "uk";

    public User User { get; set; } = null!;
    public ICollection<Campaign> Campaigns { get; set; } = new List<Campaign>();
}

public class ServiceProfile : BaseEntity
{
    public string Key { get; set; } = string.Empty;
    public int Version { get; set; }
    public string ConfigJson { get; set; } = "{}";
}

public class Campaign : BaseEntity
{
    public Guid WorkspaceId { get; set; }
    public string ProfileKey { get; set; } = "web_studio";
    public int ProfileVersion { get; set; } = 1;
    public string Name { get; set; } = string.Empty;
    public string Niche { get; set; } = string.Empty;
    public string? Region { get; set; }
    public string SearchLanguage { get; set; } = "uk";
    public int SiteLimit { get; set; } = 50;
    public List<string> ExclusionKeywords { get; set; } = new();
    public CampaignStatus Status { get; set; } = CampaignStatus.Draft;
    public bool IsArchived { get; set; }

    public Workspace Workspace { get; set; } = null!;
    public ICollection<Site> Sites { get; set; } = new List<Site>();
}

public class Site : BaseEntity
{
    public Guid CampaignId { get; set; }
    public string Domain { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string? BusinessName { get; set; }
    public SiteSource Source { get; set; } = SiteSource.ManualList;
    public bool IsDuplicateAcrossAccount { get; set; }
    public SiteStatus Status { get; set; } = SiteStatus.Pending;
    public int? NeedScore { get; set; }
    public NeedLevel? Level { get; set; }
    public LeadStatus LeadStatus { get; set; } = LeadStatus.New;
    public bool NoContactsFound { get; set; }
    public List<string> Tags { get; set; } = new();

    public Campaign Campaign { get; set; } = null!;
    public ICollection<Audit> Audits { get; set; } = new List<Audit>();
    public ICollection<Contact> Contacts { get; set; } = new List<Contact>();
    public ICollection<EmailDraft> EmailDrafts { get; set; } = new List<EmailDraft>();
    public ICollection<LeadEvent> Events { get; set; } = new List<LeadEvent>();
}

public class Audit : BaseEntity
{
    public Guid SiteId { get; set; }
    public int Version { get; set; } = 1;
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public AuditStatus Status { get; set; } = AuditStatus.Queued;
    public AuditFailureReason FailureReason { get; set; } = AuditFailureReason.None;
    public string? FailureDetails { get; set; }
    public int? Score { get; set; }
    public decimal CoverageRatio { get; set; }
    public string CategoryScoresJson { get; set; } = "{}";
    public string? Summary { get; set; }

    public Site Site { get; set; } = null!;
    public ICollection<Finding> Findings { get; set; } = new List<Finding>();
    public ICollection<ReportShareLink> ShareLinks { get; set; } = new List<ReportShareLink>();
}

public class ReportShareLink : BaseEntity
{
    public Guid AuditId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public Audit Audit { get; set; } = null!;
}

public class Finding : BaseEntity
{
    public Guid AuditId { get; set; }
    public string CheckId { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public CheckResultStatus Result { get; set; }
    public string? Value { get; set; }
    public int Impact { get; set; }
    public int Effort { get; set; }
    public string Service { get; set; } = string.Empty;
    public decimal ScoreContribution { get; set; }

    public Audit Audit { get; set; } = null!;
    public ICollection<Evidence> Evidences { get; set; } = new List<Evidence>();
}

public class Evidence : BaseEntity
{
    public Guid FindingId { get; set; }
    public EvidenceKind Kind { get; set; }
    public string? FileRef { get; set; }
    public string? PayloadJson { get; set; }

    public Finding Finding { get; set; } = null!;
}

public class Contact : BaseEntity
{
    public Guid SiteId { get; set; }
    public ContactKind Kind { get; set; }
    public string Value { get; set; } = string.Empty;
    public string? SourcePage { get; set; }
    public bool IsManual { get; set; }

    public Site Site { get; set; } = null!;
}

public class EmailDraft : BaseEntity
{
    public Guid SiteId { get; set; }
    public int Version { get; set; } = 1;
    public EmailLanguage Language { get; set; } = EmailLanguage.Uk;
    public EmailTone Tone { get; set; } = EmailTone.Formal;
    public EmailLength Length { get; set; } = EmailLength.Short;
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public EmailDraftStatus Status { get; set; } = EmailDraftStatus.Draft;

    public Site Site { get; set; } = null!;
    public ICollection<EmailClaim> Claims { get; set; } = new List<EmailClaim>();
}

public class EmailClaim : BaseEntity
{
    public Guid DraftId { get; set; }
    public Guid? FindingId { get; set; }
    public string Text { get; set; } = string.Empty;
    public ClaimVerificationStatus VerificationStatus { get; set; } = ClaimVerificationStatus.Verified;

    public EmailDraft Draft { get; set; } = null!;
    public Finding? Finding { get; set; }
}

public class LeadEvent : BaseEntity
{
    public Guid SiteId { get; set; }
    public LeadEventType Type { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset? DueAt { get; set; }

    public Site Site { get; set; } = null!;
}
