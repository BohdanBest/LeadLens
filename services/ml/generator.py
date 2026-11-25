import re
from typing import Any

from common.config import settings
from common.profile_loader import load_and_validate_profile

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


def _trim_to_word_limit(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]).rstrip(",;:") + "..."


def _truncate_subject(subject: str, max_chars: int = 70) -> str:
    cleaned = re.sub(r"\s+", " ", subject).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[: max_chars - 1].rstrip() + "…"


def generate_template_email(
    domain: str,
    findings: list[dict[str, Any]],
    signature: str,
    studio_services: list[str],
    profile_key: str = "web_studio",
    profile_version: int = 1,
    language: str = "uk",
    tone: str = "formal",
    length: str = "short",
) -> dict[str, Any]:
    """
    Deterministically build an evidence-backed email draft from profile templates and audit findings (M9).
    """
    lang = "en" if language == "en" else "uk"
    tn = "friendly" if tone == "friendly" else "formal"
    ln = "medium" if length == "medium" else "short"

    profile_path = settings.profiles_dir / f"{profile_key}.v{profile_version}.yaml"
    schema_path = settings.profiles_dir / "schema" / "service-profile.schema.json"
    profile = load_and_validate_profile(profile_path, schema_path)

    checks_by_id = {c["id"]: c for c in profile["checks"]}
    template = next(
        (
            t
            for t in profile["email_templates"]
            if t["language"] == lang and t["tone"] == tn and t["length"] == ln
        ),
        profile["email_templates"][0],
    )

    # Filter actionable findings and take up to 3 sorted by score_contribution DESC
    actionable = [
        f
        for f in findings
        if str(f.get("result", "")).lower() in ("fail", "warning")
        and f.get("check_id") in checks_by_id
    ]
    actionable.sort(key=lambda x: float(x.get("score_contribution", 0.0)), reverse=True)
    selected = actionable[:3]

    claims: list[dict[str, Any]] = []
    claim_lines: list[str] = []
    for f in selected:
        cfg = checks_by_id[f["check_id"]]
        measured = str(f.get("value") or "").strip() or ("issue detected" if lang == "en" else "виявлено проблему")
        claim_tmpl = (cfg.get("claim_template") or {}).get(lang)
        if claim_tmpl:
            claim_text = claim_tmpl.replace("{value}", measured)
        else:
            title = cfg["title"][lang]
            claim_text = f"{title} ({measured})"

        ev_refs = f.get("evidence_refs") or []
        ev_hint = f" [{', '.join(ev_refs[:2])}]" if ev_refs else ""
        claim_lines.append(f"- {claim_text}{ev_hint}")
        claims.append(
            {
                "finding_id": f.get("id"),
                "check_id": f["check_id"],
                "text": claim_text,
                "verification_status": "Verified",
            }
        )

    if not claim_lines:
        fallback_line = (
            "- no critical technical blockers were detected during automated review"
            if lang == "en"
            else "- під час базового огляду критичних технічних блокувань не виявлено"
        )
        claim_lines.append(fallback_line)

    if selected:
        top_cfg = checks_by_id[selected[0]["check_id"]]
        primary_service = (top_cfg.get("service_label") or {}).get(lang) or top_cfg["service"].replace("_", " ")
    elif studio_services:
        primary_service = studio_services[0]
    else:
        primary_service = "website improvements" if lang == "en" else "доопрацюванням сайту"

    clean_sig = (signature or "").strip() or ("Best regards,\nLeadLens Studio" if lang == "en" else "З повагою,\nКоманда студії")

    subject = _truncate_subject(template["subject"].replace("{domain}", domain), max_chars=70)
    body = (
        template["body"]
        .replace("{domain}", domain)
        .replace("{claims_block}", "\n".join(claim_lines))
        .replace("{primary_service}", primary_service)
        .replace("{signature}", clean_sig)
        .strip()
    )

    max_words = 130 if ln == "short" else 220
    word_count = len(body.split())
    if word_count > max_words:
        # Preserve opt-out last line while respecting word limit
        lines = [line for line in body.splitlines() if line.strip()]
        if len(lines) >= 2:
            opt_out = lines[-1]
            opt_words = len(opt_out.split())
            prefix_budget = max(20, max_words - opt_words - 1)
            prefix = _trim_to_word_limit("\n".join(lines[:-1]), prefix_budget)
            body = f"{prefix}\n\n{opt_out}"
        else:
            body = _trim_to_word_limit(body, max_words)
        word_count = len(body.split())

    lower_body = body.lower()
    forbidden_hits = [p for p in _FORBIDDEN_PHRASES if p in lower_body]

    return {
        "subject": subject,
        "body": body,
        "claims": claims,
        "word_count": word_count,
        "forbidden_phrases": forbidden_hits,
    }
