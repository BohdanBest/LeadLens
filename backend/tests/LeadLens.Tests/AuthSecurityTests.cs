using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LeadLens.Api.Controllers;
using LeadLens.Application.DTOs;
using Xunit;

namespace LeadLens.Tests;

public class AuthSecurityTests : IClassFixture<LeadLensTestFactory>
{
    private readonly LeadLensTestFactory _factory;

    public AuthSecurityTests(LeadLensTestFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task RefreshTokenReuse_RevokesEntireSessionFamily()
    {
        using var client = _factory.CreateClient();
        var email = $"reuse_{Guid.NewGuid():N}@example.com";

        var reg = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "StrongPassword123!"
        });
        Assert.Equal(HttpStatusCode.Created, reg.StatusCode);
        var initial = await reg.Content.ReadFromJsonAsync<AuthResponse>();

        // Legitimate rotation -> token B
        var r1 = await client.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = initial!.RefreshToken });
        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
        var rotated = await r1.Content.ReadFromJsonAsync<AuthResponse>();

        // Attacker replays revoked token A -> 401 AND revokes family (including token B)
        var replay = await client.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = initial.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);

        // Token B must now also be rejected because the family was compromised
        var afterCompromise = await client.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = rotated!.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, afterCompromise.StatusCode);
    }

    [Fact]
    public async Task HttpOnlyCookie_RefreshAndLogout_WorkWithoutBodyToken()
    {
        using var client = _factory.CreateClient();
        var email = $"cookie_{Guid.NewGuid():N}@example.com";

        var reg = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "StrongPassword123!"
        });
        Assert.Equal(HttpStatusCode.Created, reg.StatusCode);
        Assert.True(reg.Headers.TryGetValues("Set-Cookie", out var setCookies));
        var cookieHeader = string.Join("; ", setCookies!);
        Assert.Contains($"{AuthController.RefreshCookieName}=", cookieHeader);
        Assert.Contains("httponly", cookieHeader, StringComparison.OrdinalIgnoreCase);

        // Refresh using only the HttpOnly cookie (empty body)
        var refreshResp = await client.PostAsync("/api/v1/auth/refresh", null);
        Assert.Equal(HttpStatusCode.OK, refreshResp.StatusCode);
        var refreshed = await refreshResp.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(refreshed);
        Assert.False(string.IsNullOrWhiteSpace(refreshed!.AccessToken));

        // Logout using only the HttpOnly cookie
        var logoutResp = await client.PostAsync("/api/v1/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logoutResp.StatusCode);

        // Subsequent refresh fails with 401
        var afterLogout = await client.PostAsync("/api/v1/auth/refresh", null);
        Assert.Equal(HttpStatusCode.Unauthorized, afterLogout.StatusCode);
    }

    [Fact]
    public async Task Login_LocksAccountAfterFiveFailedAttempts()
    {
        using var client = _factory.CreateClient();
        var email = $"lockout_{Guid.NewGuid():N}@example.com";

        var reg = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "StrongPassword123!"
        });
        Assert.Equal(HttpStatusCode.Created, reg.StatusCode);

        for (var i = 1; i <= 4; i++)
        {
            var bad = await client.PostAsJsonAsync("/api/v1/auth/login", new
            {
                email,
                password = "WrongPassword999!"
            });
            Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
        }

        // 5th failed attempt triggers 423 Locked
        var fifth = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "WrongPassword999!"
        });
        Assert.Equal((HttpStatusCode)423, fifth.StatusCode);

        // Even the correct password is blocked while locked
        var duringLock = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "StrongPassword123!"
        });
        Assert.Equal((HttpStatusCode)423, duringLock.StatusCode);
    }

    [Fact]
    public async Task SessionsAndChangePassword_RevokeOtherDevicesAndEnforcePolicy()
    {
        using var clientA = _factory.CreateClient();
        using var clientB = _factory.CreateClient();
        var email = $"sessions_{Guid.NewGuid():N}@example.com";

        // Weak password rejected on register
        var weakReg = await clientA.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "alllowercasepassword"
        });
        Assert.Equal(HttpStatusCode.BadRequest, weakReg.StatusCode);

        // Device A registers
        clientA.DefaultRequestHeaders.UserAgent.ParseAdd("LeadLensTestBrowser/1.0 (macOS)");
        var reg = await clientA.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "StrongPassword123!"
        });
        Assert.Equal(HttpStatusCode.Created, reg.StatusCode);
        var authA = await reg.Content.ReadFromJsonAsync<AuthResponse>();
        clientA.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authA!.AccessToken);

        // Device B logs in
        clientB.DefaultRequestHeaders.UserAgent.ParseAdd("LeadLensMobile/2.0 (iOS)");
        var loginB = await clientB.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "StrongPassword123!"
        });
        Assert.Equal(HttpStatusCode.OK, loginB.StatusCode);
        var authB = await loginB.Content.ReadFromJsonAsync<AuthResponse>();

        // Device A lists 2 active sessions, one marked IsCurrent
        var sessionsResp = await clientA.GetAsync("/api/v1/auth/sessions");
        Assert.Equal(HttpStatusCode.OK, sessionsResp.StatusCode);
        var sessions = await sessionsResp.Content.ReadFromJsonAsync<List<AuthSessionDto>>();
        Assert.NotNull(sessions);
        Assert.Equal(2, sessions!.Count);
        Assert.Single(sessions, s => s.IsCurrent);

        // Device A changes password -> revokes Device B's session and rotates A's token
        var changeResp = await clientA.PostAsJsonAsync("/api/v1/auth/change-password", new
        {
            currentPassword = "StrongPassword123!",
            newPassword = "NewStrongPassword456!"
        });
        Assert.Equal(HttpStatusCode.OK, changeResp.StatusCode);

        // Device B's refresh token must be revoked now
        var bRefresh = await clientB.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = authB!.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, bRefresh.StatusCode);

        // Login with new password succeeds
        var loginNew = await clientB.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "NewStrongPassword456!"
        });
        Assert.Equal(HttpStatusCode.OK, loginNew.StatusCode);

        // Logout-all revokes everything
        var logoutAll = await clientA.PostAsync("/api/v1/auth/logout-all", null);
        Assert.Equal(HttpStatusCode.NoContent, logoutAll.StatusCode);
    }
}
