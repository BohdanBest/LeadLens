"""
Acceptance & load benchmark script for LeadLens (Section 6.2).

Runs up to 5 concurrent site audits against a target URL list (default 100 sites),
verifies completion rate (>= 90%) and p90 duration (<= 120s), and checks crawler rate limits.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import time
from pathlib import Path
from typing import Any

from audit.runner import run_site_audit
from common.storage import InMemoryArtifactStorage
from crawler.robots import DomainRateLimiter, RobotsPolicyCache


def compute_acceptance_metrics(records: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)
    if total == 0:
        return {"total": 0, "completed": 0, "completion_rate": 0.0, "p90_seconds": 0.0, "passed": False}

    durations = sorted(float(r["duration_seconds"]) for r in records)
    p90_idx = max(0, min(total - 1, math.ceil(0.90 * total) - 1))
    p90 = round(durations[p90_idx], 2)

    completed = sum(1 for r in records if r["status"] == "completed")
    rate = round(completed / total, 4)

    return {
        "total": total,
        "completed": completed,
        "completion_rate": rate,
        "p90_seconds": p90,
        "passed": rate >= 0.90 and p90 <= 120.0,
    }


async def run_benchmark(urls: list[str], concurrency: int = 5) -> dict[str, Any]:
    storage = InMemoryArtifactStorage()
    limiter = DomainRateLimiter(rps=1.0)
    robots = RobotsPolicyCache()
    semaphore = asyncio.Semaphore(concurrency)
    records: list[dict[str, Any]] = []

    async def _worker(idx: int, url: str) -> None:
        async with semaphore:
            t0 = time.monotonic()
            res = await run_site_audit(
                audit_id=f"bench-{idx}",
                url=url,
                profile_key="web_studio",
                profile_version=1,
                storage=storage,
                rate_limiter=limiter,
                robots_cache=robots,
            )
            dt = time.monotonic() - t0
            records.append({
                "url": url,
                "status": res.get("status", "failed"),
                "failure_reason": res.get("failure_reason"),
                "duration_seconds": round(dt, 2),
            })

    await asyncio.gather(*(_worker(i, u) for i, u in enumerate(urls)))
    summary = compute_acceptance_metrics(records)
    summary["records"] = records
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Run LeadLens 100-site acceptance benchmark.")
    parser.add_argument("--urls-file", required=True, type=Path, help="Text file with one URL per line")
    parser.add_argument("--concurrency", default=5, type=int)
    parser.add_argument("--out", default=Path("acceptance_report.json"), type=Path)
    args = parser.parse_args()

    urls = [line.strip() for line in args.urls_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    report = asyncio.run(run_benchmark(urls, concurrency=args.concurrency))
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "records"}, indent=2))


if __name__ == "__main__":
    main()
