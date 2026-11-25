using System.Text.Json;
using Hangfire;
using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using LeadLens.Domain.Entities;
using LeadLens.Domain.Enums;
using LeadLens.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace LeadLens.Infrastructure.Services;

public sealed class HangfireCampaignJobScheduler : ICampaignJobScheduler
{
    private readonly IBackgroundJobClient _hangfire;

    public HangfireCampaignJobScheduler(IBackgroundJobClient hangfire)
    {
        _hangfire = hangfire;
    }

    public void EnqueueDiscovery(Guid campaignId, string sourceType, IReadOnlyList<string> manualUrls, string? csvContent)
    {
        _hangfire.Enqueue<ICampaignOrchestrator>(o =>
            o.ExecuteDiscoveryAsync(campaignId, sourceType, manualUrls, csvContent, CancellationToken.None));
    }

    public void EnqueuePendingAudits(Guid campaignId)
    {
        _hangfire.Enqueue<ICampaignOrchestrator>(o =>
            o.ExecutePendingAuditsAsync(campaignId, CancellationToken.None));
    }

    public void EnqueueSiteAudit(Guid siteId)
    {
        _hangfire.Enqueue<ICampaignOrchestrator>(o =>
            o.ExecuteSingleSiteAuditAsync(siteId, CancellationToken.None));
    }
}

public sealed class InProcessCampaignJobScheduler : ICampaignJobScheduler
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<InProcessCampaignJobScheduler> _logger;

    public InProcessCampaignJobScheduler(IServiceScopeFactory scopeFactory, ILogger<InProcessCampaignJobScheduler> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void EnqueueDiscovery(Guid campaignId, string sourceType, IReadOnlyList<string> manualUrls, string? csvContent)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var orchestrator = scope.ServiceProvider.GetRequiredService<ICampaignOrchestrator>();
                await orchestrator.ExecuteDiscoveryAsync(campaignId, sourceType, manualUrls, csvContent);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background discovery execution failed for campaign {CampaignId}", campaignId);
            }
        });
    }

    public void EnqueuePendingAudits(Guid campaignId)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var orchestrator = scope.ServiceProvider.GetRequiredService<ICampaignOrchestrator>();
                await orchestrator.ExecutePendingAuditsAsync(campaignId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background pending audits execution failed for campaign {CampaignId}", campaignId);
            }
        });
    }

    public void EnqueueSiteAudit(Guid siteId)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var orchestrator = scope.ServiceProvider.GetRequiredService<ICampaignOrchestrator>();
                await orchestrator.ExecuteSingleSiteAuditAsync(siteId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background single-site audit failed for site {SiteId}", siteId);
            }
        });
    }
}

public sealed class CampaignOrchestrator : ICampaignOrchestrator
{
    private const int MaxParallelAudits = 5;
    private const int MaxAuditAttempts = 3; // initial + 2 retries (FR-AUD-05)

    private readonly LeadLensDbContext _db;
    private readonly ICrawlerClient _crawler;
    private readonly IAuditClient _auditClient;
    private readonly IServiceProfileRegistry _profiles;
    private readonly INeedScoreCalculator _scoreCalculator;
    private readonly IQuotaService _quotas;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CampaignOrchestrator> _logger;

