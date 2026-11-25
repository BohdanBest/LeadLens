import asyncio
import base64
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Response, status
from pydantic import BaseModel

from audit.runner import render_html_to_pdf, run_site_audit
from common.config import settings
from common.logging import configure_logging
from common.schemas import JobAcceptedResponse
from common.storage import S3ArtifactStorage
from crawler.robots import DomainRateLimiter, RobotsPolicyCache

logger = configure_logging("audit")
app = FastAPI(title="LeadLens Audit Service", version="0.2.0")

_jobs: dict[str, dict[str, Any]] = {}
_storage = S3ArtifactStorage()
_rate_limiter = DomainRateLimiter(rps=settings.crawler_rate_limit_rps)
_robots_cache = RobotsPolicyCache(user_agent=settings.crawler_user_agent)


class AuditJobRequest(BaseModel):
    audit_id: str
    site_id: str
    url: str
    profile_key: str = "web_studio"
    profile_version: int = 1


class PdfRenderRequest(BaseModel):
    html: str


def _verify_internal_token(x_internal_token: str | None) -> None:
    if x_internal_token != settings.internal_service_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")


async def _execute_audit_job(job_id: str, payload: AuditJobRequest) -> None:
    job = _jobs[job_id]
    try:
        result = await run_site_audit(
            audit_id=payload.audit_id,
            url=payload.url,
            profile_key=payload.profile_key,
            profile_version=payload.profile_version,
            storage=_storage,
            rate_limiter=_rate_limiter,
            robots_cache=_robots_cache,
        )
        job.update(result)
        logger.info("Audit job finished", extra={"job_id": job_id})
    except Exception as exc:
        logger.exception("Audit job crashed", extra={"job_id": job_id})
        job["status"] = "failed"
        job["failure_reason"] = "internal_error"
        job["detail"] = str(exc)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "audit"}


@app.post("/internal/jobs/audit", status_code=status.HTTP_202_ACCEPTED, response_model=JobAcceptedResponse)
async def enqueue_audit(
    payload: AuditJobRequest,
    x_internal_token: str | None = Header(default=None),
) -> JobAcceptedResponse:
    _verify_internal_token(x_internal_token)
    job_id = f"aud-{payload.audit_id}"
    if job_id not in _jobs or _jobs[job_id]["status"] == "failed":
        _jobs[job_id] = {
            "job_id": job_id,
            "audit_id": payload.audit_id,
            "site_id": payload.site_id,
            "status": "running",
        }
        asyncio.create_task(_execute_audit_job(job_id, payload))
        logger.info("Audit job enqueued", extra={"job_id": job_id})

    return JobAcceptedResponse(job_id=job_id, status=_jobs[job_id]["status"])


@app.get("/internal/jobs/{job_id}")
def get_audit_job(
    job_id: str,
    x_internal_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _verify_internal_token(x_internal_token)
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@app.post("/internal/reports/pdf")
async def render_pdf(
    payload: PdfRenderRequest,
    x_internal_token: str | None = Header(default=None),
) -> dict[str, str]:
    _verify_internal_token(x_internal_token)
    pdf_bytes = await render_html_to_pdf(payload.html)
    return {"pdf_base64": base64.b64encode(pdf_bytes).decode("ascii")}


@app.get("/internal/artifacts/{key:path}")
def download_artifact(
    key: str,
    x_internal_token: str | None = Header(default=None),
) -> Response:
    _verify_internal_token(x_internal_token)
    data = _storage.download_bytes(key)
    media_type = "image/png" if key.endswith(".png") else "application/pdf" if key.endswith(".pdf") else "application/octet-stream"
    return Response(content=data, media_type=media_type)
