using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace LeadLens.Infrastructure.Profiles;

public sealed class YamlServiceProfileRegistry : IServiceProfileRegistry
{
    private readonly List<ServiceProfileDto> _profiles = new();

    public YamlServiceProfileRegistry(string profilesDirectory)
    {
        if (!Directory.Exists(profilesDirectory))
        {
            throw new DirectoryNotFoundException($"Profiles directory not found: {profilesDirectory}");
        }

        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(UnderscoredNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();

        var yamlFiles = Directory.GetFiles(profilesDirectory, "*.yaml", SearchOption.TopDirectoryOnly)
            .Concat(Directory.GetFiles(profilesDirectory, "*.yml", SearchOption.TopDirectoryOnly))
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase);

        foreach (var file in yamlFiles)
        {
            var rawYaml = File.ReadAllText(file);
            var parsed = deserializer.Deserialize<YamlProfileModel>(rawYaml)
                         ?? throw new InvalidOperationException($"Failed to parse profile {file}");

            ValidateProfile(parsed, file);

            var dto = new ServiceProfileDto(
                parsed.Key,
                parsed.Version,
                new LocalizedTextDto(parsed.Name.Uk, parsed.Name.En),
                parsed.Categories
                    .Select(c => new ServiceProfileCategoryDto(
                        c.Key,
                        c.Weight,
                        new LocalizedTextDto(c.Name.Uk, c.Name.En)))
                    .ToList(),
                parsed.Checks
                    .Select(ch => new ServiceProfileCheckDto(
                        ch.Id,
                        ch.Category,
                        ch.Weight,
                        ch.Impact,
                        ch.Effort,
                        ch.Service,
                        ch.ServiceLabel is null ? null : new LocalizedTextDto(ch.ServiceLabel.Uk, ch.ServiceLabel.En),
                        new LocalizedTextDto(ch.Title.Uk, ch.Title.En),
                        new LocalizedTextDto(ch.Description.Uk, ch.Description.En),
                        ch.ClaimTemplate is null ? null : new LocalizedTextDto(ch.ClaimTemplate.Uk, ch.ClaimTemplate.En),
                        ch.Thresholds))
                    .ToList(),
                parsed.EmailTemplates
                    .Select(t => new EmailTemplateDto(t.Language, t.Tone, t.Length, t.Subject, t.Body))
                    .ToList());

            _profiles.Add(dto);
        }

        if (_profiles.Count == 0)
        {
            throw new InvalidOperationException($"No service profiles found in {profilesDirectory}");
        }
    }

    public IReadOnlyList<ServiceProfileSummaryDto> ListProfiles() =>
        _profiles
            .Select(p => new ServiceProfileSummaryDto(p.Key, p.Version, p.Name, p.Categories.Count, p.Checks.Count))
            .ToList();

    public ServiceProfileDto? GetProfile(string key, int? version = null) =>
        version.HasValue
            ? _profiles.FirstOrDefault(p => p.Key == key && p.Version == version.Value)
            : _profiles.Where(p => p.Key == key).OrderByDescending(p => p.Version).FirstOrDefault();

    private static void ValidateProfile(YamlProfileModel model, string filePath)
    {
        if (string.IsNullOrWhiteSpace(model.Key))
            throw new InvalidOperationException($"Profile {filePath} is missing 'key'.");

        var weightSum = model.Categories.Sum(c => c.Weight);
        if (Math.Abs(weightSum - 100m) > 0.001m)
            throw new InvalidOperationException($"Profile {filePath} category weights must sum to 100, got {weightSum}.");

        var categoryKeys = model.Categories.Select(c => c.Key).ToHashSet(StringComparer.Ordinal);
        var seenChecks = new HashSet<string>(StringComparer.Ordinal);
        foreach (var check in model.Checks)
        {
            if (!seenChecks.Add(check.Id))
                throw new InvalidOperationException($"Duplicate check '{check.Id}' in {filePath}.");
            if (!categoryKeys.Contains(check.Category))
                throw new InvalidOperationException($"Check '{check.Id}' uses unknown category '{check.Category}'.");
        }
    }

    private sealed class YamlProfileModel
    {
        public string Key { get; set; } = string.Empty;
        public int Version { get; set; }
        public YamlLocalizedText Name { get; set; } = new();
        public List<YamlCategory> Categories { get; set; } = new();
        public List<YamlCheck> Checks { get; set; } = new();
        public List<YamlEmailTemplate> EmailTemplates { get; set; } = new();
    }

    private sealed class YamlLocalizedText
    {
        public string Uk { get; set; } = string.Empty;
        public string En { get; set; } = string.Empty;
    }

    private sealed class YamlCategory
    {
        public string Key { get; set; } = string.Empty;
        public decimal Weight { get; set; }
        public YamlLocalizedText Name { get; set; } = new();
    }

    private sealed class YamlCheck
    {
        public string Id { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public decimal Weight { get; set; }
        public int Impact { get; set; }
        public int Effort { get; set; }
        public string Service { get; set; } = string.Empty;
        public YamlLocalizedText? ServiceLabel { get; set; }
        public YamlLocalizedText Title { get; set; } = new();
        public YamlLocalizedText Description { get; set; } = new();
        public YamlLocalizedText? ClaimTemplate { get; set; }
        public Dictionary<string, object?> Thresholds { get; set; } = new();
    }

    private sealed class YamlEmailTemplate
    {
        public string Language { get; set; } = string.Empty;
        public string Tone { get; set; } = string.Empty;
        public string Length { get; set; } = string.Empty;
        public string Subject { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
    }
}
