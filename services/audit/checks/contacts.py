import re
from dataclasses import dataclass
from urllib.parse import urljoin

from bs4 import BeautifulSoup

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_PHONE_RE = re.compile(r"(?:\+?38[\s\-]?)?(?:\(0\d{2}\)|0\d{2})[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\+\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{2,4}")
_IGNORED_EMAIL_DOMAINS = {"example.com", "sentry.io", "wixpress.com"}


@dataclass(frozen=True)
class ExtractedContact:
    kind: str  # Email | Phone | ContactForm
    value: str
    source_page: str


def extract_public_contacts(pages: list[tuple[str, str]]) -> list[ExtractedContact]:
    """
    Extract public work contacts (email, phone, contact form URL) with source_page attribution (M8).
    """
    seen: set[tuple[str, str]] = set()
    contacts: list[ExtractedContact] = []

    for page_url, html in pages:
        soup = BeautifulSoup(html, "lxml")

        # 1. Emails from mailto: links and visible text
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if href.lower().startswith("mailto:"):
                email = href[7:].split("?")[0].strip().lower()
                if _is_valid_email(email) and ("Email", email) not in seen:
                    seen.add(("Email", email))
                    contacts.append(ExtractedContact("Email", email, page_url))

            elif href.lower().startswith("tel:"):
                phone = _normalize_phone(href[4:])
                if phone and ("Phone", phone) not in seen:
                    seen.add(("Phone", phone))
                    contacts.append(ExtractedContact("Phone", phone, page_url))

        visible_text = soup.get_text(" ", strip=True)
        for match in _EMAIL_RE.findall(visible_text):
            email = match.strip().lower()
            if _is_valid_email(email) and ("Email", email) not in seen:
                seen.add(("Email", email))
                contacts.append(ExtractedContact("Email", email, page_url))

        for match in _PHONE_RE.findall(visible_text):
            phone = _normalize_phone(match)
            if phone and ("Phone", phone) not in seen:
                seen.add(("Phone", phone))
                contacts.append(ExtractedContact("Phone", phone, page_url))

        # 2. Inquiry forms
        for form in soup.find_all("form"):
            if (form.get("role") or "").lower() == "search":
                continue
            inputs = form.find_all(["input", "textarea"])
            if not inputs:
                continue
            is_search = any(
                "search" in (inp.get("type") or "").lower() or "search" in (inp.get("name") or "").lower()
                for inp in inputs
            )
            if is_search:
                continue

            action = (form.get("action") or "").strip()
            form_url = urljoin(page_url, action) if action and not action.startswith("#") else page_url
            if ("ContactForm", form_url) not in seen:
                seen.add(("ContactForm", form_url))
                contacts.append(ExtractedContact("ContactForm", form_url, page_url))

    return contacts


def _is_valid_email(email: str) -> bool:
    if "@" not in email or len(email) > 254:
        return False
    domain = email.split("@", 1)[1]
    if domain in _IGNORED_EMAIL_DOMAINS:
        return False
    if domain.endswith((".png", ".jpg", ".jpeg", ".webp", ".svg")):
        return False
    return True


def _normalize_phone(raw: str) -> str | None:
    digits = re.sub(r"[^\d+]", "", raw.strip())
    digit_count = sum(1 for ch in digits if ch.isdigit())
    if digit_count < 9 or digit_count > 15:
        return None
    return digits
