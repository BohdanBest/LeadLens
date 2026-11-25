import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))

from common.profile_loader import load_and_validate_profile  # noqa: E402
from scripts.calibrate_weights import (  # noqa: E402
    calibrate_category_weights,
    evaluate_calibration,
    precision_at_k,
    spearman_correlation,
)
from scripts.run_acceptance_benchmark import compute_acceptance_metrics  # noqa: E402


def test_spearman_and_calibration_on_30_sites() -> None:
    profile = load_and_validate_profile(
        ROOT / "profiles" / "web_studio.v1.yaml",
        ROOT / "profiles" / "schema" / "service-profile.schema.json",
    )
    initial_weights = {c["key"]: float(c["weight"]) for c in profile["categories"]}

    rng = random.Random(42)
    samples = []
    # Generate 30 synthetic labeled sites correlated strongly with performance & mobile defects
    for i in range(30):
        defects = {k: round(rng.uniform(0.0, 1.0), 2) for k in initial_weights}
        expert_score = round(
            0.40 * defects["performance"] * 100
            + 0.30 * defects["mobile"] * 100
            + 0.20 * defects["seo"] * 100
            + 0.10 * defects["security"] * 100,
            1,
        )
        samples.append({"domain": f"site-{i}.ua", "expert_score": expert_score, "category_defects": defects})

    calibrated, base_rho, cal_rho = calibrate_category_weights(samples, initial_weights)
    assert abs(sum(calibrated.values()) - 100.0) < 1e-6
    assert cal_rho >= base_rho
    assert cal_rho >= 0.5
    assert spearman_correlation([1, 2, 3, 4], [10, 20, 30, 40]) > 0.99

    report = evaluate_calibration(samples, initial_weights, k=10, needs_help_threshold=50.0)
    assert report["samples"] == 30
    assert report["spearman_target_met"] is True
    assert 0.0 <= report["baseline_precision_at_10"] <= 1.0
    assert 0.0 <= report["calibrated_precision_at_10"] <= 1.0
    assert report["calibrated_precision_at_10"] >= report["baseline_precision_at_10"] - 0.1
    assert precision_at_k([90, 80, 70, 10], [True, True, False, True], k=2) == 1.0
    assert precision_at_k([90, 80, 70, 10], [True, False, True, False], k=2) == 0.5


def test_acceptance_metrics_calculation() -> None:
    records = [
        {"url": f"https://site{i}.ua", "status": "completed" if i < 94 else "failed", "duration_seconds": 10.0 + i}
        for i in range(100)
    ]
    summary = compute_acceptance_metrics(records)
    assert summary["total"] == 100
    assert summary["completion_rate"] == 0.94
    assert summary["p90_seconds"] <= 120.0
    assert summary["passed"] is True
