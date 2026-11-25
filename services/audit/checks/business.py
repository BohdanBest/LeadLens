import re
from typing import Any

from bs4 import BeautifulSoup

from common.schemas import CheckResultStatus, EvidenceItem, FindingResult

_PHONE_RE = re.compile(r"(?:\+?38\s*)?(?:\(0\d{2}\)|0\d{2})[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\+\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{2,4}")
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

_CHAT_MARKERS = ("jivosite", "tawk.to", "intercom", "binotel", "ringostat", "livechat", "crisp.chat", "helpcrunch", "sendpulse", "t.me/", "viber://", "wa.me/")
_ECOMMERCE_MARKERS = ("кошик", "корзина", "в кошик", "купити", "оформити замовлення", "add to cart", "shopping cart", "checkout", "basket")
_CART_MARKERS = ("кошик", "корзина", "cart", "basket")
_PAYMENT_MARKERS = ("оплата", "liqpay", "wayforpay", "fondy", "monobank", "приват", "visa", "mastercard", "payment", "карткою", "накладений")
_DELIVERY_MARKERS = ("доставка", "нова пошта", "укрпошта", "самовивіз", "delivery", "shipping")
_REVIEWS_MARKERS = ("відгук", "відгуки", "отзыв", "reviews", "testimonials", "рейтинг клієнтів")
_RETURN_MARKERS = ("повернення", "обмін", "гарантія", "умови повернення", "return policy", "refund", "warranty")


