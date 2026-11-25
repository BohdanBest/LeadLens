using System.Text;
using LeadLens.Api.Extensions;
using LeadLens.Application.DTOs;
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
[Route("api/v1/leads")]
public class LeadsController : ControllerBase
{
    private readonly LeadLensDbContext _db;

    public LeadsController(LeadLensDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search = null,
        [FromQuery] string? level = null,
        [FromQuery] string? leadStatus = null,
        [FromQuery] Guid? campaignId = null,
        [FromQuery] string? tag = null,
        [FromQuery] string sortBy = "score_desc",
        [FromQuery] string? cursor = null,
        [FromQuery] int limit = 25,
        CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var clampedLimit = Math.Clamp(limit, 1, 100);

        var query = _db.Sites
            .AsNoTracking()
            .Include(s => s.Campaign)
            .Where(s => s.Campaign.Workspace.UserId == userId && s.Status != SiteStatus.Excluded);

        if (campaignId.HasValue)
        {
            query = query.Where(s => s.CampaignId == campaignId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(s =>
                s.Domain.ToLower().Contains(term) ||
                (s.BusinessName != null && s.BusinessName.ToLower().Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(level) && Enum.TryParse<NeedLevel>(level, true, out var parsedLevel))
        {
            query = query.Where(s => s.Level == parsedLevel);
        }

        if (!string.IsNullOrWhiteSpace(leadStatus) && Enum.TryParse<LeadStatus>(leadStatus, true, out var parsedLeadStatus))
        {
            query = query.Where(s => s.LeadStatus == parsedLeadStatus);
        }

        var startIndex = 0;
        if (!string.IsNullOrWhiteSpace(cursor) && int.TryParse(cursor, out var parsedIdx) && parsedIdx > 0)
        {
            startIndex = parsedIdx;
        }

        List<LeadListItemDto> items;
        bool hasMore;

        if (string.IsNullOrWhiteSpace(tag))
        {
            var orderedQuery = sortBy switch
            {
                "score_asc" => query.OrderBy(s => s.NeedScore ?? int.MaxValue).ThenBy(s => s.Id),
                "created_desc" => query.OrderByDescending(s => s.CreatedAt).ThenByDescending(s => s.Id),
                _ => query.OrderByDescending(s => s.NeedScore ?? -1).ThenBy(s => s.Id)
            };

            var rows = await orderedQuery
                .Skip(startIndex)
                .Take(clampedLimit + 1)
                .Select(s => new LeadListItemDto(
                    s.Id,
                    s.CampaignId,
                    s.Campaign.Name,
                    s.Domain,
                    s.Url,
                    s.BusinessName,
                    s.NeedScore,
                    s.Level != null ? s.Level.ToString() : null,
                    s.Status.ToString(),
                    s.LeadStatus.ToString(),
                    s.NoContactsFound,
                    s.Tags,
                    s.CreatedAt))
                .ToListAsync(ct);

            hasMore = rows.Count > clampedLimit;
            items = hasMore ? rows.Take(clampedLimit).ToList() : rows;
        }
        else
        {
            var trimmedTag = tag.Trim();
            var allMatching = (await query.ToListAsync(ct))
                .Where(s => s.Tags.Any(t => string.Equals(t, trimmedTag, StringComparison.OrdinalIgnoreCase)));

            var orderedList = (sortBy switch
            {
                "score_asc" => allMatching.OrderBy(s => s.NeedScore ?? int.MaxValue).ThenBy(s => s.Id),
                "created_desc" => allMatching.OrderByDescending(s => s.CreatedAt).ThenByDescending(s => s.Id),
                _ => allMatching.OrderByDescending(s => s.NeedScore ?? -1).ThenBy(s => s.Id)
            }).ToList();

            var page = orderedList.Skip(startIndex).Take(clampedLimit).ToList();
            hasMore = startIndex + page.Count < orderedList.Count;
            items = page.Select(s => new LeadListItemDto(
                s.Id,
                s.CampaignId,
                s.Campaign.Name,
                s.Domain,
                s.Url,
                s.BusinessName,
                s.NeedScore,
                s.Level?.ToString(),
                s.Status.ToString(),
                s.LeadStatus.ToString(),
                s.NoContactsFound,
                s.Tags,
                s.CreatedAt)).ToList();
        }

        var nextCursor = hasMore ? (startIndex + items.Count).ToString() : null;
        return Ok(new PagedResponse<LeadListItemDto>(items, nextCursor, hasMore));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .AsNoTracking()
            .AsSplitQuery()
            .Include(s => s.Campaign)
            .Include(s => s.Contacts)
            .Include(s => s.Events)
            .Include(s => s.Audits)
            .FirstOrDefaultAsync(s => s.Id == id && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null) return NotFoundLead();

        var latestAuditId = site.Audits
            .OrderByDescending(a => a.Version)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefault();

        var dto = new LeadDetailDto(
            site.Id,
            site.CampaignId,
            site.Campaign.Name,
            site.Domain,
            site.Url,
            site.BusinessName,
            site.Source.ToString(),
            site.IsDuplicateAcrossAccount,
            site.Status.ToString(),
            site.NeedScore,
            site.Level?.ToString(),
            site.LeadStatus.ToString(),
            site.NoContactsFound,
            site.Tags,
            site.Contacts.Select(c => new ContactDto(c.Id, c.Kind.ToString(), c.Value, c.SourcePage, c.IsManual)).ToList(),
            site.Events.OrderByDescending(e => e.CreatedAt)
                .Select(e => new LeadEventDto(e.Id, e.Type.ToString(), e.Note, e.DueAt, e.CreatedAt)).ToList(),
            latestAuditId,
            site.CreatedAt,
            site.UpdatedAt);

        return Ok(dto);
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateLeadStatusRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .FirstOrDefaultAsync(s => s.Id == id && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null) return NotFoundLead();

        if (!Enum.TryParse<LeadStatus>(request.LeadStatus, true, out var nextStatus))
        {
            return Problem(title: "Invalid lead status", detail: $"Unsupported lead status '{request.LeadStatus}'.", statusCode: StatusCodes.Status400BadRequest);
        }

        var prevStatus = site.LeadStatus;
        site.LeadStatus = nextStatus;

        _db.LeadEvents.Add(new LeadEvent
        {
            SiteId = site.Id,
            Type = LeadEventType.StatusChanged,
            Note = string.IsNullOrWhiteSpace(request.Note)
                ? $"Status changed: {prevStatus} -> {nextStatus}"
                : request.Note.Trim()
        });

        await _db.SaveChangesAsync(ct);
        return Ok(new { id = site.Id, leadStatus = site.LeadStatus.ToString() });
    }

    [HttpPatch("bulk-status")]
    public async Task<IActionResult> BulkUpdateStatus([FromBody] BulkUpdateLeadStatusRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!Enum.TryParse<LeadStatus>(request.LeadStatus, true, out var nextStatus))
        {
            return Problem(title: "Invalid lead status", detail: $"Unsupported lead status '{request.LeadStatus}'.", statusCode: StatusCodes.Status400BadRequest);
        }

        var ids = request.LeadIds.Distinct().ToList();

        var sites = await _db.Sites
            .Where(s => ids.Contains(s.Id) && s.Campaign.Workspace.UserId == userId)
            .ToListAsync(ct);

        foreach (var site in sites)
        {
            var prev = site.LeadStatus;
            site.LeadStatus = nextStatus;
            _db.LeadEvents.Add(new LeadEvent
            {
                SiteId = site.Id,
                Type = LeadEventType.StatusChanged,
                Note = $"Bulk status change: {prev} -> {nextStatus}"
            });
        }

        await _db.SaveChangesAsync(ct);
        return Ok(new { updatedCount = sites.Count, leadStatus = nextStatus.ToString() });
    }

    [HttpPut("{id:guid}/tags")]
    public async Task<IActionResult> UpdateTags(Guid id, [FromBody] UpdateLeadTagsRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .FirstOrDefaultAsync(s => s.Id == id && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null) return NotFoundLead();

        site.Tags = request.Tags
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        _db.LeadEvents.Add(new LeadEvent
        {
            SiteId = site.Id,
            Type = LeadEventType.TagUpdated,
            Note = $"Tags updated: {string.Join(", ", site.Tags)}"
        });

        await _db.SaveChangesAsync(ct);
        return Ok(new { id = site.Id, tags = site.Tags });
    }

    [HttpGet("{id:guid}/events")]
    public async Task<IActionResult> ListEvents(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var owns = await _db.Sites.AsNoTracking().AnyAsync(s => s.Id == id && s.Campaign.Workspace.UserId == userId, ct);
        if (!owns) return NotFoundLead();

        var events = await _db.LeadEvents
            .AsNoTracking()
            .Where(e => e.SiteId == id)
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => new LeadEventDto(e.Id, e.Type.ToString(), e.Note, e.DueAt, e.CreatedAt))
            .ToListAsync(ct);

        return Ok(events);
    }

    [HttpPost("{id:guid}/events")]
    public async Task<IActionResult> CreateEvent(Guid id, [FromBody] CreateLeadEventRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var owns = await _db.Sites.AsNoTracking().AnyAsync(s => s.Id == id && s.Campaign.Workspace.UserId == userId, ct);
        if (!owns) return NotFoundLead();

        if (!Enum.TryParse<LeadEventType>(request.Type, true, out var eventType))
        {
            return Problem(title: "Invalid event type", detail: $"Unsupported event type '{request.Type}'.", statusCode: StatusCodes.Status400BadRequest);
        }

        var ev = new LeadEvent
        {
            SiteId = id,
            Type = eventType,
            Note = request.Note.Trim(),
            DueAt = request.DueAt
        };

        _db.LeadEvents.Add(ev);
        await _db.SaveChangesAsync(ct);

        return Created(string.Empty, new LeadEventDto(ev.Id, ev.Type.ToString(), ev.Note, ev.DueAt, ev.CreatedAt));
    }

    [HttpGet("export.csv")]
    public async Task<IActionResult> ExportCsv([FromQuery] Guid? campaignId = null, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var query = _db.Sites
            .AsNoTracking()
            .Include(s => s.Campaign)
            .Include(s => s.Contacts)
            .Where(s => s.Campaign.Workspace.UserId == userId && s.Status != SiteStatus.Excluded);

        if (campaignId.HasValue)
        {
            query = query.Where(s => s.CampaignId == campaignId.Value);
        }

        var sites = await query.OrderByDescending(s => s.NeedScore ?? -1).ToListAsync(ct);

        var sb = new StringBuilder();
        sb.AppendLine("Domain,URL,BusinessName,Campaign,NeedScore,Level,AuditStatus,LeadStatus,Contacts,Tags");

        foreach (var s in sites)
        {
            var contacts = string.Join("; ", s.Contacts.Select(c => $"{c.Kind}:{c.Value}"));
            var tags = string.Join("; ", s.Tags);
            sb.AppendLine(string.Join(",",
                CsvCell(s.Domain),
                CsvCell(s.Url),
                CsvCell(s.BusinessName ?? ""),
                CsvCell(s.Campaign.Name),
                CsvCell(s.NeedScore?.ToString() ?? ""),
                CsvCell(s.Level?.ToString() ?? ""),
                CsvCell(s.Status.ToString()),
                CsvCell(s.LeadStatus.ToString()),
                CsvCell(contacts),
                CsvCell(tags)));
        }

        var bom = Encoding.UTF8.GetPreamble();
        var data = Encoding.UTF8.GetBytes(sb.ToString());
        var combined = new byte[bom.Length + data.Length];
        Buffer.BlockCopy(bom, 0, combined, 0, bom.Length);
        Buffer.BlockCopy(data, 0, combined, bom.Length, data.Length);

        return File(combined, "text/csv; charset=utf-8", "leadlens-leads.csv");
    }

    private static string CsvCell(string raw)
    {
        if (!string.IsNullOrEmpty(raw) && raw[0] is '=' or '+' or '-' or '@')
        {
            raw = "'" + raw;
        }
        return $"\"{raw.Replace("\"", "\"\"")}\"";
    }

    private IActionResult NotFoundLead() =>
        Problem(title: "Lead not found", statusCode: StatusCodes.Status404NotFound);
}
