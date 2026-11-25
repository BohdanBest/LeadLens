using LeadLens.Api.Extensions;
using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
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
[Route("api/v1/workspace")]
public class WorkspaceController : ControllerBase
{
    private readonly LeadLensDbContext _db;
    private readonly IQuotaService _quotas;

    public WorkspaceController(LeadLensDbContext db, IQuotaService quotas)
    {
        _db = db;
        _quotas = quotas;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var userId = User.GetUserId();
        var workspace = await _db.Workspaces.AsNoTracking().FirstOrDefaultAsync(w => w.UserId == userId, ct);
        if (workspace is null)
        {
            return Problem(title: "Workspace not found", statusCode: StatusCodes.Status404NotFound);
        }

        var quotaSummary = await _quotas.GetQuotaSummaryAsync(userId, ct);
        return Ok(MapDto(workspace, quotaSummary));
    }

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateWorkspaceRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var workspace = await _db.Workspaces.FirstOrDefaultAsync(w => w.UserId == userId, ct);
        if (workspace is null)
        {
            return Problem(title: "Workspace not found", statusCode: StatusCodes.Status404NotFound);
        }

        workspace.Name = request.Name.Trim();
        workspace.SiteUrl = string.IsNullOrWhiteSpace(request.SiteUrl) ? null : request.SiteUrl.Trim();
        workspace.PortfolioUrl = string.IsNullOrWhiteSpace(request.PortfolioUrl) ? null : request.PortfolioUrl.Trim();
        workspace.Services = request.Services?.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).Distinct().ToList() ?? new();
        workspace.Signature = request.Signature?.Trim() ?? string.Empty;
        workspace.DefaultEmailLanguage = request.DefaultEmailLanguage == "en" ? EmailLanguage.En : EmailLanguage.Uk;
        workspace.DefaultEmailTone = request.DefaultEmailTone == "friendly" ? EmailTone.Friendly : EmailTone.Formal;
        workspace.UiTheme = request.UiTheme;
        workspace.UiLanguage = request.UiLanguage;

        await _db.SaveChangesAsync(ct);

        var quotaSummary = await _quotas.GetQuotaSummaryAsync(userId, ct);
        return Ok(MapDto(workspace, quotaSummary));
    }

    private static WorkspaceDto MapDto(Domain.Entities.Workspace w, QuotaSummaryDto quotas) => new(
        w.Id,
        w.Name,
        w.SiteUrl,
        w.PortfolioUrl,
        w.Services,
        w.Signature,
        w.DefaultEmailLanguage == EmailLanguage.En ? "en" : "uk",
        w.DefaultEmailTone == EmailTone.Friendly ? "friendly" : "formal",
        w.UiTheme,
        w.UiLanguage,
        quotas);
}
