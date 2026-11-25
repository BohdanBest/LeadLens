using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using LeadLens.Application.Interfaces;
using LeadLens.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace LeadLens.Infrastructure.Security;

public sealed class JwtTokenService : IJwtTokenService
{
    private readonly string _secret;
    private readonly string _issuer;
    private readonly string _audience;

    public JwtTokenService(IConfiguration configuration)
    {
        _secret = configuration["Jwt:Secret"]
                  ?? "dev_super_secret_jwt_key_at_least_32_characters_long";
        _issuer = configuration["Jwt:Issuer"] ?? "leadlens-api";
        _audience = configuration["Jwt:Audience"] ?? "leadlens-web";
        AccessTokenExpiresInSeconds = Math.Max(60, (configuration.GetValue<int?>("Jwt:AccessMinutes") ?? 15) * 60);
        RefreshTokenDays = Math.Max(1, configuration.GetValue<int?>("Jwt:RefreshDays") ?? 7);
    }

    public int AccessTokenExpiresInSeconds { get; }
    public int RefreshTokenDays { get; }

    public string GenerateAccessToken(User user, Guid workspaceId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("workspace_id", workspaceId.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.AddSeconds(AccessTokenExpiresInSeconds),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    public string HashRefreshToken(string refreshToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken));
        return Convert.ToHexString(bytes);
    }
}