def evaluate_business_checks(
    homepage_html: str,
    all_pages_html: list[str],
    checks_by_id: dict[str, dict[str, Any]],
) -> list[FindingResult]:
    """Evaluate BIZ-01 through BIZ-04."""
    home_soup = BeautifulSoup(homepage_html, "lxml")
    home_text = home_soup.get_text(" ", strip=True)
    combined_html = "\n".join(all_pages_html).lower()
    combined_text = " ".join(BeautifulSoup(h, "lxml").get_text(" ", strip=True) for h in all_pages_html).lower()

    findings: list[FindingResult] = []

    # BIZ-01: Contacts on homepage (phone, email, tel:, mailto:)
    has_tel_link = bool(home_soup.find("a", href=lambda h: h and h.lower().startswith("tel:")))
    has_mail_link = bool(home_soup.find("a", href=lambda h: h and h.lower().startswith("mailto:")))
    has_phone_text = bool(_PHONE_RE.search(home_text))
    has_email_text = bool(_EMAIL_RE.search(home_text))
    has_homepage_contacts = has_tel_link or has_mail_link or has_phone_text or has_email_text

    findings.append(
        FindingResult(
            check_id="BIZ-01",
            category=checks_by_id["BIZ-01"]["category"],
            result=CheckResultStatus.PASS if has_homepage_contacts else CheckResultStatus.FAIL,
            value="наявні" if has_homepage_contacts else "відсутні на головній",
            impact=int(checks_by_id["BIZ-01"]["impact"]),
            effort=int(checks_by_id["BIZ-01"]["effort"]),
            service=checks_by_id["BIZ-01"]["service"],
            evidence=[EvidenceItem(kind="metric", metric="contacts_found" if has_homepage_contacts else "missing")],
        )
    )

    # BIZ-02: Contact form or live chat
    forms = home_soup.find_all("form")
    non_search_forms = [
        f
        for f in forms
        if (f.get("role") or "").lower() != "search"
        and not any("search" in (inp.get("type") or "").lower() or "search" in (inp.get("name") or "").lower() for inp in f.find_all("input"))
        and len(f.find_all(["input", "textarea"])) >= 1
    ]
    has_chat = any(marker in combined_html for marker in _CHAT_MARKERS)
    has_form_or_chat = bool(non_search_forms) or has_chat
    if not has_form_or_chat:
        # Check internal pages for inquiry forms too
        for page_html in all_pages_html[1:]:
            psoup = BeautifulSoup(page_html, "lxml")
            for f in psoup.find_all("form"):
                if (f.get("role") or "").lower() != "search" and len(f.find_all(["input", "textarea"])) >= 2:
                    has_form_or_chat = True
                    break
            if has_form_or_chat:
                break

    findings.append(
        FindingResult(
            check_id="BIZ-02",
            category=checks_by_id["BIZ-02"]["category"],
            result=CheckResultStatus.PASS if has_form_or_chat else CheckResultStatus.FAIL,
            value="наявна" if has_form_or_chat else "відсутні",
            impact=int(checks_by_id["BIZ-02"]["impact"]),
            effort=int(checks_by_id["BIZ-02"]["effort"]),
            service=checks_by_id["BIZ-02"]["service"],
            evidence=[EvidenceItem(kind="metric", metric="form_or_chat_found" if has_form_or_chat else "missing")],
        )
    )

    # BIZ-03: Store-only check (cart, payment, delivery) -> NotApplicable for non-stores
    is_store = sum(1 for m in _ECOMMERCE_MARKERS if m in combined_text or m in combined_html) >= 2
    if not is_store:
        findings.append(
            FindingResult(
                check_id="BIZ-03",
                category=checks_by_id["BIZ-03"]["category"],
                result=CheckResultStatus.NOT_APPLICABLE,
                value="не є інтернет-магазином",
                impact=int(checks_by_id["BIZ-03"]["impact"]),
                effort=int(checks_by_id["BIZ-03"]["effort"]),
                service=checks_by_id["BIZ-03"]["service"],
                evidence=[EvidenceItem(kind="metric", metric="not_ecommerce")],
            )
        )
    else:
        missing_store_parts: list[str] = []
        if not any(m in combined_text or m in combined_html for m in _CART_MARKERS):
            missing_store_parts.append("кошик")
        if not any(m in combined_text for m in _PAYMENT_MARKERS):
            missing_store_parts.append("оплата")
        if not any(m in combined_text for m in _DELIVERY_MARKERS):
            missing_store_parts.append("доставка")

        if len(missing_store_parts) >= 2:
            b3_res = CheckResultStatus.FAIL
        elif len(missing_store_parts) == 1:
            b3_res = CheckResultStatus.WARNING
        else:
            b3_res = CheckResultStatus.PASS
        b3_val = f"відсутні: {', '.join(missing_store_parts)}" if missing_store_parts else "усі наявні"

        findings.append(
            FindingResult(
                check_id="BIZ-03",
                category=checks_by_id["BIZ-03"]["category"],
                result=b3_res,
                value=b3_val,
                impact=int(checks_by_id["BIZ-03"]["impact"]),
                effort=int(checks_by_id["BIZ-03"]["effort"]),
                service=checks_by_id["BIZ-03"]["service"],
                evidence=[EvidenceItem(kind="metric", metric=b3_val)],
            )
        )

    # BIZ-04: Reviews or return policy
    has_reviews = any(m in combined_text for m in _REVIEWS_MARKERS)
    has_return = any(m in combined_text for m in _RETURN_MARKERS)
    if has_reviews and has_return:
        b4_res, b4_val = CheckResultStatus.PASS, "наявні обидва"
    elif not has_reviews and not has_return:
        b4_res, b4_val = CheckResultStatus.FAIL, "відсутні відгуки та політика повернення"
    else:
        missing = "політика повернення" if has_reviews else "відгуки клієнтів"
        b4_res, b4_val = CheckResultStatus.WARNING, f"відсутнє: {missing}"

    findings.append(
        FindingResult(
            check_id="BIZ-04",
            category=checks_by_id["BIZ-04"]["category"],
            result=b4_res,
            value=b4_val,
            impact=int(checks_by_id["BIZ-04"]["impact"]),
            effort=int(checks_by_id["BIZ-04"]["effort"]),
            service=checks_by_id["BIZ-04"]["service"],
            evidence=[EvidenceItem(kind="metric", metric=b4_val)],
        )
    )

    return findings