    public CampaignOrchestrator(
        LeadLensDbContext db,
        ICrawlerClient crawler,
        IAuditClient auditClient,
        IServiceProfileRegistry profiles,
        INeedScoreCalculator scoreCalculator,
        IQuotaService quotas,
        IServiceScopeFactory scopeFactory,
        ILogger<CampaignOrchestrator> logger)
    {
        _db = db;
        _crawler = crawler;
        _auditClient = auditClient;
        _profiles = profiles;
        _scoreCalculator = scoreCalculator;
        _quotas = quotas;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task ExecuteDiscoveryAsync(
        Guid campaignId,
        string sourceType,
        IReadOnlyList<string> manualUrls,
        string? csvContent,
        CancellationToken ct = default)
    {
        var campaign = await _db.Campaigns
            .Include(c => c.Workspace)
            .Include(c => c.Sites)
            .FirstOrDefaultAsync(c => c.Id == campaignId, ct);

        if (campaign is null || campaign.Status is CampaignStatus.Cancelled or CampaignStatus.Paused)
        {
            return;
        }

        campaign.Status = CampaignStatus.Discovering;
        await _db.SaveChangesAsync(ct);

        try
        {
            var jobId = await _crawler.EnqueueDiscoveryAsync(new CrawlerDiscoveryPayload(
                campaign.Id,
                campaign.Niche,
                campaign.Region,
                campaign.SearchLanguage,
                campaign.SiteLimit,
                sourceType,
                campaign.ExclusionKeywords,
                manualUrls,
                csvContent), ct);

            CrawlerJobStatusDto? jobStatus = null;
            for (var attempt = 0; attempt < 120; attempt++)
            {
                ct.ThrowIfCancellationRequested();
                await Task.Delay(1000, ct);

                var currentState = await _db.Campaigns
                    .AsNoTracking()
                    .Where(c => c.Id == campaignId)
                    .Select(c => c.Status)
                    .FirstOrDefaultAsync(ct);

                if (currentState is CampaignStatus.Cancelled or CampaignStatus.Paused)
                {
                    return;
                }

                jobStatus = await _crawler.GetJobStatusAsync(jobId, ct);
                if (jobStatus.Status is "completed" or "failed")
                {
                    break;
                }
            }

            if (jobStatus is null || jobStatus.Status != "completed")
            {
                _logger.LogWarning("Discovery job {JobId} for campaign {CampaignId} did not complete: {Error}",
                    jobId, campaignId, jobStatus?.Error ?? "timeout");
                campaign.Status = CampaignStatus.CompletedWithErrors;
                await _db.SaveChangesAsync(ct);
                return;
            }

            var userId = campaign.Workspace.UserId;
            var existingAccountDomains = (await _db.Sites
                    .AsNoTracking()
                    .Where(s => s.CampaignId != campaignId && s.Campaign.Workspace.UserId == userId)
                    .Select(s => s.Domain)
                    .ToListAsync(ct))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var existingInCampaign = campaign.Sites
                .Select(s => s.Domain)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var pendingSiteIds = new List<Guid>();
            foreach (var discovered in jobStatus.Sites)
            {
                if (!existingInCampaign.Add(discovered.Domain))
                {
                    continue;
                }

                var parsedStatus = Enum.TryParse<SiteStatus>(discovered.Status, true, out var st)
                    ? st
                    : SiteStatus.Unreachable;

                var parsedSource = Enum.TryParse<SiteSource>(discovered.Source, true, out var src)
                    ? src
                    : SiteSource.ManualList;

                var site = new Site
                {
                    CampaignId = campaign.Id,
                    Domain = discovered.Domain,
                    Url = discovered.Url,
                    BusinessName = discovered.BusinessName,
                    Source = parsedSource,
                    IsDuplicateAcrossAccount = existingAccountDomains.Contains(discovered.Domain),
                    Status = parsedStatus
                };
                _db.Sites.Add(site);
                if (parsedStatus == SiteStatus.Pending)
                {
                    pendingSiteIds.Add(site.Id);
                }
            }

            if (pendingSiteIds.Count == 0)
            {
                campaign.Status = jobStatus.Sites.Any(s => s.Status == "Unreachable")
                    ? CampaignStatus.CompletedWithErrors
                    : CampaignStatus.Completed;
                await _db.SaveChangesAsync(ct);
                return;
            }

            var (quotaAllowed, quotaMsg) = await _quotas.CanRunAuditsAsync(userId, pendingSiteIds.Count, ct);
            if (!quotaAllowed)
            {
                _logger.LogWarning("Audit quota exceeded for campaign {CampaignId}: {Reason}", campaignId, quotaMsg);
                campaign.Status = CampaignStatus.CompletedWithErrors;
                await _db.SaveChangesAsync(ct);
                return;
            }

            await RunPendingAuditsBatchAsync(campaign, pendingSiteIds, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Discovery/Audit pipeline failed for campaign {CampaignId}", campaignId);
            campaign.Status = CampaignStatus.CompletedWithErrors;
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task ExecutePendingAuditsAsync(Guid campaignId, CancellationToken ct = default)
    {
        var campaign = await _db.Campaigns
            .Include(c => c.Workspace)
            .Include(c => c.Sites)
            .FirstOrDefaultAsync(c => c.Id == campaignId, ct);

        if (campaign is null || campaign.Status is CampaignStatus.Cancelled or CampaignStatus.Paused)
        {
            return;
        }

        var pendingSiteIds = campaign.Sites
            .Where(s => s.Status == SiteStatus.Pending)
            .Select(s => s.Id)
            .ToList();

        if (pendingSiteIds.Count == 0)
        {
            var anyError = campaign.Sites.Any(s => s.Status is SiteStatus.Failed or SiteStatus.Unreachable);
            campaign.Status = anyError ? CampaignStatus.CompletedWithErrors : CampaignStatus.Completed;
            await _db.SaveChangesAsync(ct);
            return;
        }

        try
        {
            var (quotaAllowed, quotaMsg) = await _quotas.CanRunAuditsAsync(campaign.Workspace.UserId, pendingSiteIds.Count, ct);
            if (!quotaAllowed)
            {
                _logger.LogWarning("Audit quota exceeded for retry on campaign {CampaignId}: {Reason}", campaignId, quotaMsg);
                campaign.Status = CampaignStatus.CompletedWithErrors;
                await _db.SaveChangesAsync(ct);
                return;
            }

            await RunPendingAuditsBatchAsync(campaign, pendingSiteIds, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Pending audits batch failed for campaign {CampaignId}", campaignId);
            campaign.Status = CampaignStatus.CompletedWithErrors;
            await _db.SaveChangesAsync(ct);
        }
    }

    private async Task RunPendingAuditsBatchAsync(Campaign campaign, List<Guid> pendingSiteIds, CancellationToken ct)
    {
        campaign.Status = CampaignStatus.Auditing;
        await _db.SaveChangesAsync(ct);

        using var semaphore = new SemaphoreSlim(MaxParallelAudits);
        var tasks = pendingSiteIds.Select(async siteId =>
        {
            await semaphore.WaitAsync(ct);
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var innerOrchestrator = scope.ServiceProvider.GetRequiredService<ICampaignOrchestrator>();
                await innerOrchestrator.ExecuteSingleSiteAuditAsync(siteId, ct);
            }
            finally
            {
                semaphore.Release();
            }
        });

        await Task.WhenAll(tasks);

        var currentCampaignStatus = await _db.Campaigns
            .AsNoTracking()
            .Where(c => c.Id == campaign.Id)
            .Select(c => c.Status)
            .FirstAsync(ct);

        if (currentCampaignStatus is not CampaignStatus.Paused and not CampaignStatus.Cancelled)
        {
            var anyError = await _db.Sites
                .AsNoTracking()
                .AnyAsync(
                    s => s.CampaignId == campaign.Id
                        && (s.Status == SiteStatus.Failed || s.Status == SiteStatus.Unreachable || s.Status == SiteStatus.Pending),
                    ct);
            campaign.Status = anyError ? CampaignStatus.CompletedWithErrors : CampaignStatus.Completed;
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task ExecuteSingleSiteAuditAsync(Guid siteId, CancellationToken ct = default)
    {
        var site = await _db.Sites
            .Include(s => s.Campaign)
            .Include(s => s.Audits)
            .Include(s => s.Contacts)
            .FirstOrDefaultAsync(s => s.Id == siteId, ct);

        if (site is null || site.Campaign.Status is CampaignStatus.Cancelled or CampaignStatus.Paused)
        {
            return;
        }

        var profile = _profiles.GetProfile(site.Campaign.ProfileKey, site.Campaign.ProfileVersion);
        if (profile is null)
        {
            _logger.LogError("Profile {Key} v{Version} not found for site {SiteId}",
                site.Campaign.ProfileKey, site.Campaign.ProfileVersion, siteId);
            return;
        }

        var nextVersion = site.Audits.Count > 0 ? site.Audits.Max(a => a.Version) + 1 : 1;
        var audit = new Audit
        {
            SiteId = site.Id,
            Version = nextVersion,
            StartedAt = DateTimeOffset.UtcNow,
            Status = AuditStatus.Running
        };

        site.Status = SiteStatus.Auditing;
        _db.Audits.Add(audit);
        await _db.SaveChangesAsync(ct);

        AuditJobStatusDto? finalResult = null;
        for (var attempt = 1; attempt <= MaxAuditAttempts; attempt++)
        {
            try
            {
                var jobId = await _auditClient.EnqueueAuditAsync(
                    audit.Id,
                    site.Id,
                    site.Url,
                    site.Campaign.ProfileKey,
                    site.Campaign.ProfileVersion,
                    ct);

                for (var poll = 0; poll < 130; poll++)
                {
                    ct.ThrowIfCancellationRequested();
                    await Task.Delay(1000, ct);
                    finalResult = await _auditClient.GetAuditJobStatusAsync(jobId, ct);
                    if (finalResult.Status is "completed" or "failed")
                    {
                        break;
                    }
                }

                if (finalResult?.Status == "completed")
                {
                    break;
                }
            }
            catch (Exception ex) when (attempt < MaxAuditAttempts && ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Audit attempt {Attempt} failed for site {SiteId}", attempt, siteId);
            }
        }

        audit.FinishedAt = DateTimeOffset.UtcNow;

        if (finalResult is null || finalResult.Status != "completed")
        {
            audit.Status = AuditStatus.Failed;
            audit.FailureReason = ParseFailureReason(finalResult?.FailureReason);
            audit.FailureDetails = finalResult?.Detail ?? "Audit did not complete.";
            site.Status = SiteStatus.Failed;
            await _db.SaveChangesAsync(ct);
            return;
        }

        var checkInputs = finalResult.Findings.Select(f => new AuditCheckInput(
            f.CheckId,
            f.Category,
            ParseCheckResult(f.Result))).ToList();

        var scoreResult = _scoreCalculator.Calculate(profile, checkInputs);
        audit.Score = scoreResult.Score;
        audit.CoverageRatio = scoreResult.CoverageRatio;
        audit.CategoryScoresJson = JsonSerializer.Serialize(scoreResult.CategoryScores);
        audit.Status = scoreResult.IsPartial ? AuditStatus.Partial : AuditStatus.Completed;
        audit.Summary = BuildSummary(site.Domain, scoreResult, finalResult.Findings, profile);

        site.NeedScore = scoreResult.Score;
        site.Level = scoreResult.Level;
        site.Status = scoreResult.IsPartial ? SiteStatus.PartialAudit : SiteStatus.Audited;

        foreach (var f in finalResult.Findings)
        {
            var finding = new Finding
            {
                AuditId = audit.Id,
                CheckId = f.CheckId,
                Category = f.Category,
                Result = ParseCheckResult(f.Result),
                Value = f.Value,
                Impact = f.Impact,
                Effort = f.Effort,
                Service = f.Service,
                ScoreContribution = scoreResult.FindingContributions.GetValueOrDefault(f.CheckId, 0m)
            };

            foreach (var ev in f.Evidence)
            {
                var kind = ev.Kind.ToLowerInvariant() switch
                {
                    "screenshot" => EvidenceKind.Screenshot,
                    "html_snippet" => EvidenceKind.HtmlSnippet,
                    _ => EvidenceKind.Metric
                };

                string? payload = null;
                if (ev.Snippet is not null)
                {
                    payload = JsonSerializer.Serialize(ev.Snippet);
                }
                else if (ev.Metric is not null)
                {
                    payload = JsonSerializer.Serialize(ev.Metric);
                }

                finding.Evidences.Add(new Evidence
                {
                    Kind = kind,
                    FileRef = ev.Ref,
                    PayloadJson = payload
                });
            }

            _db.Findings.Add(finding);
        }

        var existingContacts = site.Contacts.Select(c => (c.Kind, c.Value.ToLowerInvariant())).ToHashSet();
        foreach (var contact in finalResult.Contacts)
        {
            var kind = Enum.TryParse<ContactKind>(contact.Kind, true, out var ck) ? ck : ContactKind.Email;
            if (existingContacts.Add((kind, contact.Value.ToLowerInvariant())))
            {
                _db.Contacts.Add(new Contact
                {
                    SiteId = site.Id,
                    Kind = kind,
                    Value = contact.Value,
                    SourcePage = contact.SourcePage,
                    IsManual = false
                });
            }
        }

        site.NoContactsFound = !site.Contacts.Any() && finalResult.Contacts.Count == 0;
        await _db.SaveChangesAsync(ct);
    }

    private static CheckResultStatus ParseCheckResult(string raw) => raw.ToLowerInvariant() switch
    {
        "pass" => CheckResultStatus.Pass,
        "warning" => CheckResultStatus.Warning,
        "fail" => CheckResultStatus.Fail,
        "not_applicable" => CheckResultStatus.NotApplicable,
        _ => CheckResultStatus.Unavailable
    };

    private static AuditFailureReason ParseFailureReason(string? raw) => (raw ?? "").ToLowerInvariant() switch
    {
        "unavailable" => AuditFailureReason.Unreachable,
        "bot_blocked" => AuditFailureReason.BotBlocked,
        "too_slow" => AuditFailureReason.TooSlow,
        "internal_error" => AuditFailureReason.InternalError,
        _ => AuditFailureReason.InternalError
    };

    private static string BuildSummary(
        string domain,
        NeedScoreResult score,
        IReadOnlyList<AuditFindingPayload> findings,
        ServiceProfileDto profile)
    {
        var topIssues = findings
            .Where(f => string.Equals(f.Result, "fail", StringComparison.OrdinalIgnoreCase)
                     || string.Equals(f.Result, "warning", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(f => score.FindingContributions.GetValueOrDefault(f.CheckId, 0m))
            .Take(2)
            .Select(f => profile.Checks.FirstOrDefault(c => c.Id == f.CheckId)?.Title.Uk ?? f.CheckId)
            .ToList();

        var levelLabel = score.Level switch
        {
            NeedLevel.Healthy => "здоровий",
            NeedLevel.Moderate => "помірний",
            NeedLevel.Weak => "слабкий",
            _ => "критичний"
        };

        if (topIssues.Count == 0)
        {
            return $"Сайт {domain} отримав Need score {score.Score}/100 ({levelLabel}). Критичних технічних проблем не виявлено.";
        }

        return $"Сайт {domain} отримав Need score {score.Score}/100 (рівень: {levelLabel}). Основні зони росту: {string.Join("; ", topIssues)}.";
    }
}
