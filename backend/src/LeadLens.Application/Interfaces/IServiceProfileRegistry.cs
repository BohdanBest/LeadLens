using LeadLens.Application.DTOs;

namespace LeadLens.Application.Interfaces;

public interface IServiceProfileRegistry
{
    IReadOnlyList<ServiceProfileSummaryDto> ListProfiles();
    ServiceProfileDto? GetProfile(string key, int? version = null);
}
