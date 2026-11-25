using LeadLens.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace LeadLens.Api.Controllers;

[ApiController]
[Route("api/v1/health")]
public class HealthController : ControllerBase
{
    private readonly IServiceProfileRegistry _profiles;

    public HealthController(IServiceProfileRegistry profiles)
    {
        _profiles = profiles;
    }

    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            status = "ok",
            service = "leadlens-api",
            timestamp = DateTimeOffset.UtcNow,
            profilesLoaded = _profiles.ListProfiles().Count
        });
    }
}
