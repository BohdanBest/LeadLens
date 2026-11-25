using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Hangfire;
using LeadLens.Infrastructure;
using LeadLens.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(options =>
{
    options.IncludeScopes = true;
    options.TimestampFormat = "yyyy-MM-ddTHH:mm:ss.fffZ";
});

builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
    };
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "LeadLens API",
        Version = "v1",
        Description = "Automated website audit and evidence-based outreach platform API."
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header
    });
    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("Bearer", document)] = []
    });
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                     ?? new[] { "http://localhost:5173" };
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

var jwtSecret = builder.Configuration["Jwt:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret))
{
    if (builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"))
    {
        jwtSecret = "dev_super_secret_jwt_key_at_least_32_characters_long";
    }
    else
    {
        throw new InvalidOperationException("Jwt:Secret must be configured via environment variables in non-development environments.");
    }
}
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "leadlens-api";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "leadlens-web";

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddInfrastructure(builder.Configuration);

var authPermitLimit = builder.Configuration.GetValue<int?>("RateLimiting:AuthPermitLimit")
                      ?? (builder.Environment.IsEnvironment("Testing") ? 1000 : 30);
var apiPermitLimit = builder.Configuration.GetValue<int?>("RateLimiting:ApiPermitLimit")
                     ?? (builder.Environment.IsEnvironment("Testing") ? 2000 : 180);

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (ctx, ct) =>
    {
        await ctx.HttpContext.Response.WriteAsJsonAsync(
            new ProblemDetails
            {
                Title = "Too many requests",
                Detail = "Rate limit exceeded. Please wait before retrying.",
                Status = StatusCodes.Status429TooManyRequests
            },
            options: null,
            contentType: "application/problem+json",
            cancellationToken: ct);
    };

    options.AddPolicy("auth", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = authPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    options.AddPolicy("api", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? httpContext.Connection.RemoteIpAddress?.ToString()
                ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = apiPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

var app = builder.Build();

if (app.Environment.IsEnvironment("Testing"))
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler();
}
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

if (!string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString("Redis")) && app.Environment.IsDevelopment())
{
    app.UseHangfireDashboard("/hangfire");
}

app.MapControllers();

if (!app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<LeadLensDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        var pending = await db.Database.GetPendingMigrationsAsync();
        if (pending.Any())
        {
            await db.Database.MigrateAsync();
        }
        else
        {
            await db.Database.EnsureCreatedAsync();
        }

        if (db.Database.IsRelational())
        {
            // Idempotent additive schema updates for existing PostgreSQL volumes
            await db.Database.ExecuteSqlRawAsync("""
                ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "FailedLoginAttempts" integer NOT NULL DEFAULT 0;
                ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "LockoutEndAt" timestamp with time zone NULL;
                ALTER TABLE "RefreshTokens" ADD COLUMN IF NOT EXISTS "FamilyId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
                ALTER TABLE "RefreshTokens" ADD COLUMN IF NOT EXISTS "ReplacedByTokenHash" character varying(128) NULL;
                ALTER TABLE "RefreshTokens" ADD COLUMN IF NOT EXISTS "UserAgent" character varying(512) NULL;
                ALTER TABLE "RefreshTokens" ADD COLUMN IF NOT EXISTS "IpAddress" character varying(64) NULL;
                ALTER TABLE "RefreshTokens" ADD COLUMN IF NOT EXISTS "LastUsedAt" timestamp with time zone NULL;
                CREATE INDEX IF NOT EXISTS "IX_RefreshTokens_UserId_FamilyId" ON "RefreshTokens" ("UserId", "FamilyId");
                """);
        }
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Database initialization skipped or failed at startup.");
    }
}

app.Run();

public partial class Program { }
