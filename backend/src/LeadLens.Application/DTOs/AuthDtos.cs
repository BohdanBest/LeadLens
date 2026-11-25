using System.ComponentModel.DataAnnotations;

namespace LeadLens.Application.DTOs;

public record RegisterRequest(
    [Required, EmailAddress, MaxLength(320)] string Email,
    [Required, MinLength(10), MaxLength(128)] string Password,
    [MaxLength(120)] string? StudioName = null);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password);

public record RefreshRequest(string? RefreshToken = null);

public record LogoutRequest(string? RefreshToken = null);

public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required, MinLength(10), MaxLength(128)] string NewPassword);

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    int ExpiresInSeconds,
    Guid UserId,
    string Email,
    Guid WorkspaceId);

public record AuthSessionDto(
    Guid Id,
    string? UserAgent,
    string? IpAddress,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastUsedAt,
    DateTimeOffset ExpiresAt,
    bool IsCurrent);
