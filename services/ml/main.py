from typing import Any

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from common.config import settings
from common.logging import configure_logging
from ml.generator import generate_template_email
from ml.verifier import verify_and_rebind_claims

logger = configure_logging("ml")
app = FastAPI(title="LeadLens ML & Template Service", version="0.2.0")


class EmailGenerateRequest(BaseModel):
    domain: str
    profile_key: str = "web_studio"
    profile_version: int = 1
    language: str = "uk"
    tone: str = "formal"
    length: str = "short"
    signature: str = ""
    studio_services: list[str] = Field(default_factory=list)
    findings: list[dict[str, Any]] = Field(default_factory=list)


class EmailVerifyRequest(BaseModel):
    subject: str
    body: str
    claims: list[dict[str, Any]] = Field(default_factory=list)
    findings: list[dict[str, Any]] = Field(default_factory=list)


def _verify_internal_token(x_internal_token: str | None) -> None:
    if x_internal_token != settings.internal_service_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ml"}


@app.post("/internal/emails/generate")
def generate_email(
    payload: EmailGenerateRequest,
    x_internal_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _verify_internal_token(x_internal_token)
    logger.info("Generating template email", extra={"domain": payload.domain})
    return generate_template_email(
        domain=payload.domain,
        findings=payload.findings,
        signature=payload.signature,
        studio_services=payload.studio_services,
        profile_key=payload.profile_key,
        profile_version=payload.profile_version,
        language=payload.language,
        tone=payload.tone,
        length=payload.length,
    )


@app.post("/internal/emails/verify")
def verify_email(
    payload: EmailVerifyRequest,
    x_internal_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _verify_internal_token(x_internal_token)
    return verify_and_rebind_claims(
        subject=payload.subject,
        body=payload.body,
        claims=payload.claims,
        findings=payload.findings,
    )
