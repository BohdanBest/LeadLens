using LeadLens.Application.DTOs;
using LeadLens.Application.Interfaces;
using LeadLens.Domain.Enums;

namespace LeadLens.Infrastructure.Services;

public sealed class NeedScoreCalculator : INeedScoreCalculator
{
    public NeedScoreResult Calculate(ServiceProfileDto profile, IReadOnlyList<AuditCheckInput> checks)
    {
        var checkWeights = profile.Checks.ToDictionary(c => c.Id, c => c.Weight, StringComparer.OrdinalIgnoreCase);
        var categoryWeights = profile.Categories.ToDictionary(c => c.Key, c => c.Weight, StringComparer.OrdinalIgnoreCase);

        var checkById = checks.ToDictionary(c => c.CheckId, StringComparer.OrdinalIgnoreCase);

        var categoryDefectRatios = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        var categoryEvaluatedWeightSums = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);

        decimal totalApplicableWeight = 0m;
        decimal totalEvaluatedWeight = 0m;

        foreach (var category in profile.Categories)
        {
            var catChecks = profile.Checks.Where(c => string.Equals(c.Category, category.Key, StringComparison.OrdinalIgnoreCase)).ToList();
            decimal weightedDefectSum = 0m;
            decimal evaluatedWeightSum = 0m;

            foreach (var cfg in catChecks)
            {
                var status = checkById.TryGetValue(cfg.Id, out var input)
                    ? input.Result
                    : CheckResultStatus.Unavailable;

                if (status == CheckResultStatus.NotApplicable)
                {
                    continue;
                }

                totalApplicableWeight += cfg.Weight;

                if (status == CheckResultStatus.Unavailable)
                {
                    continue;
                }

                var defect = status switch
                {
                    CheckResultStatus.Pass => 0m,
                    CheckResultStatus.Warning => 0.5m,
                    CheckResultStatus.Fail => 1.0m,
                    _ => 0m
                };

                evaluatedWeightSum += cfg.Weight;
                totalEvaluatedWeight += cfg.Weight;
                weightedDefectSum += cfg.Weight * defect;
            }

            if (evaluatedWeightSum > 0m)
            {
                categoryDefectRatios[category.Key] = weightedDefectSum / evaluatedWeightSum;
                categoryEvaluatedWeightSums[category.Key] = evaluatedWeightSum;
            }
        }

        var coverageRatio = totalApplicableWeight > 0m
            ? Math.Round(totalEvaluatedWeight / totalApplicableWeight, 4)
            : 0m;
        var isPartial = coverageRatio < 0.60m;

        decimal evaluatedCategoryWeightSum = categoryDefectRatios.Keys
            .Sum(k => categoryWeights.GetValueOrDefault(k, 0m));

        var categoryScores = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        var findingContributions = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);

        decimal totalScoreRaw = 0m;
        if (evaluatedCategoryWeightSum > 0m)
        {
            foreach (var (catKey, dc) in categoryDefectRatios)
            {
                var wc = categoryWeights.GetValueOrDefault(catKey, 0m);
                var catPoints = 100m * (wc / evaluatedCategoryWeightSum) * dc;
                categoryScores[catKey] = Math.Round(dc * 100m, 2);
                totalScoreRaw += catPoints;

                var catCheckWeightSum = categoryEvaluatedWeightSums[catKey];
                foreach (var cfg in profile.Checks.Where(c => string.Equals(c.Category, catKey, StringComparison.OrdinalIgnoreCase)))
                {
                    if (!checkById.TryGetValue(cfg.Id, out var input)) continue;
                    var defect = input.Result switch
                    {
                        CheckResultStatus.Warning => 0.5m,
                        CheckResultStatus.Fail => 1.0m,
                        _ => 0m
                    };
                    if (defect > 0m && catCheckWeightSum > 0m)
                    {
                        var contrib = 100m * (wc / evaluatedCategoryWeightSum) * ((cfg.Weight * defect) / catCheckWeightSum);
                        findingContributions[cfg.Id] = Math.Round(contrib, 2);
                    }
                    else
                    {
                        findingContributions[cfg.Id] = 0m;
                    }
                }
            }
        }

        var score = Math.Clamp((int)Math.Round(totalScoreRaw, MidpointRounding.AwayFromZero), 0, 100);
        var level = score switch
        {
            <= 24 => NeedLevel.Healthy,
            <= 49 => NeedLevel.Moderate,
            <= 74 => NeedLevel.Weak,
            _ => NeedLevel.Critical
        };

        return new NeedScoreResult(
            score,
            level,
            coverageRatio,
            isPartial,
            categoryScores,
            findingContributions);
    }
}
