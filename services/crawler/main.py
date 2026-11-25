import asyncio
from typing import Any

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from common.config import settings
from common.logging import configure_logging
from common.schemas import JobAcceptedResponse
from crawler.availability import check_site_availability
from crawler.discovery import (
    CsvImportSource,
    DiscoveredCandidate,
    GooglePlacesSource,
    ManualUrlSource,
    OpenStreetMapOverpassSource,
    SiteDiscoverySource,
    is_excluded_domain,
    matches_exclusion_keywords,
)
from crawler.robots import DomainRateLimiter, RobotsPolicyCache

logger = configure_logging("crawler")
app = FastAPI(title="LeadLens Crawler Service", version="0.2.0")

_jobs: dict[str, dict[str, Any]] = {}
_rate_limiter = DomainRateLimiter(rps=settings.crawler_rate_limit_rps)
_robots_cache = RobotsPolicyCache(user_agent=settings.crawler_user_agent)


class DiscoveryJobRequest(BaseModel):
    campaign_id: str
    niche: str
    region: str | None = None
    language: str = "uk"
    site_limit: int = Field(default=50, ge=1, le=500)
    source_type: str = "ManualList"
    exclusion_keywords: list[str] = Field(default_factory=list)
    manual_urls: list[str] = Field(default_factory=list)
    csv_content: str | None = None


def _verify_internal_token(x_internal_token: str | None) -> None:
    if x_internal_token != settings.internal_service_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")


def _build_source(payload: DiscoveryJobRequest) -> SiteDiscoverySource:
    if payload.source_type == "CsvImport":
        if not payload.csv_content:
            raise HTTPException(status_code=400, detail="csv_content is required for CsvImport")
        return CsvImportSource(payload.csv_content)
    if payload.source_type == "OpenStreetMap":
        return OpenStreetMapOverpassSource(payload.niche, payload.region, payload.language)
    if payload.source_type == "GooglePlaces":
        return GooglePlacesSource(payload.niche, payload.region, payload.language)
    return ManualUrlSource(payload.manual_urls)


async def _run_discovery_job(job_id: str, payload: DiscoveryJobRequest) -> None:
    job = _jobs[job_id]
    try:
        source = _build_source(payload)
        raw_candidates: list[DiscoveredCandidate] = await source.discover(limit=payload.site_limit)

        seen_domains: set[str] = set()
        results: list[dict[str, Any]] = []

        for cand in raw_candidates:
            if cand.domain in seen_domains:
                continue
            seen_domains.add(cand.domain)

            if is_excluded_domain(cand.domain):
                results.append(
                    {
                        "domain": cand.domain,
                        "url": cand.url,
                        "business_name": cand.business_name,
                        "source": cand.source,
                        "status": "Excluded",
                        "reason": "excluded_domain",
                        "page_title": None,
                    }
                )
                continue

            matched_kw = matches_exclusion_keywords(
                payload.exclusion_keywords, cand.url, cand.domain, cand.business_name
            )
            if matched_kw:
                results.append(
                    {
                        "domain": cand.domain,
                        "url": cand.url,
                        "business_name": cand.business_name,
                        "source": cand.source,
                        "status": "Excluded",
                        "reason": f"excluded_keyword:{matched_kw}",
                        "page_title": None,
                    }
                )
                continue

            avail = await check_site_availability(
                cand.url,
                rate_limiter=_rate_limiter,
                robots_cache=_robots_cache,
            )

            if avail.reachable:
                title_kw = matches_exclusion_keywords(payload.exclusion_keywords, avail.page_title)
                if title_kw:
                    results.append(
                        {
                            "domain": cand.domain,
                            "url": avail.final_url,
                            "business_name": cand.business_name,
                            "source": cand.source,
                            "status": "Excluded",
                            "reason": f"excluded_keyword:{title_kw}",
                            "page_title": avail.page_title,
                        }
                    )
                    continue

                results.append(
                    {
                        "domain": cand.domain,
                        "url": avail.final_url,
                        "business_name": cand.business_name,
                        "source": cand.source,
                        "status": "Pending",
                        "reason": None,
                        "page_title": avail.page_title,
                    }
                )
            else:
                results.append(
                    {
                        "domain": cand.domain,
                        "url": avail.final_url,
                        "business_name": cand.business_name,
                        "source": cand.source,
                        "status": "Unreachable",
                        "reason": avail.reason,
                        "page_title": None,
                    }
                )

            job["processed"] = len(results)

        job["status"] = "completed"
        job["sites"] = results
        logger.info("Discovery job completed", extra={"job_id": job_id})
    except Exception as exc:
        logger.exception("Discovery job failed", extra={"job_id": job_id})
        job["status"] = "failed"
        job["error"] = str(exc)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "crawler"}


@app.post("/internal/jobs/discover", status_code=status.HTTP_202_ACCEPTED, response_model=JobAcceptedResponse)
async def enqueue_discovery(
    payload: DiscoveryJobRequest,
    x_internal_token: str | None = Header(default=None),
) -> JobAcceptedResponse:
    _verify_internal_token(x_internal_token)
    job_id = f"disc-{payload.campaign_id}"
    if job_id not in _jobs or _jobs[job_id]["status"] in ("failed",):
        _jobs[job_id] = {
            "job_id": job_id,
            "campaign_id": payload.campaign_id,
            "status": "running",
            "processed": 0,
            "sites": [],
            "error": None,
        }
        asyncio.create_task(_run_discovery_job(job_id, payload))
        logger.info("Discovery job enqueued", extra={"job_id": job_id})

    return JobAcceptedResponse(job_id=job_id, status=_jobs[job_id]["status"])


@app.get("/internal/jobs/{job_id}")
def get_job_status(
    job_id: str,
    x_internal_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _verify_internal_token(x_internal_token)
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job
