namespace LeadLens.Domain.Enums;

public enum CampaignStatus
{
    Draft,
    Discovering,
    Auditing,
    Completed,
    CompletedWithErrors,
    Paused,
    Cancelled
}

public enum SiteSource
{
    GooglePlaces,
    OpenStreetMap,
    ManualList,
    CsvImport
}

public enum SiteStatus
{
    Pending,
    Unreachable,
    Excluded,
    Auditing,
    Audited,
    PartialAudit,
    Failed
}

public enum AuditStatus
{
    Queued,
    Running,
    Completed,
    Partial,
    Failed
}

public enum AuditFailureReason
{
    None,
    Unreachable,
    BotBlocked,
    TooSlow,
    InternalError
}

public enum CheckResultStatus
{
    Pass,
    Warning,
    Fail,
    Unavailable,
    NotApplicable
}

public enum NeedLevel
{
    Healthy,
    Moderate,
    Weak,
    Critical
}

public enum LeadStatus
{
    New,
    DraftReady,
    Sent,
    Replied,
    Rejected
}

public enum EvidenceKind
{
    Metric,
    Screenshot,
    HtmlSnippet
}

public enum ContactKind
{
    Email,
    Phone,
    ContactForm
}

public enum EmailLanguage
{
    Uk,
    En
}

public enum EmailTone
{
    Formal,
    Friendly
}

public enum EmailLength
{
    Short,
    Medium
}

public enum EmailDraftStatus
{
    Draft,
    Ready,
    Sent
}

public enum ClaimVerificationStatus
{
    Verified,
    Unverified,
    Contradicts
}

public enum LeadEventType
{
    Note,
    StatusChanged,
    EmailGenerated,
    EmailSent,
    Reminder,
    TagUpdated
}
