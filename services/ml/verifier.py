import re
from typing import Any

_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")
_WORD_RE = re.compile(r"[a-zа-яіїєґ0-9]{3,}", re.IGNORECASE)
_FORBIDDEN_PHRASES = (
    "гарантуємо",
    "гарантуєм",
    "у 2 рази",
    "в 2 рази",
    "100% результат",
    "guarantee",
    "guaranteed",
    "double your",
    "2x more",
)


def _extract_numbers(text: str) -> set[str]:
    return {m.replace(",", ".") for m in _NUMBER_RE.findall(text or "")}


def _extract_tokens(text: str) -> set[str]:
    return set(_WORD_RE.findall((text or "").lower()))


def _score_finding_match(claim_text: str, finding: dict[str, Any]) -> tuple[float, bool]:
    """
    Score how well `claim_text` aligns with `finding`.
    Returns (similarity_score, has_contradicting_number).
    """
    claim_nums = _extract_numbers(claim_text)
    finding_raw = " ".join(
        str(x)
        for x in (
            finding.get("value") or "",
            finding.get("title_uk") or "",
            finding.get("title_en") or "",
            finding.get("expected_claim_uk") or "",
            finding.get("expected_claim_en") or "",
        )
    )
    finding_nums = _extract_numbers(finding_raw)
    finding_val_nums = _extract_numbers(str(finding.get("value") or ""))

    claim_tokens = _extract_tokens(claim_text)
    finding_tokens = _extract_tokens(finding_raw)

    if not claim_tokens:
        return 0.0, False

    overlap = len(claim_tokens & finding_tokens)
    jaccard = overlap / max(1, len(claim_tokens))

    # If claim mentions numbers, check whether they match measured numbers
    contradicts = False
    if claim_nums:
        if finding_val_nums and not (claim_nums & finding_nums):
            # Claim mentions a numeric value that differs from the measured finding value
            contradicts = True
        elif not (claim_nums & finding_nums) and not finding_val_nums:
            # Invented number where finding has no numeric measurement
            return 0.0, False

    num_bonus = 0.5 if (claim_nums and (claim_nums & finding_nums)) else 0.0
    return jaccard + num_bonus, contradicts


def verify_and_rebind_claims(
    subject: str,
    body: str,
    claims: list[dict[str, Any]],
    findings: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Verify edited email claims against audit findings and re-bind to best matching finding (FR-EML-04).
    """
    actionable = [
        f
        for f in findings
        if str(f.get("result", "")).lower() in ("fail", "warning")
    ]
    findings_by_id = {str(f["id"]): f for f in actionable if f.get("id")}

    verified_claims: list[dict[str, Any]] = []
    warnings: list[str] = []

    for claim in claims:
        text = (claim.get("text") or "").strip()
        linked_id = str(claim["finding_id"]) if claim.get("finding_id") else None

        if any(phrase in text.lower() for phrase in _FORBIDDEN_PHRASES):
            verified_claims.append(
                {
                    "id": claim.get("id"),
                    "finding_id": linked_id,
                    "check_id": claim.get("check_id"),
                    "text": text,
                    "verification_status": "Unverified",
                    "reason": "contains_forbidden_guarantee_phrase",
                }
            )
            warnings.append("Claim contains ungrounded guarantee or pressure phrasing.")
            continue

        # 1. Check current linked finding first
        best_id = linked_id
        best_score = -1.0
        best_contradicts = False

        if linked_id and linked_id in findings_by_id:
            s, c = _score_finding_match(text, findings_by_id[linked_id])
            best_score = s
            best_contradicts = c

        # 2. Check all actionable findings to allow re-binding when edited
        for fid, f in findings_by_id.items():
            s, c = _score_finding_match(text, f)
            if not c and s > best_score + 0.12:
                best_id = fid
                best_score = s
                best_contradicts = False

        if best_id and best_id in findings_by_id:
            matched_finding = findings_by_id[best_id]
            if best_contradicts:
                status = "Contradicts"
                reason = "numeric_mismatch_with_finding"
                warnings.append(f"Claim '{text[:50]}' contradicts measured finding value.")
            elif best_score >= 0.20:
                status = "Verified"
                reason = "rebound" if best_id != linked_id else "matched"
            else:
                status = "Unverified"
                reason = "insufficient_alignment_with_finding"
                warnings.append(f"Claim '{text[:50]}' is not clearly supported by audit findings.")

            verified_claims.append(
                {
                    "id": claim.get("id"),
                    "finding_id": best_id,
                    "check_id": matched_finding.get("check_id"),
                    "text": text,
                    "verification_status": status,
                    "reason": reason,
                }
            )
        else:
            verified_claims.append(
                {
                    "id": claim.get("id"),
                    "finding_id": None,
                    "check_id": None,
                    "text": text,
                    "verification_status": "Unverified",
                    "reason": "no_matching_finding",
                }
            )
            warnings.append(f"Claim '{text[:50]}' has no matching audit finding.")

    if len(subject.strip()) > 70:
        warnings.append("Subject exceeds 70 characters limit.")

    lower_body = body.lower()
    if any(p in lower_body for p in _FORBIDDEN_PHRASES):
        warnings.append("Email body contains forbidden guarantee or pressure phrasing.")

    all_verified = all(c["verification_status"] == "Verified" for c in verified_claims)
    return {
        "all_verified": all_verified,
        "claims": verified_claims,
        "warnings": warnings,
    }
