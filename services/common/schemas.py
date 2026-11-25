from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class CheckResultStatus(str, Enum):
    PASS = "pass"
    WARNING = "warning"
    FAIL = "fail"
    UNAVAILABLE = "unavailable"
    NOT_APPLICABLE = "not_applicable"


class EvidenceItem(BaseModel):
    kind: str
    ref: str | None = None
    snippet: str | None = None
    metric: str | int | float | None = None


class FindingResult(BaseModel):
    check_id: str
    category: str
    result: CheckResultStatus
    value: str | None = None
    impact: int = Field(ge=1, le=5)
    effort: int = Field(ge=1, le=5)
    service: str
    evidence: list[EvidenceItem] = Field(default_factory=list)


class JobAcceptedResponse(BaseModel):
    job_id: str
    status: str = "accepted"
    detail: dict[str, Any] = Field(default_factory=dict)
