using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using LeadLens.Domain.Enums;
using LeadLens.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LeadLens.Infrastructure.Services;

public sealed class QuotaService : IQuotaService
{
    private readonly LeadLensDbContext _db;

    public QuotaService(LeadLensDbContext db)
    {
        _db = db;
    }

    public async Task<QuotaSummaryDto> GetQuotaSummaryAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _db.Users.AsNoTracking().FirstAsync(u => u.Id == userId, ct);
        var monthStart = new DateTimeOffset(DateTimeOffset.UtcNow.Year, DateTimeOffset.UtcNow.Month, 1, 0, 0, 0, TimeSpan.Zero);

        var auditsUsed = await _db.Audits
            .AsNoTracking()
            .CountAsync(a => a.CreatedAt >= monthStart && a.Site.Campaign.Workspace.UserId == userId, ct);

        var activeCampaigns = await _db.Campaigns
            .AsNoTracking()
            .CountAsync(c => c.Workspace.UserId == userId &&
                             !c.IsArchived &&
                             (c.Status == CampaignStatus.Discovering || c.Status == CampaignStatus.Auditing), ct);

        return new QuotaSummaryDto(
            auditsUsed,
            user.MonthlyAuditQuota,
            activeCampaigns,
            user.MaxConcurrentCampaigns);
    }

    public async Task<(bool Allowed, string? Message)> CanStartCampaignAsync(Guid userId, CancellationToken ct = default)
    {
        var summary = await GetQuotaSummaryAsync(userId, ct);
        if (summary.ActiveCampaigns >= summary.MaxConcurrentCampaigns)
        {
            return (false, $"Concurrent campaign limit reached ({summary.ActiveCampaigns}/{summary.MaxConcurrentCampaigns}). Pause or wait for a running campaign to finish.");
        }

        return (true, null);
    }

    public async Task<(bool Allowed, string? Message)> CanRunAuditsAsync(Guid userId, int count, CancellationToken ct = default)
    {
        var summary = await GetQuotaSummaryAsync(userId, ct);
        if (summary.MonthlyAuditsUsed + count > summary.MonthlyAuditQuota)
        {
            return (false, $"Monthly audit quota exceeded ({summary.MonthlyAuditsUsed}/{summary.MonthlyAuditQuota}).");
        }

        return (true, null);
    }
}
