using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LeadLens.Api.Extensions;
using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using LeadLens.Domain.Entities;
using LeadLens.Domain.Enums;
using LeadLens.Infrastructure.Persistence;
using LeadLens.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace LeadLens.Api.Controllers;

[Authorize]
[EnableRateLimiting("api")]
[ApiController]
[Route("api/v1")]
public class ReportsController : ControllerBase
{
    private const int MaxPdfBytes = 5 * 1024 * 1024; // 5 MB (FR-RPT-06)

    private readonly LeadLensDbContext _db;
    private readonly IServiceProfileRegistry _profiles;
    private readonly IAuditClient _auditClient;
    private readonly IQuotaService _quotas;
    private readonly ICampaignJobScheduler _scheduler;

    public ReportsController(
        LeadLensDbContext db,
        IServiceProfileRegistry profiles,
        IAuditClient auditClient,
        IQuotaService quotas,
        ICampaignJobScheduler scheduler)
    {
        _db = db;
        _profiles = profiles;
        _auditClient = auditClient;
        _quotas = quotas;
        _scheduler = scheduler;
    }

    [HttpGet("leads/{id:guid}/report")]
    public async Task<IActionResult> GetReport(Guid id, [FromQuery] int? version = null, CancellationToken ct = default)
    {
        var report = await BuildSiteReportAsync(id, version, ct);
        if (report is null)
        {
            return Problem(title: "Audit report not found", statusCode: StatusCodes.Status404NotFound);
        }

        return Ok(report);
    }

