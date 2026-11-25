using Hangfire;
using Hangfire.Redis.StackExchange;
using LeadLens.Application.Interfaces;
using LeadLens.Infrastructure.Persistence;
using LeadLens.Infrastructure.Profiles;
using LeadLens.Infrastructure.Security;
using LeadLens.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LeadLens.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        if (configuration.GetValue<bool>("UseInMemoryDatabase"))
        {
            var dbName = configuration["InMemoryDatabaseName"] ?? "LeadLensTest";
            services.AddDbContext<LeadLensDbContext>(options =>
                options.UseInMemoryDatabase(dbName));
        }
        else
        {
            var connectionString = configuration.GetConnectionString("DefaultConnection")
                                   ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required.");

            services.AddDbContext<LeadLensDbContext>(options =>
                options.UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsAssembly(typeof(LeadLensDbContext).Assembly.FullName)));
        }

        var profilesDir = configuration["Profiles:Directory"] ?? ResolveProfilesDirectory();
        services.AddSingleton<IServiceProfileRegistry>(_ => new YamlServiceProfileRegistry(profilesDir));

        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddSingleton<IJwtTokenService, JwtTokenService>();
        services.AddSingleton<INeedScoreCalculator, NeedScoreCalculator>();
        services.AddScoped<IQuotaService, QuotaService>();
        services.AddScoped<ICampaignOrchestrator, CampaignOrchestrator>();

        var crawlerUrl = configuration["Services:CrawlerUrl"] ?? "http://localhost:8001";
        services.AddHttpClient<ICrawlerClient, CrawlerHttpClient>(client =>
        {
            client.BaseAddress = new Uri(crawlerUrl);
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        var auditUrl = configuration["Services:AuditUrl"] ?? "http://localhost:8002";
        services.AddHttpClient<IAuditClient, AuditHttpClient>(client =>
        {
            client.BaseAddress = new Uri(auditUrl);
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        var mlUrl = configuration["Services:MlUrl"] ?? "http://localhost:8003";
        services.AddHttpClient<IMlClient, MlHttpClient>(client =>
        {
            client.BaseAddress = new Uri(mlUrl);
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        var redisConnection = configuration.GetConnectionString("Redis");
        if (!string.IsNullOrWhiteSpace(redisConnection))
        {
            services.AddHangfire(config => config
                .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
                .UseSimpleAssemblyNameTypeSerializer()
                .UseRecommendedSerializerSettings()
                .UseRedisStorage(redisConnection, new RedisStorageOptions
                {
                    Prefix = "leadlens:hangfire:"
                }));
            services.AddHangfireServer(options =>
            {
                options.WorkerCount = 5;
            });
            services.AddScoped<ICampaignJobScheduler, HangfireCampaignJobScheduler>();
        }
        else
        {
            services.AddSingleton<ICampaignJobScheduler, InProcessCampaignJobScheduler>();
        }

        return services;
    }

    private static string ResolveProfilesDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "profiles");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
            dir = dir.Parent;
        }
        return Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "profiles"));
    }
}
