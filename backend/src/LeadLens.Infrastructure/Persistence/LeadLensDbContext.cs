using LeadLens.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LeadLens.Infrastructure.Persistence;

public class LeadLensDbContext : DbContext
{
    public LeadLensDbContext(DbContextOptions<LeadLensDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<ServiceProfile> ServiceProfiles => Set<ServiceProfile>();
    public DbSet<Campaign> Campaigns => Set<Campaign>();
    public DbSet<Site> Sites => Set<Site>();
    public DbSet<Audit> Audits => Set<Audit>();
    public DbSet<ReportShareLink> ReportShareLinks => Set<ReportShareLink>();
    public DbSet<Finding> Findings => Set<Finding>();
    public DbSet<Evidence> Evidences => Set<Evidence>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<EmailDraft> EmailDrafts => Set<EmailDraft>();
    public DbSet<EmailClaim> EmailClaims => Set<EmailClaim>();
    public DbSet<LeadEvent> LeadEvents => Set<LeadEvent>();

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = now;
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(320).IsRequired();
            e.Property(x => x.PasswordHash).IsRequired();
        });

        modelBuilder.Entity<RefreshToken>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => new { x.UserId, x.FamilyId });
            e.Property(x => x.UserAgent).HasMaxLength(512);
            e.Property(x => x.IpAddress).HasMaxLength(64);
            e.Property(x => x.ReplacedByTokenHash).HasMaxLength(128);
            e.HasOne(x => x.User)
                .WithMany(u => u.RefreshTokens)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Workspace>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.UserId).IsUnique();
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.Property(x => x.Services).HasColumnType("jsonb");
            e.Property(x => x.DefaultEmailLanguage).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.DefaultEmailTone).HasConversion<string>().HasMaxLength(16);
            e.HasOne(x => x.User)
                .WithOne(u => u.Workspace)
                .HasForeignKey<Workspace>(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ServiceProfile>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Key, x.Version }).IsUnique();
            e.Property(x => x.Key).HasMaxLength(64).IsRequired();
            e.Property(x => x.ConfigJson).HasColumnType("jsonb");
        });

        modelBuilder.Entity<Campaign>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.WorkspaceId, x.CreatedAt });
            e.Property(x => x.Name).HasMaxLength(80).IsRequired();
            e.Property(x => x.Niche).HasMaxLength(100).IsRequired();
            e.Property(x => x.ProfileKey).HasMaxLength(64).IsRequired();
            e.Property(x => x.ExclusionKeywords).HasColumnType("jsonb");
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            e.HasOne(x => x.Workspace)
                .WithMany(w => w.Campaigns)
                .HasForeignKey(x => x.WorkspaceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Site>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.CampaignId, x.Domain }).IsUnique();
            e.HasIndex(x => new { x.NeedScore, x.Id });
            e.Property(x => x.Domain).HasMaxLength(255).IsRequired();
            e.Property(x => x.Url).HasMaxLength(2048).IsRequired();
            e.Property(x => x.Source).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Level).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.LeadStatus).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Tags).HasColumnType("jsonb");
            e.HasOne(x => x.Campaign)
                .WithMany(c => c.Sites)
                .HasForeignKey(x => x.CampaignId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Audit>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.SiteId, x.Version }).IsUnique();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.FailureReason).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.CoverageRatio).HasPrecision(5, 4);
            e.Property(x => x.CategoryScoresJson).HasColumnType("jsonb");
            e.HasOne(x => x.Site)
                .WithMany(s => s.Audits)
                .HasForeignKey(x => x.SiteId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ReportShareLink>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasOne(x => x.Audit)
                .WithMany(a => a.ShareLinks)
                .HasForeignKey(x => x.AuditId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Finding>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.AuditId, x.ScoreContribution });
            e.Property(x => x.CheckId).HasMaxLength(32).IsRequired();
            e.Property(x => x.Category).HasMaxLength(64).IsRequired();
            e.Property(x => x.Result).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.ScoreContribution).HasPrecision(8, 4);
            e.HasOne(x => x.Audit)
                .WithMany(a => a.Findings)
                .HasForeignKey(x => x.AuditId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Evidence>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.PayloadJson).HasColumnType("jsonb");
            e.HasOne(x => x.Finding)
                .WithMany(f => f.Evidences)
                .HasForeignKey(x => x.FindingId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Contact>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            e.HasOne(x => x.Site)
                .WithMany(s => s.Contacts)
                .HasForeignKey(x => x.SiteId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EmailDraft>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.SiteId, x.Version }).IsUnique();
            e.Property(x => x.Language).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Tone).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Length).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            e.HasOne(x => x.Site)
                .WithMany(s => s.EmailDrafts)
                .HasForeignKey(x => x.SiteId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EmailClaim>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.VerificationStatus).HasConversion<string>().HasMaxLength(32);
            e.HasOne(x => x.Draft)
                .WithMany(d => d.Claims)
                .HasForeignKey(x => x.DraftId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Finding)
                .WithMany()
                .HasForeignKey(x => x.FindingId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<LeadEvent>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.SiteId, x.CreatedAt });
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(32);
            e.HasOne(x => x.Site)
                .WithMany(s => s.Events)
                .HasForeignKey(x => x.SiteId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