    [HttpGet("leads/{id:guid}/report.pdf")]
    public async Task<IActionResult> DownloadReportPdf(
        Guid id,
        [FromQuery] int? version = null,
        [FromQuery] string lang = "uk",
        CancellationToken ct = default)
    {
        var report = await BuildSiteReportAsync(id, version, ct);
        if (report is null)
        {
            return Problem(title: "Audit report not found", statusCode: StatusCodes.Status404NotFound);
        }

        var html = ReportHtmlBuilder.BuildPdfHtml(report, lang);
        var pdfBytes = await _auditClient.RenderPdfAsync(html, ct);
        if (pdfBytes.Length > MaxPdfBytes)
        {
            return Problem(
                title: "PDF size limit exceeded",
                detail: $"Generated PDF ({pdfBytes.Length} bytes) exceeds 5 MB limit.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        var safeDomain = report.Domain.Replace('/', '_').Replace('\\', '_');
        return File(pdfBytes, "application/pdf", $"{safeDomain}-audit-v{report.AuditVersion}.pdf");
    }

    [HttpPost("leads/{id:guid}/audit")]
    public async Task<IActionResult> ReauditSite(Guid id, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == id && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null)
        {
            return Problem(title: "Lead not found", statusCode: StatusCodes.Status404NotFound);
        }

        var (allowed, quotaMsg) = await _quotas.CanRunAuditsAsync(userId, 1, ct);
        if (!allowed)
        {
            return Problem(
                title: "Monthly audit quota exceeded",
                detail: quotaMsg,
                statusCode: StatusCodes.Status429TooManyRequests);
        }

        _scheduler.EnqueueSiteAudit(site.Id);
        return Accepted(new { siteId = site.Id, status = "queued" });
    }

    [HttpPost("leads/{id:guid}/report/share")]
    public async Task<IActionResult> CreateShareLink(Guid id, [FromQuery] int? version = null, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var auditQuery = _db.Audits
            .Where(a => a.SiteId == id &&
                        a.Site.Campaign.Workspace.UserId == userId &&
                        (a.Status == AuditStatus.Completed || a.Status == AuditStatus.Partial));

        var audit = version.HasValue
            ? await auditQuery.FirstOrDefaultAsync(a => a.Version == version.Value, ct)
            : await auditQuery.OrderByDescending(a => a.Version).FirstOrDefaultAsync(ct);

        if (audit is null)
        {
            return Problem(title: "Audit report not found", statusCode: StatusCodes.Status404NotFound);
        }

        var tokenBytes = RandomNumberGenerator.GetBytes(24);
        var rawToken = Convert.ToBase64String(tokenBytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var tokenHash = HashToken(rawToken);

        var link = new ReportShareLink
        {
            AuditId = audit.Id,
            TokenHash = tokenHash,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(14)
        };

        _db.ReportShareLinks.Add(link);
        await _db.SaveChangesAsync(ct);

        return Created(string.Empty, new ReportShareLinkDto(
            link.Id,
            rawToken,
            link.ExpiresAt,
            $"/public/reports/{rawToken}"));
    }

    [HttpDelete("leads/{id:guid}/report/share/{linkId:guid}")]
    public async Task<IActionResult> RevokeShareLink(Guid id, Guid linkId, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var link = await _db.ReportShareLinks
            .FirstOrDefaultAsync(l => l.Id == linkId &&
                                      l.Audit.SiteId == id &&
                                      l.Audit.Site.Campaign.Workspace.UserId == userId, ct);

        if (link is null)
        {
            return Problem(title: "Share link not found", statusCode: StatusCodes.Status404NotFound);
        }

        link.RevokedAt ??= DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    [AllowAnonymous]
    [HttpGet("public/reports/{token}")]
    public async Task<IActionResult> GetPublicReport(string token, CancellationToken ct = default)
    {
        var hash = HashToken(token);
        var link = await _db.ReportShareLinks
            .AsNoTracking()
            .Include(l => l.Audit)
            .ThenInclude(a => a.Site)
            .ThenInclude(s => s.Campaign)
            .Include(l => l.Audit)
            .ThenInclude(a => a.Findings)
            .FirstOrDefaultAsync(l => l.TokenHash == hash, ct);

        if (link is null || link.RevokedAt is not null || link.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return Problem(title: "Public report link is invalid or expired", statusCode: StatusCodes.Status404NotFound);
        }

        var audit = link.Audit;
        var site = audit.Site;
        var profile = _profiles.GetProfile(site.Campaign.ProfileKey, site.Campaign.ProfileVersion);
        var checkCatalog = profile?.Checks.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase)
                           ?? new Dictionary<string, ServiceProfileCheckDto>(StringComparer.OrdinalIgnoreCase);

        var topFindings = audit.Findings
            .Where(f => f.Result is CheckResultStatus.Fail or CheckResultStatus.Warning)
            .OrderByDescending(f => f.ScoreContribution)
            .Take(8)
            .Select(f =>
            {
                checkCatalog.TryGetValue(f.CheckId, out var cfg);
                return new PublicFindingSummaryDto(
                    f.CheckId,
                    f.Category,
                    cfg?.Title.Uk ?? f.CheckId,
                    cfg?.Title.En ?? f.CheckId,
                    f.Result.ToString(),
                    f.Value,
                    f.ScoreContribution);
            })
            .ToList();

        return Ok(new PublicReportDto(
            site.Domain,
            site.Url,
            audit.Version,
            audit.FinishedAt ?? audit.CreatedAt,
            audit.Score ?? site.NeedScore ?? 0,
            (site.Level ?? NeedLevel.Healthy).ToString(),
            audit.Summary ?? string.Empty,
            topFindings));
    }

    [HttpGet("artifacts/{*key}")]
    public async Task<IActionResult> ProxyArtifact(string key, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var parts = key.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2 || !string.Equals(parts[0], "audits", StringComparison.OrdinalIgnoreCase) || !Guid.TryParse(parts[1], out var auditId))
        {
            return Problem(title: "Invalid artifact key", statusCode: StatusCodes.Status400BadRequest);
        }

        var ownsAudit = await _db.Audits
            .AsNoTracking()
            .AnyAsync(a => a.Id == auditId && a.Site.Campaign.Workspace.UserId == userId, ct);

        if (!ownsAudit)
        {
            return Problem(title: "Artifact not found", statusCode: StatusCodes.Status404NotFound);
        }

        var (content, contentType) = await _auditClient.DownloadArtifactAsync(key, ct);
        return File(content, contentType);
    }

    private async Task<SiteReportDto?> BuildSiteReportAsync(Guid siteId, int? version, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .AsNoTracking()
            .Include(s => s.Campaign)
            .Include(s => s.Contacts)
            .FirstOrDefaultAsync(s => s.Id == siteId && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null) return null;

        var auditQuery = _db.Audits
            .AsNoTracking()
            .Include(a => a.Findings)
            .ThenInclude(f => f.Evidences)
            .Where(a => a.SiteId == site.Id && (a.Status == AuditStatus.Completed || a.Status == AuditStatus.Partial));

        var audit = version.HasValue
            ? await auditQuery.FirstOrDefaultAsync(a => a.Version == version.Value, ct)
            : await auditQuery.OrderByDescending(a => a.Version).FirstOrDefaultAsync(ct);

        if (audit is null) return null;

        var profile = _profiles.GetProfile(site.Campaign.ProfileKey, site.Campaign.ProfileVersion);
        var checkCatalog = profile?.Checks.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase)
                           ?? new Dictionary<string, ServiceProfileCheckDto>(StringComparer.OrdinalIgnoreCase);

        var siteCategoryScores = ParseCategoryScores(audit.CategoryScoresJson);

        var campaignLatestAudits = await _db.Sites
            .AsNoTracking()
            .Where(s => s.CampaignId == site.CampaignId)
            .Select(s => s.Audits
                .Where(a => a.Status == AuditStatus.Completed || a.Status == AuditStatus.Partial)
                .OrderByDescending(a => a.Version)
                .Select(a => new { a.Score, a.CategoryScoresJson })
                .FirstOrDefault())
            .ToListAsync(ct);

        var validScores = campaignLatestAudits
            .Where(x => x is not null && x.Score.HasValue)
            .Select(x => (decimal)x!.Score!.Value)
            .ToList();

        decimal? campaignMedianScore = Median(validScores);

        var campaignCategoryBuckets = new Dictionary<string, List<decimal>>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in campaignLatestAudits.Where(x => x is not null))
        {
            foreach (var (k, v) in ParseCategoryScores(item!.CategoryScoresJson))
            {
                if (!campaignCategoryBuckets.TryGetValue(k, out var list))
                {
                    list = new List<decimal>();
                    campaignCategoryBuckets[k] = list;
                }
                list.Add(v);
            }
        }

