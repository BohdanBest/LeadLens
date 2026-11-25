using LeadLens.Api.Extensions;
using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using LeadLens.Domain.Entities;
using LeadLens.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace LeadLens.Api.Controllers;

[EnableRateLimiting("auth")]
[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    public const string RefreshCookieName = "leadlens_refresh";
    private const int MaxFailedLoginAttempts = 5;
    private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    private readonly LeadLensDbContext _db;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IJwtTokenService _jwt;
    private readonly ILogger<AuthController> _logger;

    private static string? _dummyPasswordHash;

    public AuthController(
        LeadLensDbContext db,
        IPasswordHasher passwordHasher,
        IJwtTokenService jwt,
        ILogger<AuthController> logger)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _jwt = jwt;
        _logger = logger;
        _dummyPasswordHash ??= passwordHasher.Hash("TimingProtection_Dummy_Password_2026!");
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request, CancellationToken ct)
    {
        var passwordError = ValidatePasswordStrength(request.Password);
        if (passwordError is not null)
        {
            return Problem(
                title: "Weak password",
                detail: passwordError,
                statusCode: StatusCodes.Status400BadRequest);
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (await _db.Users.AnyAsync(u => u.Email == normalizedEmail, ct))
        {
            return Problem(
                title: "Email already registered",
                detail: $"An account with email '{normalizedEmail}' already exists.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var user = new User
        {
            Email = normalizedEmail,
            PasswordHash = _passwordHasher.Hash(request.Password)
        };

        var workspace = new Workspace
        {
            UserId = user.Id,
            Name = string.IsNullOrWhiteSpace(request.StudioName) ? "My Web Studio" : request.StudioName.Trim(),
            Services = new List<string> { "web_development", "seo", "performance_optimization" },
            Signature = "Best regards,\nLeadLens Studio"
        };

        var now = DateTimeOffset.UtcNow;
        var rawRefresh = _jwt.GenerateRefreshToken();
        var refreshEntity = new RefreshToken
        {
            UserId = user.Id,
            FamilyId = Guid.NewGuid(),
            TokenHash = _jwt.HashRefreshToken(rawRefresh),
            UserAgent = ReadUserAgent(),
            IpAddress = ReadClientIp(),
            LastUsedAt = now,
            ExpiresAt = now.AddDays(_jwt.RefreshTokenDays)
        };

        _db.Users.Add(user);
        _db.Workspaces.Add(workspace);
        _db.RefreshTokens.Add(refreshEntity);
        await _db.SaveChangesAsync(ct);

        AppendRefreshCookie(rawRefresh, refreshEntity.ExpiresAt);

        var accessToken = _jwt.GenerateAccessToken(user, workspace.Id);
        return Created(string.Empty, new AuthResponse(
            accessToken,
            rawRefresh,
            _jwt.AccessTokenExpiresInSeconds,
            user.Id,
            user.Email,
            workspace.Id));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users
            .Include(u => u.Workspace)
            .FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct);

        if (user is null)
        {
            // Equalize response timing against email enumeration
            _passwordHasher.Verify(request.Password, _dummyPasswordHash!);
            return Problem(
                title: "Invalid credentials",
                detail: "Email or password is incorrect.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (user.LockoutEndAt.HasValue && user.LockoutEndAt.Value > now)
        {
            var remainingSeconds = Math.Max(1, (int)Math.Ceiling((user.LockoutEndAt.Value - now).TotalSeconds));
            var remainingMinutes = Math.Max(1, (int)Math.Ceiling(remainingSeconds / 60.0));
            Response.Headers.RetryAfter = remainingSeconds.ToString();
            return Problem(
                title: "Account temporarily locked",
                detail: $"Too many failed login attempts. Try again in {remainingMinutes} minute(s).",
                statusCode: StatusCodes.Status423Locked);
        }

        if (!_passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            user.FailedLoginAttempts += 1;
            if (user.FailedLoginAttempts >= MaxFailedLoginAttempts)
            {
                user.LockoutEndAt = now.Add(LockoutDuration);
                user.FailedLoginAttempts = 0;
                _logger.LogWarning("Account locked due to repeated failed login attempts for user {UserId}", user.Id);
            }

            await _db.SaveChangesAsync(ct);

            if (user.LockoutEndAt.HasValue && user.LockoutEndAt.Value > now)
            {
                Response.Headers.RetryAfter = ((int)LockoutDuration.TotalSeconds).ToString();
                return Problem(
                    title: "Account temporarily locked",
                    detail: $"Too many failed login attempts. Try again in {(int)LockoutDuration.TotalMinutes} minute(s).",
                    statusCode: StatusCodes.Status423Locked);
            }

            return Problem(
                title: "Invalid credentials",
                detail: "Email or password is incorrect.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        // Successful login: reset lockout counters
        user.FailedLoginAttempts = 0;
        user.LockoutEndAt = null;

        var workspaceId = user.Workspace?.Id ?? Guid.Empty;
        var rawRefresh = _jwt.GenerateRefreshToken();
        var expiresAt = now.AddDays(_jwt.RefreshTokenDays);

        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            FamilyId = Guid.NewGuid(),
            TokenHash = _jwt.HashRefreshToken(rawRefresh),
            UserAgent = ReadUserAgent(),
            IpAddress = ReadClientIp(),
            LastUsedAt = now,
            ExpiresAt = expiresAt
        });
        await _db.SaveChangesAsync(ct);

        AppendRefreshCookie(rawRefresh, expiresAt);

        var accessToken = _jwt.GenerateAccessToken(user, workspaceId);
        return Ok(new AuthResponse(
            accessToken,
            rawRefresh,
            _jwt.AccessTokenExpiresInSeconds,
            user.Id,
            user.Email,
            workspaceId));
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] RefreshRequest? request, CancellationToken ct)
    {
        var rawToken = ResolveRefreshToken(request?.RefreshToken);
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            ClearRefreshCookie();
            return Problem(
                title: "Invalid refresh token",
                detail: "Refresh token is missing.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        var now = DateTimeOffset.UtcNow;
        var tokenHash = _jwt.HashRefreshToken(rawToken);
        var existing = await _db.RefreshTokens
            .Include(rt => rt.User)
            .ThenInclude(u => u.Workspace)
            .FirstOrDefaultAsync(rt => rt.TokenHash == tokenHash, ct);

        if (existing is null)
        {
            ClearRefreshCookie();
            return Problem(
                title: "Invalid refresh token",
                detail: "The refresh token is invalid, expired, or has been revoked.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        // Reuse Detection: replaying an already-revoked token compromises the entire session family
        if (existing.RevokedAt is not null)
        {
            if (existing.FamilyId != Guid.Empty)
            {
                var familyTokens = await _db.RefreshTokens
                    .Where(rt => rt.UserId == existing.UserId && rt.FamilyId == existing.FamilyId && rt.RevokedAt == null)
                    .ToListAsync(ct);

                foreach (var token in familyTokens)
                {
                    token.RevokedAt = now;
                }

                if (familyTokens.Count > 0)
                {
                    await _db.SaveChangesAsync(ct);
                }
            }

            _logger.LogWarning(
                "Refresh token reuse detected for user {UserId}, family {FamilyId}. Session family revoked.",
                existing.UserId,
                existing.FamilyId);

            ClearRefreshCookie();
            return Problem(
                title: "Session compromised",
                detail: "Refresh token reuse detected. Please sign in again.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (existing.ExpiresAt <= now)
        {
            ClearRefreshCookie();
            return Problem(
                title: "Invalid refresh token",
                detail: "The refresh token has expired.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        var nextRaw = _jwt.GenerateRefreshToken();
        var nextHash = _jwt.HashRefreshToken(nextRaw);
        var expiresAt = now.AddDays(_jwt.RefreshTokenDays);

        existing.RevokedAt = now;
        existing.LastUsedAt = now;
        existing.ReplacedByTokenHash = nextHash;

        var familyId = existing.FamilyId == Guid.Empty ? Guid.NewGuid() : existing.FamilyId;
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = existing.UserId,
            FamilyId = familyId,
            TokenHash = nextHash,
            UserAgent = ReadUserAgent() ?? existing.UserAgent,
            IpAddress = ReadClientIp() ?? existing.IpAddress,
            LastUsedAt = now,
            ExpiresAt = expiresAt
        });
        await _db.SaveChangesAsync(ct);

        AppendRefreshCookie(nextRaw, expiresAt);

        var workspaceId = existing.User.Workspace?.Id ?? Guid.Empty;
        var accessToken = _jwt.GenerateAccessToken(existing.User, workspaceId);
        return Ok(new AuthResponse(
            accessToken,
            nextRaw,
            _jwt.AccessTokenExpiresInSeconds,
            existing.User.Id,
            existing.User.Email,
            workspaceId));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] LogoutRequest? request, CancellationToken ct)
    {
        var rawToken = ResolveRefreshToken(request?.RefreshToken);
        if (!string.IsNullOrWhiteSpace(rawToken))
        {
            var tokenHash = _jwt.HashRefreshToken(rawToken);
            var existing = await _db.RefreshTokens.FirstOrDefaultAsync(rt => rt.TokenHash == tokenHash, ct);
            if (existing is not null && existing.RevokedAt is null)
            {
                existing.RevokedAt = DateTimeOffset.UtcNow;
                await _db.SaveChangesAsync(ct);
            }
        }

        ClearRefreshCookie();
        return NoContent();
    }

    [Authorize]
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutAll(CancellationToken ct)
    {
        var userId = User.GetUserId();
        var now = DateTimeOffset.UtcNow;
        var activeTokens = await _db.RefreshTokens
            .Where(rt => rt.UserId == userId && rt.RevokedAt == null && rt.ExpiresAt > now)
            .ToListAsync(ct);

        foreach (var token in activeTokens)
        {
            token.RevokedAt = now;
        }

        await _db.SaveChangesAsync(ct);
        ClearRefreshCookie();
        return NoContent();
    }

    [Authorize]
    [HttpGet("sessions")]
    public async Task<IActionResult> ListSessions(CancellationToken ct)
    {
        var userId = User.GetUserId();
        var now = DateTimeOffset.UtcNow;
        var currentRaw = Request.Cookies[RefreshCookieName];
        var currentHash = string.IsNullOrWhiteSpace(currentRaw) ? null : _jwt.HashRefreshToken(currentRaw);

        var sessions = await _db.RefreshTokens
            .AsNoTracking()
            .Where(rt => rt.UserId == userId && rt.RevokedAt == null && rt.ExpiresAt > now)
            .OrderByDescending(rt => rt.LastUsedAt ?? rt.CreatedAt)
            .Select(rt => new AuthSessionDto(
                rt.Id,
                rt.UserAgent,
                rt.IpAddress,
                rt.CreatedAt,
                rt.LastUsedAt,
                rt.ExpiresAt,
                currentHash != null && rt.TokenHash == currentHash))
            .ToListAsync(ct);

        return Ok(sessions);
    }

    [Authorize]
    [HttpDelete("sessions/{sessionId:guid}")]
    public async Task<IActionResult> RevokeSession(Guid sessionId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var token = await _db.RefreshTokens
            .FirstOrDefaultAsync(rt => rt.Id == sessionId && rt.UserId == userId, ct);

        if (token is null)
        {
            return Problem(title: "Session not found", statusCode: StatusCodes.Status404NotFound);
        }

        if (token.RevokedAt is null)
        {
            token.RevokedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(ct);
        }

        var currentRaw = Request.Cookies[RefreshCookieName];
        if (!string.IsNullOrWhiteSpace(currentRaw) && _jwt.HashRefreshToken(currentRaw) == token.TokenHash)
        {
            ClearRefreshCookie();
        }

        return NoContent();
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        var passwordError = ValidatePasswordStrength(request.NewPassword);
        if (passwordError is not null)
        {
            return Problem(
                title: "Weak password",
                detail: passwordError,
                statusCode: StatusCodes.Status400BadRequest);
        }

        var userId = User.GetUserId();
        var user = await _db.Users
            .Include(u => u.Workspace)
            .FirstOrDefaultAsync(u => u.Id == userId, ct);

        if (user is null)
        {
            return Problem(title: "Account not found", statusCode: StatusCodes.Status404NotFound);
        }

        if (!_passwordHasher.Verify(request.CurrentPassword, user.PasswordHash))
        {
            return Problem(
                title: "Invalid current password",
                detail: "Current password is incorrect.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (request.CurrentPassword == request.NewPassword)
        {
            return Problem(
                title: "Password unchanged",
                detail: "New password must be different from the current password.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        user.PasswordHash = _passwordHasher.Hash(request.NewPassword);
        user.FailedLoginAttempts = 0;
        user.LockoutEndAt = null;

        // Revoke all existing sessions so stolen devices lose access immediately
        var activeTokens = await _db.RefreshTokens
            .Where(rt => rt.UserId == user.Id && rt.RevokedAt == null && rt.ExpiresAt > now)
            .ToListAsync(ct);
        foreach (var rt in activeTokens)
        {
            rt.RevokedAt = now;
        }

        // Issue a fresh session for the current device so the user stays signed in seamlessly
        var nextRaw = _jwt.GenerateRefreshToken();
        var expiresAt = now.AddDays(_jwt.RefreshTokenDays);
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            FamilyId = Guid.NewGuid(),
            TokenHash = _jwt.HashRefreshToken(nextRaw),
            UserAgent = ReadUserAgent(),
            IpAddress = ReadClientIp(),
            LastUsedAt = now,
            ExpiresAt = expiresAt
        });

        await _db.SaveChangesAsync(ct);

        AppendRefreshCookie(nextRaw, expiresAt);

        var workspaceId = user.Workspace?.Id ?? Guid.Empty;
        var accessToken = _jwt.GenerateAccessToken(user, workspaceId);
        return Ok(new AuthResponse(
            accessToken,
            nextRaw,
            _jwt.AccessTokenExpiresInSeconds,
            user.Id,
            user.Email,
            workspaceId));
    }

    [Authorize]
    [HttpDelete("account")]
    public async Task<IActionResult> DeleteAccount(CancellationToken ct)
    {
        var userId = User.GetUserId();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return Problem(title: "Account not found", statusCode: StatusCodes.Status404NotFound);
        }

        _db.Users.Remove(user);
        await _db.SaveChangesAsync(ct);
        ClearRefreshCookie();
        return NoContent();
    }

    private string? ResolveRefreshToken(string? bodyToken)
    {
        if (!string.IsNullOrWhiteSpace(bodyToken))
        {
            return bodyToken;
        }

        return Request.Cookies.TryGetValue(RefreshCookieName, out var cookieToken) ? cookieToken : null;
    }

    private void AppendRefreshCookie(string rawRefreshToken, DateTimeOffset expiresAt)
    {
        Response.Cookies.Append(RefreshCookieName, rawRefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = SameSiteMode.Lax,
            Path = "/api/v1/auth",
            Expires = expiresAt,
            IsEssential = true
        });
    }

    private void ClearRefreshCookie()
    {
        Response.Cookies.Delete(RefreshCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = SameSiteMode.Lax,
            Path = "/api/v1/auth",
            IsEssential = true
        });
    }

    private string? ReadUserAgent()
    {
        var ua = Request.Headers.UserAgent.ToString();
        if (string.IsNullOrWhiteSpace(ua)) return null;
        return ua.Length > 512 ? ua[..512] : ua;
    }

    private string? ReadClientIp()
    {
        var forwarded = Request.Headers["X-Forwarded-For"].FirstOrDefault();
        var ip = !string.IsNullOrWhiteSpace(forwarded)
            ? forwarded.Split(',')[0].Trim()
            : HttpContext.Connection.RemoteIpAddress?.ToString();
        if (string.IsNullOrWhiteSpace(ip)) return null;
        return ip.Length > 64 ? ip[..64] : ip;
    }

    private static string? ValidatePasswordStrength(string password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < 10)
        {
            return "Password must be at least 10 characters long.";
        }

        var hasUpper = password.Any(char.IsUpper);
        var hasLower = password.Any(char.IsLower);
        var hasDigit = password.Any(char.IsDigit);

        if (!hasUpper || !hasLower || !hasDigit)
        {
            return "Password must include uppercase, lowercase letters, and at least one digit.";
        }

        return null;
    }
}
