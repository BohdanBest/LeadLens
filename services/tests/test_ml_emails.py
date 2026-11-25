import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))

from common.config import settings  # noqa: E402
from ml.generator import generate_template_email  # noqa: E402
from ml.verifier import verify_and_rebind_claims  # noqa: E402


def _sample_findings() -> list[dict]:
    return [
        {
            "id": "f-perf",
            "check_id": "PERF-01",
            "result": "fail",
            "value": "5.2 с",
            "score_contribution": 12.5,
            "evidence_refs": ["метрика: 5200 мс"],
            "title_uk": "Повільне завантаження основного контенту (LCP на мобільному)",
            "title_en": "Slow mobile Largest Contentful Paint (LCP)",
            "expected_claim_uk": "головний екран на мобільному завантажується за 5.2 с (рекомендовано до 2,5 с)",
        },
        {
            "id": "f-mob",
            "check_id": "MOB-01",
            "result": "fail",
            "value": "meta viewport не знайдено",
            "score_contribution": 9.0,
            "evidence_refs": ["скріншот mobile.png"],
            "title_uk": "Відсутній мета-тег viewport",
            "title_en": "Missing viewport meta tag",
            "expected_claim_uk": "на сайті відсутній тег meta viewport для коректного відображення на смартфонах",
        },
        {
            "id": "f-seo",
            "check_id": "SEO-02",
            "result": "fail",
            "value": "відсутній",
            "score_contribution": 4.0,
            "evidence_refs": [],
            "title_uk": "Відсутній meta description",
            "title_en": "Missing meta description",
        },
    ]


def test_generates_all_8_template_variants_within_limits(monkeypatch) -> None:
    monkeypatch.setattr(settings, "profiles_dir", ROOT / "profiles")
    findings = _sample_findings()

    for lang in ("uk", "en"):
        for tone in ("formal", "friendly"):
            for length in ("short", "medium"):
                out = generate_template_email(
                    domain="example-clinic.ua",
                    findings=findings,
                    signature="Богдан, LeadLens Studio",
                    studio_services=["performance_optimization"],
                    language=lang,
                    tone=tone,
                    length=length,
                )
                assert len(out["subject"]) <= 70
                max_words = 130 if length == "short" else 220
                assert out["word_count"] <= max_words
                assert len(out["claims"]) == 3
                assert all(c["verification_status"] == "Verified" for c in out["claims"])
                assert out["forbidden_phrases"] == []


def test_verify_and_rebind_claims_catches_contradictions_and_rebinds() -> None:
    findings = _sample_findings()

    result = verify_and_rebind_claims(
        subject="Що можна покращити на сайті example.ua",
        body="Текст листа",
        claims=[
            # Edited text now matches MOB-01 even though initially linked to f-perf
            {
                "id": "c1",
                "finding_id": "f-perf",
                "text": "на сайті відсутній тег meta viewport для відображення на смартфонах",
            },
            # Fabricated number contradicting 5.2 s
            {
                "id": "c2",
                "finding_id": "f-perf",
                "text": "головний екран завантажується за 19.8 с",
            },
            # Forbidden guarantee
            {
                "id": "c3",
                "finding_id": "f-seo",
                "text": "гарантуємо у 2 рази більше клієнтів після додавання meta description",
            },
        ],
        findings=findings,
    )

    assert not result["all_verified"]
    c1, c2, c3 = result["claims"]

    assert c1["finding_id"] == "f-mob"
    assert c1["verification_status"] == "Verified"
    assert c1["reason"] == "rebound"

    assert c2["verification_status"] == "Contradicts"
    assert c3["verification_status"] == "Unverified"