        var categoryComparisons = (profile?.Categories ?? Array.Empty<ServiceProfileCategoryDto>())
            .Select(cat => new CategoryComparisonDto(
                cat.Key,
                cat.Name.Uk,
                cat.Name.En,
                siteCategoryScores.GetValueOrDefault(cat.Key, 0m),
                campaignCategoryBuckets.TryGetValue(cat.Key, out var vals) ? Median(vals) : null))
            .ToList();

        var findingDtos = audit.Findings
            .OrderByDescending(f => f.ScoreContribution)
            .ThenByDescending(f => f.Impact)
            .Select(f =>
            {
                checkCatalog.TryGetValue(f.CheckId, out var cfg);
                return new FindingDto(
                    f.Id,
                    f.CheckId,
                    f.Category,
                    cfg?.Title.Uk ?? f.CheckId,
                    cfg?.Title.En ?? f.CheckId,
                    cfg?.Description.Uk ?? string.Empty,
                    cfg?.Description.En ?? string.Empty,
                    f.Result.ToString(),
                    f.Value,
                    f.Impact,
                    f.Effort,
                    f.Service,
                    f.ScoreContribution,
                    f.Evidences.Select(e => new EvidenceDto(e.Id, e.Kind.ToString(), e.FileRef, e.PayloadJson)).ToList());
            })
            .ToList();

        var contactDtos = site.Contacts
            .Select(c => new ContactDto(c.Id, c.Kind.ToString(), c.Value, c.SourcePage, c.IsManual))
            .ToList();

        return new SiteReportDto(
            site.Id,
            site.Domain,
            site.Url,
            audit.Id,
            audit.Version,
            audit.FinishedAt ?? audit.CreatedAt,
            audit.Status.ToString(),
            audit.Score ?? site.NeedScore ?? 0,
            (site.Level ?? NeedLevel.Healthy).ToString(),
            audit.CoverageRatio,
            audit.Summary ?? string.Empty,
            campaignMedianScore,
            categoryComparisons,
            findingDtos,
            contactDtos,
            $"audits/{audit.Id}/desktop.png",
            $"audits/{audit.Id}/mobile.png");
    }

    private static string HashToken(string rawToken) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));

    private static Dictionary<string, decimal> ParseCategoryScores(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new(StringComparer.OrdinalIgnoreCase);
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, decimal>>(json)
                   ?? new(StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static decimal? Median(List<decimal> values)
    {
        if (values.Count == 0) return null;
        values.Sort();
        var mid = values.Count / 2;
        if (values.Count % 2 == 1) return Math.Round(values[mid], 1);
        return Math.Round((values[mid - 1] + values[mid]) / 2m, 1);
    }
}
