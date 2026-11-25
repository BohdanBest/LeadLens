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
public class EmailsController : ControllerBase
{
    private const int MaxVersionsPerLead = 10;

    private readonly LeadLensDbContext _db;
    private readonly IMlClient _ml;
    private readonly IServiceProfileRegistry _profiles;

    public EmailsController(
        LeadLensDbContext db,
        IMlClient ml,
        IServiceProfileRegistry profiles)
    {
        _db = db;
        _ml = ml;
        _profiles = profiles;
    }

    [HttpGet("leads/{leadId:guid}/emails")]
    public async Task<IActionResult> ListForLead(Guid leadId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == leadId && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null) return Problem(title: "Lead not found", statusCode: StatusCodes.Status404NotFound);

        var drafts = await _db.EmailDrafts
            .AsNoTracking()
            .Include(d => d.Claims)
            .ThenInclude(c => c.Finding)
            .Where(d => d.SiteId == leadId)
            .OrderByDescending(d => d.Version)
            .ToListAsync(ct);

        return Ok(drafts.Select(MapDto).ToList());
    }

    [HttpPost("leads/{leadId:guid}/emails/generate")]
    public async Task<IActionResult> Generate(Guid leadId, [FromBody] GenerateEmailRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .AsSplitQuery()
            .Include(s => s.Campaign)
            .ThenInclude(c => c.Workspace)
            .Include(s => s.EmailDrafts)
            .Include(s => s.Audits)
            .ThenInclude(a => a.Findings)
            .ThenInclude(f => f.Evidences)
            .FirstOrDefaultAsync(s => s.Id == leadId && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null) return Problem(title: "Lead not found", statusCode: StatusCodes.Status404NotFound);

        var latestAudit = site.Audits
            .Where(a => a.Status is AuditStatus.Completed or AuditStatus.Partial)
            .OrderByDescending(a => a.Version)
            .FirstOrDefault();

        if (latestAudit is null)
        {
            return Problem(
                title: "No completed audit available",
                detail: "Run an audit for this site before generating an outreach email.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var workspace = site.Campaign.Workspace;
        var profile = _profiles.GetProfile(site.Campaign.ProfileKey, site.Campaign.ProfileVersion);
        var checkCatalog = profile?.Checks.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase)
                           ?? new Dictionary<string, ServiceProfileCheckDto>(StringComparer.OrdinalIgnoreCase);

        var candidateFindings = latestAudit.Findings
            .Where(f => f.Result is CheckResultStatus.Fail or CheckResultStatus.Warning)
            .OrderByDescending(f => f.ScoreContribution)
            .ToList();

        if (request.FindingIds is { Count: > 0 })
        {
            var idSet = request.FindingIds.ToHashSet();
            candidateFindings = candidateFindings.Where(f => idSet.Contains(f.Id)).ToList();
        }

        var mlFindings = BuildMlFindings(candidateFindings, checkCatalog);
        var lang = request.Language ?? (workspace.DefaultEmailLanguage == EmailLanguage.En ? "en" : "uk");
        var tone = request.Tone ?? (workspace.DefaultEmailTone == EmailTone.Friendly ? "friendly" : "formal");
        var length = request.Length ?? "short";

        var generated = await _ml.GenerateEmailAsync(new MlGenerateEmailPayload(
            site.Domain,
            site.Campaign.ProfileKey,
            site.Campaign.ProfileVersion,
            lang,
            tone,
            length,
            workspace.Signature,
            workspace.Services,
            mlFindings), ct);

        // Enforce max 10 versions per lead (FR-EML-05)
        var existingDrafts = site.EmailDrafts.OrderBy(d => d.Version).ToList();
        while (existingDrafts.Count >= MaxVersionsPerLead)
        {
            var oldest = existingDrafts[0];
            existingDrafts.RemoveAt(0);
            _db.EmailDrafts.Remove(oldest);
        }

        var nextVersion = site.EmailDrafts.Count > 0 ? site.EmailDrafts.Max(d => d.Version) + 1 : 1;
        var draft = new EmailDraft
        {
            SiteId = site.Id,
            Version = nextVersion,
            Language = lang == "en" ? EmailLanguage.En : EmailLanguage.Uk,
            Tone = tone == "friendly" ? EmailTone.Friendly : EmailTone.Formal,
            Length = length == "medium" ? EmailLength.Medium : EmailLength.Short,
            Subject = generated.Subject,
            Body = generated.Body,
            Status = EmailDraftStatus.Draft
        };

        foreach (var c in generated.Claims)
        {
            draft.Claims.Add(new EmailClaim
            {
                FindingId = c.FindingId,
                Text = c.Text,
                VerificationStatus = ParseVerificationStatus(c.VerificationStatus)
            });
        }

        _db.EmailDrafts.Add(draft);
        if (site.LeadStatus == LeadStatus.New)
        {
            site.LeadStatus = LeadStatus.DraftReady;
        }
        _db.LeadEvents.Add(new LeadEvent
        {
            SiteId = site.Id,
            Type = LeadEventType.EmailGenerated,
            Note = $"Generated email draft v{nextVersion} ({lang}, {tone}, {length})"
        });

        await _db.SaveChangesAsync(ct);

        // Reload claims with Finding for CheckId display
        await _db.Entry(draft).Collection(d => d.Claims).Query().Include(c => c.Finding).LoadAsync(ct);
        return Created(string.Empty, MapDto(draft));
    }

    [HttpPut("emails/{emailId:guid}")]
    public async Task<IActionResult> Update(Guid emailId, [FromBody] UpdateEmailDraftRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var draft = await _db.EmailDrafts
            .AsSplitQuery()
            .Include(d => d.Claims)
            .Include(d => d.Site)
            .ThenInclude(s => s.Campaign)
            .Include(d => d.Site)
            .ThenInclude(s => s.Audits)
            .ThenInclude(a => a.Findings)
            .ThenInclude(f => f.Evidences)
            .FirstOrDefaultAsync(d => d.Id == emailId && d.Site.Campaign.Workspace.UserId == userId, ct);

        if (draft is null) return Problem(title: "Email draft not found", statusCode: StatusCodes.Status404NotFound);

        var latestAudit = draft.Site.Audits
            .Where(a => a.Status is AuditStatus.Completed or AuditStatus.Partial)
            .OrderByDescending(a => a.Version)
            .FirstOrDefault();

        var profile = _profiles.GetProfile(draft.Site.Campaign.ProfileKey, draft.Site.Campaign.ProfileVersion);
        var checkCatalog = profile?.Checks.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase)
                           ?? new Dictionary<string, ServiceProfileCheckDto>(StringComparer.OrdinalIgnoreCase);

        IReadOnlyList<MlFindingInput> mlFindings = latestAudit is not null
            ? BuildMlFindings(latestAudit.Findings, checkCatalog)
            : Array.Empty<MlFindingInput>();

        var verifyInputs = request.Claims.Select(c => new MlVerifyClaimInput(c.Id, c.FindingId, null, c.Text)).ToList();
        var verifyResult = await _ml.VerifyEmailAsync(
            new MlVerifyEmailPayload(request.Subject, request.Body, verifyInputs, mlFindings), ct);

        draft.Subject = request.Subject.Trim();
        draft.Body = request.Body;

        var oldClaims = draft.Claims.ToList();
        _db.EmailClaims.RemoveRange(oldClaims);

        foreach (var vc in verifyResult.Claims)
        {
            _db.EmailClaims.Add(new EmailClaim
            {
                DraftId = draft.Id,
                FindingId = vc.FindingId,
                Text = vc.Text,
                VerificationStatus = ParseVerificationStatus(vc.VerificationStatus)
            });
        }

        await _db.SaveChangesAsync(ct);
        await _db.Entry(draft).Collection(d => d.Claims).Query().Include(c => c.Finding).LoadAsync(ct);
        return Ok(MapDto(draft));
    }

    [HttpPost("emails/{emailId:guid}/verify")]
    public async Task<IActionResult> Verify(Guid emailId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var draft = await _db.EmailDrafts
            .AsSplitQuery()
            .Include(d => d.Claims)
            .ThenInclude(c => c.Finding)
            .Include(d => d.Site)
            .ThenInclude(s => s.Campaign)
            .Include(d => d.Site)
            .ThenInclude(s => s.Audits)
            .ThenInclude(a => a.Findings)
            .ThenInclude(f => f.Evidences)
            .FirstOrDefaultAsync(d => d.Id == emailId && d.Site.Campaign.Workspace.UserId == userId, ct);

        if (draft is null) return Problem(title: "Email draft not found", statusCode: StatusCodes.Status404NotFound);

        var latestAudit = draft.Site.Audits
            .Where(a => a.Status is AuditStatus.Completed or AuditStatus.Partial)
            .OrderByDescending(a => a.Version)
            .FirstOrDefault();

        var profile = _profiles.GetProfile(draft.Site.Campaign.ProfileKey, draft.Site.Campaign.ProfileVersion);
        var checkCatalog = profile?.Checks.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase)
                           ?? new Dictionary<string, ServiceProfileCheckDto>(StringComparer.OrdinalIgnoreCase);

        IReadOnlyList<MlFindingInput> mlFindings = latestAudit is not null
            ? BuildMlFindings(latestAudit.Findings, checkCatalog)
            : Array.Empty<MlFindingInput>();

        var verifyInputs = draft.Claims
            .Select(c => new MlVerifyClaimInput(c.Id, c.FindingId, c.Finding?.CheckId, c.Text))
            .ToList();

        var result = await _ml.VerifyEmailAsync(
            new MlVerifyEmailPayload(draft.Subject, draft.Body, verifyInputs, mlFindings), ct);

        foreach (var vc in result.Claims)
        {
            var claim = vc.Id.HasValue ? draft.Claims.FirstOrDefault(x => x.Id == vc.Id.Value) : null;
            if (claim is not null)
            {
                claim.FindingId = vc.FindingId;
                claim.VerificationStatus = ParseVerificationStatus(vc.VerificationStatus);
            }
        }

        await _db.SaveChangesAsync(ct);

        var claimDtos = draft.Claims.Select(c => new EmailClaimDto(
            c.Id,
            c.FindingId,
            c.Finding?.CheckId,
            c.Text,
            c.VerificationStatus.ToString())).ToList();

        return Ok(new EmailVerificationResultDto(draft.Id, result.AllVerified, claimDtos, result.Warnings));
    }

    [HttpGet("emails/{emailId:guid}/eml")]
    public async Task<IActionResult> DownloadEml(Guid emailId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var draft = await _db.EmailDrafts
            .AsNoTracking()
            .Include(d => d.Site)
            .ThenInclude(s => s.Contacts)
            .FirstOrDefaultAsync(d => d.Id == emailId && d.Site.Campaign.Workspace.UserId == userId, ct);

        if (draft is null) return Problem(title: "Email draft not found", statusCode: StatusCodes.Status404NotFound);

        var recipientEmail = draft.Site.Contacts
            .FirstOrDefault(c => c.Kind == ContactKind.Email)?.Value;

        var emlBytes = EmlExporter.BuildRfc5322Eml(draft.Subject, draft.Body, recipientEmail);
        var safeDomain = draft.Site.Domain.Replace('/', '_').Replace('\\', '_');
        return File(emlBytes, "message/rfc822", $"{safeDomain}-v{draft.Version}.eml");
    }

    [HttpPost("emails/{emailId:guid}/mark-sent")]
    public async Task<IActionResult> MarkSent(Guid emailId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var draft = await _db.EmailDrafts
            .Include(d => d.Claims)
            .ThenInclude(c => c.Finding)
            .Include(d => d.Site)
            .FirstOrDefaultAsync(d => d.Id == emailId && d.Site.Campaign.Workspace.UserId == userId, ct);

        if (draft is null) return Problem(title: "Email draft not found", statusCode: StatusCodes.Status404NotFound);

        draft.Status = EmailDraftStatus.Sent;
        draft.Site.LeadStatus = LeadStatus.Sent;
        _db.LeadEvents.Add(new LeadEvent
        {
            SiteId = draft.SiteId,
            Type = LeadEventType.EmailSent,
            Note = $"Marked email draft v{draft.Version} as sent"
        });

        await _db.SaveChangesAsync(ct);
        return Ok(MapDto(draft));
    }

    private static List<MlFindingInput> BuildMlFindings(
        IEnumerable<Finding> findings,
        IReadOnlyDictionary<string, ServiceProfileCheckDto> checkCatalog)
    {
        return findings.Select(f =>
        {
            checkCatalog.TryGetValue(f.CheckId, out var cfg);
            var evRefs = f.Evidences
                .Select(e => e.Kind == EvidenceKind.Screenshot ? $"скріншот {e.FileRef}" : e.PayloadJson ?? e.Kind.ToString())
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Take(2)
                .ToList();

            return new MlFindingInput(
                f.Id,
                f.CheckId,
                f.Result.ToString().ToLowerInvariant(),
                f.Value,
                f.ScoreContribution,
                evRefs,
                cfg?.Title.Uk ?? f.CheckId,
                cfg?.Title.En ?? f.CheckId,
                cfg?.ClaimTemplate?.Uk,
                cfg?.ClaimTemplate?.En);
        }).ToList();
    }

    private static ClaimVerificationStatus ParseVerificationStatus(string raw) => raw.ToLowerInvariant() switch
    {
        "verified" => ClaimVerificationStatus.Verified,
        "contradicts" => ClaimVerificationStatus.Contradicts,
        _ => ClaimVerificationStatus.Unverified
    };

    private static EmailDraftDto MapDto(EmailDraft d) => new(
        d.Id,
        d.SiteId,
        d.Version,
        d.Language == EmailLanguage.En ? "en" : "uk",
        d.Tone == EmailTone.Friendly ? "friendly" : "formal",
        d.Length == EmailLength.Medium ? "medium" : "short",
        d.Subject,
        d.Body,
        d.Status.ToString(),
        d.Claims.Select(c => new EmailClaimDto(
            c.Id,
            c.FindingId,
            c.Finding?.CheckId,
            c.Text,
            c.VerificationStatus.ToString())).ToList(),
        d.CreatedAt,
        d.UpdatedAt);
}
