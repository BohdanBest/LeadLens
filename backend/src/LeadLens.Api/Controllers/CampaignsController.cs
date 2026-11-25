using System.Text;
using LeadLens.Api.Extensions;
using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using LeadLens.Domain.Entities;
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
[Route("api/v1/campaigns")]
public class CampaignsController : ControllerBase
{
    private readonly LeadLensDbContext _db;
    private readonly IServiceProfileRegistry _profiles;
    private readonly IQuotaService _quotas;
    private readonly ICampaignJobScheduler _scheduler;

    public CampaignsController(
        LeadLensDbContext db,
        IServiceProfileRegistry profiles,
        IQuotaService quotas,
        ICampaignJobScheduler scheduler)
    {
        _db = db;
        _profiles = profiles;
        _quotas = quotas;
        _scheduler = scheduler;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? cursor = null,
        [FromQuery] int limit = 20,
        [FromQuery] bool includeArchived = false,
        CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var clampedLimit = Math.Clamp(limit, 1, 100);

        var query = _db.Campaigns
            .AsNoTracking()
            .Where(c => c.Workspace.UserId == userId);

        if (!includeArchived)
        {
            query = query.Where(c => !c.IsArchived);
        }

        if (TryDecodeCursor(cursor, out var cursorTime, out var cursorId))
        {
            query = query.Where(c => c.CreatedAt < cursorTime || (c.CreatedAt == cursorTime && c.Id.CompareTo(cursorId) < 0));
        }

        var rows = await query
            .OrderByDescending(c => c.CreatedAt)
            .ThenByDescending(c => c.Id)
            .Take(clampedLimit + 1)
            .Select(c => new
            {
                Campaign = c,
                SitesFound = c.Sites.Count,
                SitesAudited = c.Sites.Count(s => s.Status == SiteStatus.Audited || s.Status == SiteStatus.PartialAudit),
                SitesFailed = c.Sites.Count(s => s.Status == SiteStatus.Failed || s.Status == SiteStatus.Unreachable)
            })
            .ToListAsync(ct);

        var hasMore = rows.Count > clampedLimit;
        var pageItems = rows.Take(clampedLimit).Select(r => new CampaignSummaryDto(
            r.Campaign.Id,
            r.Campaign.Name,
            r.Campaign.Niche,
            r.Campaign.Region,
            r.Campaign.SearchLanguage,
            r.Campaign.SiteLimit,
            r.Campaign.ProfileKey,
            r.Campaign.ProfileVersion,
            r.Campaign.Status.ToString(),
            r.Campaign.IsArchived,
            r.SitesFound,
            r.SitesAudited,
            r.SitesFailed,
            r.Campaign.CreatedAt,
            r.Campaign.UpdatedAt)).ToList();

        var nextCursor = hasMore
            ? EncodeCursor(pageItems[^1].CreatedAt, pageItems[^1].Id)
            : null;

        return Ok(new PagedResponse<CampaignSummaryDto>(pageItems, nextCursor, hasMore));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCampaignRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var workspace = await _db.Workspaces.FirstOrDefaultAsync(w => w.UserId == userId, ct);
        if (workspace is null)
        {
            return Problem(title: "Workspace not found", statusCode: StatusCodes.Status404NotFound);
        }

        var profile = _profiles.GetProfile(request.ProfileKey, request.ProfileVersion);
        if (profile is null)
        {
            return Problem(
                title: "Invalid service profile",
                detail: $"Service profile '{request.ProfileKey}' v{request.ProfileVersion} was not found.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (request.SourceType == "ManualList" && (request.ManualUrls is null || request.ManualUrls.Count == 0))
        {
            return Problem(
                title: "Manual URL list is empty",
                detail: "Provide at least one URL when SourceType is ManualList.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (request.SourceType == "CsvImport" && string.IsNullOrWhiteSpace(request.CsvContent))
        {
            return Problem(
                title: "CSV content is missing",
                detail: "Provide CSV content with a 'url' column when SourceType is CsvImport.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (request.StartImmediately)
        {
            var (allowed, quotaMessage) = await _quotas.CanStartCampaignAsync(userId, ct);
            if (!allowed)
            {
                return Problem(
                    title: "Concurrent campaign quota exceeded",
                    detail: quotaMessage,
                    statusCode: StatusCodes.Status429TooManyRequests);
            }
        }

        var campaign = new Campaign
        {
            WorkspaceId = workspace.Id,
            ProfileKey = profile.Key,
            ProfileVersion = profile.Version,
            Name = request.Name.Trim(),
            Niche = request.Niche.Trim(),
            Region = string.IsNullOrWhiteSpace(request.Region) ? null : request.Region.Trim(),
            SearchLanguage = request.SearchLanguage,
            SiteLimit = request.SiteLimit,
            ExclusionKeywords = request.ExclusionKeywords?
                .Where(k => !string.IsNullOrWhiteSpace(k))
                .Select(k => k.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList() ?? new(),
            Status = request.StartImmediately ? CampaignStatus.Discovering : CampaignStatus.Draft
        };

        _db.Campaigns.Add(campaign);
        await _db.SaveChangesAsync(ct);

        if (request.StartImmediately)
        {
            _scheduler.EnqueueDiscovery(
                campaign.Id,
                request.SourceType,
                request.ManualUrls ?? Array.Empty<string>(),
                request.CsvContent);
        }

        return CreatedAtAction(nameof(GetById), new { id = campaign.Id }, MapDetail(campaign, Array.Empty<Site>()));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var campaign = await _db.Campaigns
            .AsNoTracking()
            .Include(c => c.Sites)
            .FirstOrDefaultAsync(c => c.Id == id && c.Workspace.UserId == userId, ct);

        if (campaign is null)
        {
            return Problem(title: "Campaign not found", statusCode: StatusCodes.Status404NotFound);
        }

        return Ok(MapDetail(campaign, campaign.Sites));
    }

    [HttpGet("{id:guid}/progress")]
    public async Task<IActionResult> GetProgress(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var campaign = await _db.Campaigns
            .AsNoTracking()
            .Include(c => c.Sites)
            .FirstOrDefaultAsync(c => c.Id == id && c.Workspace.UserId == userId, ct);

        if (campaign is null)
        {
            return Problem(title: "Campaign not found", statusCode: StatusCodes.Status404NotFound);
        }

        return Ok(ComputeProgress(campaign, campaign.Sites));
    }

    [HttpPost("{id:guid}/pause")]
    public async Task<IActionResult> Pause(Guid id, CancellationToken ct)
    {
        var campaign = await FindOwnedCampaignAsync(id, ct);
        if (campaign is null) return NotFoundCampaign();

        if (campaign.Status is CampaignStatus.Discovering or CampaignStatus.Auditing)
        {
            campaign.Status = CampaignStatus.Paused;
            await _db.SaveChangesAsync(ct);
        }

        return Ok(ComputeProgress(campaign, campaign.Sites));
    }

    [HttpPost("{id:guid}/resume")]
    public async Task<IActionResult> Resume(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var campaign = await FindOwnedCampaignAsync(id, ct);
        if (campaign is null) return NotFoundCampaign();

        if (campaign.Status is CampaignStatus.Paused or CampaignStatus.Draft)
        {
            var (allowed, msg) = await _quotas.CanStartCampaignAsync(userId, ct);
            if (!allowed)
            {
                return Problem(title: "Concurrent campaign quota exceeded", detail: msg, statusCode: StatusCodes.Status429TooManyRequests);
            }

            if (campaign.Sites.Any(s => s.Status is SiteStatus.Pending or SiteStatus.Failed or SiteStatus.Unreachable))
            {
                campaign.Status = CampaignStatus.Auditing;
                await _db.SaveChangesAsync(ct);
                _scheduler.EnqueuePendingAudits(campaign.Id);
            }
            else
            {
                campaign.Status = CampaignStatus.Discovering;
                await _db.SaveChangesAsync(ct);
                _scheduler.EnqueueDiscovery(campaign.Id, "ManualList", Array.Empty<string>(), null);
            }
        }

        return Ok(ComputeProgress(campaign, campaign.Sites));
    }

    [HttpPost("{id:guid}/retry")]
    public async Task<IActionResult> RetryFailed(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var campaign = await FindOwnedCampaignAsync(id, ct);
        if (campaign is null) return NotFoundCampaign();

        var retrySites = campaign.Sites
            .Where(s => s.Status is SiteStatus.Failed or SiteStatus.Unreachable or SiteStatus.Pending)
            .ToList();

        if (retrySites.Count > 0)
        {
            var (allowed, msg) = await _quotas.CanRunAuditsAsync(userId, retrySites.Count, ct);
            if (!allowed)
            {
                return Problem(title: "Monthly audit quota exceeded", detail: msg, statusCode: StatusCodes.Status429TooManyRequests);
            }

            foreach (var site in retrySites)
            {
                site.Status = SiteStatus.Pending;
            }

            campaign.Status = CampaignStatus.Auditing;
            await _db.SaveChangesAsync(ct);
            _scheduler.EnqueuePendingAudits(campaign.Id);
        }

        return Ok(ComputeProgress(campaign, campaign.Sites));
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        var campaign = await FindOwnedCampaignAsync(id, ct);
        if (campaign is null) return NotFoundCampaign();

        if (campaign.Status is not CampaignStatus.Completed and not CampaignStatus.Cancelled)
        {
            campaign.Status = CampaignStatus.Cancelled;
            await _db.SaveChangesAsync(ct);
        }

        return Ok(ComputeProgress(campaign, campaign.Sites));
    }

    [HttpPost("{id:guid}/duplicate")]
    public async Task<IActionResult> Duplicate(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var source = await _db.Campaigns
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id && c.Workspace.UserId == userId, ct);

        if (source is null) return NotFoundCampaign();

        var copyName = $"{source.Name} (Copy)";
        if (copyName.Length > 80) copyName = copyName[..80];

        var copy = new Campaign
        {
            WorkspaceId = source.WorkspaceId,
            ProfileKey = source.ProfileKey,
            ProfileVersion = source.ProfileVersion,
            Name = copyName,
            Niche = source.Niche,
            Region = source.Region,
            SearchLanguage = source.SearchLanguage,
            SiteLimit = source.SiteLimit,
            ExclusionKeywords = new List<string>(source.ExclusionKeywords),
            Status = CampaignStatus.Draft,
            IsArchived = false
        };

        _db.Campaigns.Add(copy);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetById), new { id = copy.Id }, MapDetail(copy, Array.Empty<Site>()));
    }

    [HttpPost("{id:guid}/archive")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        var campaign = await FindOwnedCampaignAsync(id, ct);
        if (campaign is null) return NotFoundCampaign();

        campaign.IsArchived = true;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/unarchive")]
    public async Task<IActionResult> Unarchive(Guid id, CancellationToken ct)
    {
        var campaign = await FindOwnedCampaignAsync(id, ct);
        if (campaign is null) return NotFoundCampaign();

        campaign.IsArchived = false;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var campaign = await FindOwnedCampaignAsync(id, ct);
        if (campaign is null) return NotFoundCampaign();

        _db.Campaigns.Remove(campaign);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<Campaign?> FindOwnedCampaignAsync(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        return await _db.Campaigns
            .Include(c => c.Sites)
            .FirstOrDefaultAsync(c => c.Id == id && c.Workspace.UserId == userId, ct);
    }

    private IActionResult NotFoundCampaign() =>
        Problem(title: "Campaign not found", statusCode: StatusCodes.Status404NotFound);

    private static CampaignProgressDto ComputeProgress(Campaign campaign, IEnumerable<Site> sites)
    {
        var list = sites.ToList();
        var found = list.Count;
        var excluded = list.Count(s => s.Status == SiteStatus.Excluded);
        var failed = list.Count(s => s.Status is SiteStatus.Failed or SiteStatus.Unreachable);
        var audited = list.Count(s => s.Status is SiteStatus.Audited or SiteStatus.PartialAudit);
        var reachable = list.Count(s => s.Status is not SiteStatus.Excluded and not SiteStatus.Unreachable);

        return new CampaignProgressDto(
            campaign.Id,
            campaign.Status.ToString(),
            found,
            reachable,
            audited,
            failed,
            excluded);
    }

    private static CampaignDetailDto MapDetail(Campaign c, IEnumerable<Site> sites)
    {
        var list = sites.OrderByDescending(s => s.NeedScore ?? -1).ThenBy(s => s.Domain).ToList();
        var scored = list.Where(s => s.NeedScore.HasValue).ToList();
        double? avgScore = scored.Count > 0 ? Math.Round(scored.Average(s => s.NeedScore!.Value), 1) : null;

        var dist = new CampaignNeedDistributionDto(
            list.Count(s => s.Level == NeedLevel.Healthy),
            list.Count(s => s.Level == NeedLevel.Moderate),
            list.Count(s => s.Level == NeedLevel.Weak),
            list.Count(s => s.Level == NeedLevel.Critical));

        var siteDtos = list.Select(s => new CampaignSiteDto(
            s.Id,
            s.Domain,
            s.Url,
            s.BusinessName,
            s.Source.ToString(),
            s.IsDuplicateAcrossAccount,
            s.Status.ToString(),
            s.NeedScore,
            s.Level?.ToString(),
            s.LeadStatus.ToString())).ToList();

        return new CampaignDetailDto(
            c.Id,
            c.Name,
            c.Niche,
            c.Region,
            c.SearchLanguage,
            c.SiteLimit,
            c.ExclusionKeywords,
            c.ProfileKey,
            c.ProfileVersion,
            c.Status.ToString(),
            c.IsArchived,
            ComputeProgress(c, list),
            avgScore,
            dist,
            siteDtos,
            c.CreatedAt,
            c.UpdatedAt);
    }

    private static string EncodeCursor(DateTimeOffset createdAt, Guid id) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes($"{createdAt.UtcTicks}:{id}"));

    private static bool TryDecodeCursor(string? cursor, out DateTimeOffset createdAt, out Guid id)
    {
        createdAt = default;
        id = default;
        if (string.IsNullOrWhiteSpace(cursor)) return false;
        try
        {
            var raw = Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
            var parts = raw.Split(':', 2);
            if (parts.Length != 2 || !long.TryParse(parts[0], out var ticks) || !Guid.TryParse(parts[1], out id))
                return false;
            createdAt = new DateTimeOffset(ticks, TimeSpan.Zero);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
