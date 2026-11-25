"""
Weight calibration utility for LeadLens (Section 4.4 / Stage K4).

Reads expert-labeled sites (each having category defect ratios D_c and an expert score),
computes Spearman rank correlation with current profile weights, and performs
coordinate-search calibration to maximize Spearman correlation while keeping sum(W_c) = 100.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

from common.profile_loader import load_and_validate_profile


def _average_ranks(values: list[float]) -> list[float]:
    n = len(values)
    indexed = sorted(enumerate(values), key=lambda x: x[1])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[indexed[k][0]] = avg_rank
        i = j + 1
    return ranks


def spearman_correlation(xs: list[float], ys: list[float]) -> float:
    """Compute Spearman rank correlation coefficient with tie handling."""
    if len(xs) != len(ys) or len(xs) < 2:
        return 0.0

    rx = _average_ranks(xs)
    ry = _average_ranks(ys)
    mean_x = sum(rx) / len(rx)
    mean_y = sum(ry) / len(ry)

    num = sum((a - mean_x) * (b - mean_y) for a, b in zip(rx, ry))
    den_x = math.sqrt(sum((a - mean_x) ** 2 for a in rx))
    den_y = math.sqrt(sum((b - mean_y) ** 2 for b in ry))
    if den_x == 0.0 or den_y == 0.0:
        return 0.0
    return num / (den_x * den_y)


def compute_weighted_score(category_defects: dict[str, float], weights: dict[str, float]) -> float:
    total_w = sum(weights[k] for k in category_defects if k in weights)
    if total_w <= 0:
        return 0.0
    return 100.0 * sum(weights[k] * category_defects[k] for k in category_defects if k in weights) / total_w


def precision_at_k(
    predicted_scores: list[float],
    needs_help_flags: list[bool],
    k: int = 10,
) -> float:
    """Compute Precision@K: fraction of truly needing-help sites among top-K predicted scores."""
    if not predicted_scores or len(predicted_scores) != len(needs_help_flags) or k <= 0:
        return 0.0
    top_k = min(k, len(predicted_scores))
    ranked = sorted(
        zip(predicted_scores, needs_help_flags),
        key=lambda item: item[0],
        reverse=True,
    )[:top_k]
    hits = sum(1 for _, flag in ranked if flag)
    return round(hits / top_k, 4)


def extract_needs_help_flags(
    samples: list[dict[str, Any]],
    threshold: float = 50.0,
) -> list[bool]:
    """Use explicit boolean 'needs_help' when labeled by expert, else expert_score >= threshold."""
    flags: list[bool] = []
    for sample in samples:
        if "needs_help" in sample and sample["needs_help"] is not None:
            flags.append(bool(sample["needs_help"]))
        else:
            flags.append(float(sample["expert_score"]) >= threshold)
    return flags


def calibrate_category_weights(
    samples: list[dict[str, Any]],
    initial_weights: dict[str, float],
    step: float = 2.0,
    iterations: int = 3,
) -> tuple[dict[str, float], float, float]:
    """
    Optimize category weights using coordinate swaps while keeping sum(weights) == 100.
    Returns (calibrated_weights, baseline_spearman, calibrated_spearman).
    """
    expert_scores = [float(s["expert_score"]) for s in samples]
    baseline_preds = [compute_weighted_score(s["category_defects"], initial_weights) for s in samples]
    baseline_rho = spearman_correlation(baseline_preds, expert_scores)

    best_weights = dict(initial_weights)
    best_rho = baseline_rho
    keys = list(best_weights.keys())

    for _ in range(iterations):
        improved = False
        for inc_k in keys:
            for dec_k in keys:
                if inc_k == dec_k or best_weights[dec_k] - step < 2.0:
                    continue
                candidate = dict(best_weights)
                candidate[inc_k] += step
                candidate[dec_k] -= step
                preds = [compute_weighted_score(s["category_defects"], candidate) for s in samples]
                rho = spearman_correlation(preds, expert_scores)
                if rho > best_rho + 1e-6:
                    best_rho = rho
                    best_weights = candidate
                    improved = True
        if not improved:
            break

    return best_weights, round(baseline_rho, 4), round(best_rho, 4)


def evaluate_calibration(
    samples: list[dict[str, Any]],
    initial_weights: dict[str, float],
    step: float = 2.0,
    iterations: int = 3,
    k: int = 10,
    needs_help_threshold: float = 50.0,
) -> dict[str, Any]:
    """Run weight calibration and compute Spearman correlation + Precision@K before and after."""
    calibrated, base_rho, cal_rho = calibrate_category_weights(
        samples,
        initial_weights,
        step=step,
        iterations=iterations,
    )
    needs_help = extract_needs_help_flags(samples, threshold=needs_help_threshold)
    base_preds = [compute_weighted_score(s["category_defects"], initial_weights) for s in samples]
    cal_preds = [compute_weighted_score(s["category_defects"], calibrated) for s in samples]

    base_p_at_k = precision_at_k(base_preds, needs_help, k=k)
    cal_p_at_k = precision_at_k(cal_preds, needs_help, k=k)

    return {
        "samples": len(samples),
        "positive_leads": sum(1 for f in needs_help if f),
        "needs_help_threshold": needs_help_threshold,
        "k": min(k, len(samples)),
        "baseline_spearman": base_rho,
        "calibrated_spearman": cal_rho,
        "baseline_precision_at_10": base_p_at_k,
        "calibrated_precision_at_10": cal_p_at_k,
        "spearman_target_met": cal_rho >= 0.5,
        "initial_weights": initial_weights,
        "calibrated_weights": calibrated,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate Need score category weights on labeled sites.")
    parser.add_argument("--dataset", required=True, type=Path, help="JSON array of {domain, expert_score, category_defects}")
    parser.add_argument("--profile", default=Path("profiles/web_studio.v1.yaml"), type=Path)
    parser.add_argument("--schema", default=Path("profiles/schema/service-profile.schema.json"), type=Path)
    parser.add_argument("--k", default=10, type=int, help="K for Precision@K metric (default: 10)")
    parser.add_argument("--threshold", default=50.0, type=float, help="Expert score threshold for needs_help if boolean omitted")
    parser.add_argument("--out", default=None, type=Path, help="Optional path to save JSON calibration report")
    args = parser.parse_args()

    profile = load_and_validate_profile(args.profile, args.schema)
    initial = {c["key"]: float(c["weight"]) for c in profile["categories"]}
    samples = json.loads(args.dataset.read_text(encoding="utf-8"))

    report = evaluate_calibration(
        samples,
        initial,
        k=args.k,
        needs_help_threshold=args.threshold,
    )
    rendered = json.dumps(report, indent=2, ensure_ascii=False)
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
