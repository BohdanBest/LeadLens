using LeadLens.Api.Extensions;
using LeadLens.Application.DTOs;
using LeadLens.Domain.Enums;
using LeadLens.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace LeadLens.Api.Controllers;

[Authorize]
[EnableRateLimiting("api")]
[ApiController]
[Route("api/v1/dashboard")]
public class DashboardController : ControllerBase
{
    private readonly LeadLensDbContext _db;

    public DashboardController(LeadLensDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string period = "30d", CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var now = DateTimeOffset.UtcNow;
        var since = period switch
        {
            "7d" => now.AddDays(-7),
            "12m" => now.AddMonths(-12),
            _ => now.AddDays(-30)
        };
        var normalizedPeriod = period is "7d" or "12m" ? period : "30d";

        var campaigns = await _db.Campaigns
            .AsNoTracking()
            .Where(c => c.Workspace.UserId == userId && c.CreatedAt >= since)
            .ToListAsync(ct);

        var sites = await _db.Sites
            .AsNoTracking()
            .Include(s => s.Campaign)
            .Where(s => s.Campaign.Workspace.UserId == userId && s.CreatedAt >= since && s.Status != SiteStatus.Excluded)
            .ToListAsync(ct);

        var distribution = new CampaignNeedDistributionDto(
            sites.Count(s => s.Level == NeedLevel.Healthy),
            sites.Count(s => s.Level == NeedLevel.Moderate),
            sites.Count(s => s.Level == NeedLevel.Weak),
            sites.Count(s => s.Level == NeedLevel.Critical));

        var statusFunnel = Enum.GetValues<LeadStatus>()
            .ToDictionary(ls => ls.ToString(), ls => sites.Count(s => s.LeadStatus == ls));

        var siteIds = sites.Select(s => s.Id).ToList();
        var latestAuditIds = await _db.Audits
            .AsNoTracking()
            .Where(a => siteIds.Contains(a.SiteId) && (a.Status == AuditStatus.Completed || a.Status == AuditStatus.Partial))
            .GroupBy(a => a.SiteId)
            .Select(g => g.OrderByDescending(a => a.Version).Select(a => a.Id).First())
            .ToListAsync(ct);

        var rawTopIssues = latestAuditIds.Count == 0
            ? new()
            : await _db.Findings
                .AsNoTracking()
                .Where(f => latestAuditIds.Contains(f.AuditId) && (f.Result == CheckResultStatus.Fail || f.Result == CheckResultStatus.Warning))
                .GroupBy(f => new { f.CheckId, f.Category })
                .Select(g => new { g.Key.CheckId, g.Key.Category, Count = g.Count() })
                .OrderByDescending(x => x.Count)
                .Take(10)
                .ToListAsync(ct);

        var topIssues = rawTopIssues
            .Select(x => new TopIssueDto(x.CheckId, x.Category, x.Count))
            .ToList();

        var campaignAverageScores = sites
            .Where(s => s.NeedScore.HasValue)
            .GroupBy(s => new { s.CampaignId, s.Campaign.Name })
            .Select(g => new CampaignAverageScoreDto(
                g.Key.CampaignId,
                g.Key.Name,
                Math.Round(g.Average(x => x.NeedScore!.Value), 1),
                g.Count()))
            .OrderByDescending(x => x.AverageScore)
            .ToList();

        return Ok(new DashboardDto(
            normalizedPeriod,
            campaigns.Count,
            sites.Count,
            distribution,
            statusFunnel,
            topIssues,
            campaignAverageScores));
    }
}
