using LeadLens.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace LeadLens.Api.Controllers;

[ApiController]
[Route("api/v1/service-profiles")]
public class ServiceProfilesController : ControllerBase
{
    private readonly IServiceProfileRegistry _profiles;

    public ServiceProfilesController(IServiceProfileRegistry profiles)
    {
        _profiles = profiles;
    }

    [HttpGet]
    public IActionResult List()
    {
        return Ok(_profiles.ListProfiles());
    }

    [HttpGet("{key}")]
    public IActionResult GetByKey(string key, [FromQuery] int? version = null)
    {
        var profile = _profiles.GetProfile(key, version);
        if (profile is null)
        {
            return Problem(
                title: "Service profile not found",
                detail: $"Profile '{key}'{(version.HasValue ? $" v{version}" : "")} does not exist.",
                statusCode: StatusCodes.Status404NotFound);
        }

        return Ok(profile);
    }
}
