import asyncio
import csv
import io
import re
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx

from common.config import settings

DEFAULT_EXCLUDED_DOMAINS: frozenset[str] = frozenset(
    {
        # Social networks & messengers
        "facebook.com",
        "fb.com",
        "instagram.com",
        "linkedin.com",
        "t.me",
        "telegram.me",
        "youtube.com",
        "youtu.be",
        "tiktok.com",
        "twitter.com",
        "x.com",
        "vk.com",
        "ok.ru",
        "pinterest.com",
        # Marketplaces, directories & aggregators
        "prom.ua",
        "rozetka.com.ua",
        "olx.ua",
        "hotline.ua",
        "epicentrk.ua",
        "all.biz",
        "2gis.ua",
        "list.in.ua",
        "otzyvua.net",
        "top20.ua",
        "work.ua",
        "rabota.ua",
        "google.com",
        "maps.google.com",
        "yelp.com",
        "yellowpages.com",
        # Subdomain site builders without own domain
        "wixsite.com",
        "blogspot.com",
        "wordpress.com",
        "tilda.ws",
        "weblium.site",
        "taplink.cc",
        "linktr.ee",
        "sites.google.com",
        "uaprom.net",
        "prom.st",
    }
)

MAX_CSV_ROWS = 500
_SCHEME_RE = re.compile(r"^https?://", re.IGNORECASE)

_OSM_NICHE_TAGS: dict[str, list[tuple[str, str]]] = {
    "стомат": [("amenity", "dentist"), ("healthcare", "dentist")],
    "dentist": [("amenity", "dentist"), ("healthcare", "dentist")],
    "клінік": [("amenity", "clinic"), ("healthcare", "clinic"), ("healthcare", "doctor")],
    "clinic": [("amenity", "clinic"), ("healthcare", "clinic")],
    "лікар": [("amenity", "doctors"), ("healthcare", "doctor")],
    "ветеринар": [("amenity", "veterinary")],
    "vet": [("amenity", "veterinary")],
    "аптек": [("amenity", "pharmacy")],
    "кав'яр": [("amenity", "cafe")],
    "кафе": [("amenity", "cafe")],
    "cafe": [("amenity", "cafe")],
    "ресторан": [("amenity", "restaurant")],
    "restaurant": [("amenity", "restaurant")],
    "піц": [("amenity", "restaurant"), ("amenity", "fast_food")],
    "бар": [("amenity", "bar"), ("amenity", "pub")],
    "салон": [("shop", "beauty"), ("shop", "hairdresser")],
    "крас": [("shop", "beauty"), ("shop", "hairdresser")],
    "перукар": [("shop", "hairdresser")],
    "barber": [("shop", "hairdresser")],
    "beauty": [("shop", "beauty")],
    "сто": [("shop", "car_repair"), ("craft", "car_repair")],
    "автосервіс": [("shop", "car_repair"), ("craft", "car_repair")],
    "auto": [("shop", "car_repair"), ("shop", "car")],
    "юрист": [("office", "lawyer")],
    "адвокат": [("office", "lawyer")],
    "lawyer": [("office", "lawyer")],
    "нотаріус": [("office", "notary")],
    "нерухом": [("office", "estate_agent")],
    "ріелтор": [("office", "estate_agent")],
    "мебл": [("shop", "furniture")],
    "furniture": [("shop", "furniture")],
    "квіт": [("shop", "florist")],
    "florist": [("shop", "florist")],
    "фітнес": [("leisure", "fitness_centre"), ("leisure", "sports_centre")],
    "спорт": [("leisure", "fitness_centre"), ("leisure", "sports_centre")],
    "fitness": [("leisure", "fitness_centre")],
    "готел": [("tourism", "hotel"), ("tourism", "hostel")],
    "hotel": [("tourism", "hotel")],
    "тур": [("shop", "travel_agency"), ("office", "travel_agent")],
    "будів": [("office", "construction_company"), ("craft", "builder")],
    "ремонт": [("craft", "handyman"), ("shop", "doityourself")],
    "магазин": [("shop", "")],
    "shop": [("shop", "")],
    "it": [("office", "it")],
    "веб": [("office", "it"), ("office", "company")],
}


@dataclass(frozen=True)
class DiscoveredCandidate:
    url: str
    domain: str
    business_name: str | None
    source: str


def ensure_http_scheme(raw_url: str) -> str:
    cleaned = raw_url.strip()
    if not cleaned:
        return ""
    if not _SCHEME_RE.match(cleaned):
        return f"https://{cleaned}"
    return cleaned


def normalize_domain(raw_url: str) -> str | None:
    """Normalize URL to lowercase root host without www. prefix or port."""
    candidate = ensure_http_scheme(raw_url)
    if not candidate:
        return None
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return None

    host = (parsed.hostname or "").strip().lower().rstrip(".")
    if not host or "." not in host:
        return None
    if host.startswith("www."):
        host = host[4:]
    return host or None


def is_excluded_domain(domain: str, extra_excluded: set[str] | None = None) -> bool:
    """Return True if domain matches or is a subdomain of an excluded platform."""
    pool = DEFAULT_EXCLUDED_DOMAINS if not extra_excluded else DEFAULT_EXCLUDED_DOMAINS | extra_excluded
    for blocked in pool:
        if domain == blocked or domain.endswith(f".{blocked}"):
            return True
    return False


def matches_exclusion_keywords(
    keywords: list[str],
    *texts: str | None,
) -> str | None:
    """Return matched exclusion keyword (case-insensitive) if any text contains it."""
    normalized_keywords = [k.strip().lower() for k in keywords if k and k.strip()]
    if not normalized_keywords:
        return None
    combined = " ".join(t.lower() for t in texts if t)
    for kw in normalized_keywords:
        if kw in combined:
            return kw
    return None


class SiteDiscoverySource(Protocol):
    async def discover(self, limit: int) -> list[DiscoveredCandidate]: ...


class ManualUrlSource:
    def __init__(self, urls: list[str]) -> None:
        self._urls = urls

    async def discover(self, limit: int) -> list[DiscoveredCandidate]:
        results: list[DiscoveredCandidate] = []
        for raw in self._urls:
            if len(results) >= limit:
                break
            url = ensure_http_scheme(raw)
            domain = normalize_domain(url)
            if not domain:
                continue
            results.append(
                DiscoveredCandidate(
                    url=url,
                    domain=domain,
                    business_name=None,
                    source="ManualList",
                )
            )
        return results


class CsvImportSource:
    def __init__(self, csv_content: str) -> None:
        self._csv_content = csv_content

    async def discover(self, limit: int) -> list[DiscoveredCandidate]:
        reader = csv.DictReader(io.StringIO(self._csv_content.strip()))
        if not reader.fieldnames:
            raise ValueError("CSV file is empty or missing headers.")

        url_col = next(
            (name for name in reader.fieldnames if name and name.strip().lower() == "url"),
            None,
        )
        if url_col is None:
            raise ValueError("CSV must contain a 'url' column.")

        name_col = next(
            (name for name in reader.fieldnames if name and name.strip().lower() in ("name", "business", "title")),
            None,
        )

        results: list[DiscoveredCandidate] = []
        for row_idx, row in enumerate(reader, start=1):
            if row_idx > MAX_CSV_ROWS:
                raise ValueError(f"CSV exceeds maximum allowed {MAX_CSV_ROWS} rows.")
            if len(results) >= limit:
                break
            raw_url = (row.get(url_col) or "").strip()
            if not raw_url:
                continue
            url = ensure_http_scheme(raw_url)
            domain = normalize_domain(url)
            if not domain:
                continue
            biz_name = (row.get(name_col) or "").strip() if name_col else None
            results.append(
                DiscoveredCandidate(
                    url=url,
                    domain=domain,
                    business_name=biz_name or None,
                    source="CsvImport",
                )
            )
        return results


class GooglePlacesSource:
    """Discovers businesses via Google Places API v1 (Text Search)."""

    ENDPOINT = "https://places.googleapis.com/v1/places:searchText"

    def __init__(
        self,
        niche: str,
        region: str | None,
        language: str = "uk",
        api_key: str | None = None,
    ) -> None:
        self._niche = niche
        self._region = region
        self._language = language
        self._api_key = api_key if api_key is not None else settings.google_places_api_key

    async def discover(self, limit: int) -> list[DiscoveredCandidate]:
        if not self._api_key:
            raise RuntimeError(
                "GOOGLE_PLACES_API_KEY is not configured. Use CSV import or manual URL list, or set the key in .env."
            )

        query = f"{self._niche} {self._region}".strip() if self._region else self._niche
        results: list[DiscoveredCandidate] = []
        page_token: str | None = None

        async with httpx.AsyncClient(timeout=15.0) as client:
            # Places Text Search returns up to 20 results per page; iterate until limit or 3 pages
            for _ in range(5):
                if len(results) >= limit:
                    break
                payload: dict[str, object] = {
                    "textQuery": query,
                    "languageCode": self._language,
                    "pageSize": min(20, max(1, limit - len(results))),
                }
                if page_token:
                    payload["pageToken"] = page_token

                resp = await client.post(
                    self.ENDPOINT,
                    headers={
                        "X-Goog-Api-Key": self._api_key,
                        "X-Goog-FieldMask": "places.displayName,places.websiteUri,nextPageToken",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

                for place in data.get("places", []):
                    website = (place.get("websiteUri") or "").strip()
                    if not website:
                        continue
                    url = ensure_http_scheme(website)
                    domain = normalize_domain(url)
                    if not domain:
                        continue
                    display_name = (place.get("displayName") or {}).get("text")
                    results.append(
                        DiscoveredCandidate(
                            url=url,
                            domain=domain,
                            business_name=display_name,
                            source="GooglePlaces",
                        )
                    )
                    if len(results) >= limit:
                        break

                page_token = data.get("nextPageToken")
                if not page_token:
                    break

        return results


class OpenStreetMapOverpassSource:
    """
    Free business website discovery via OpenStreetMap Nominatim (geocoding) + Overpass API.
    Requires no API key or billing account.
    """

    NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
    OVERPASS_URL = "https://overpass-api.de/api/interpreter"

    def __init__(
        self,
        niche: str,
        region: str | None,
        language: str = "uk",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._niche = niche.strip()
        self._region = (region or "").strip() or None
        self._language = language
        self._transport = transport

    @staticmethod
    def _escape_overpass_regex(raw: str) -> str:
        return re.sub(r'([\\"\[\]\(\)\.\*\+\?\^\$\|\{\}])', r"\\\1", raw)

    @staticmethod
    def _match_tags(niche: str) -> list[tuple[str, str]]:
        low = niche.lower()
        tags: list[tuple[str, str]] = []
        for keyword, mapped in _OSM_NICHE_TAGS.items():
            if keyword in low:
                for pair in mapped:
                    if pair not in tags:
                        tags.append(pair)
        return tags

    async def _resolve_bbox(self, client: httpx.AsyncClient) -> tuple[float, float, float, float]:
        if not self._region:
            # Default bounding box covering Ukraine if region omitted
            return (44.3, 22.1, 52.4, 40.2)

        resp = await client.get(
            self.NOMINATIM_URL,
            params={
                "q": self._region,
                "format": "jsonv2",
                "limit": 1,
                "accept-language": self._language,
            },
            headers={"User-Agent": settings.crawler_user_agent},
        )
        resp.raise_for_status()
        items = resp.json()
        if not items or "boundingbox" not in items[0]:
            raise RuntimeError(f"Region '{self._region}' not found in OpenStreetMap Nominatim.")

        # Nominatim returns [south, north, west, east]
        south, north, west, east = (float(x) for x in items[0]["boundingbox"])
        # Clamp oversized bounding boxes so Overpass stays fast
        if north - south > 1.2:
            mid_lat = (south + north) / 2.0
            south, north = mid_lat - 0.35, mid_lat + 0.35
        if east - west > 1.5:
            mid_lon = (west + east) / 2.0
            west, east = mid_lon - 0.45, mid_lon + 0.45
        return (south, west, north, east)

    def _build_overpass_query(self, bbox: tuple[float, float, float, float], limit: int) -> str:
        s, w, n, e = bbox
        bbox_str = f"{s:.4f},{w:.4f},{n:.4f},{e:.4f}"
        matched_tags = self._match_tags(self._niche)

        selectors: list[str] = []
        for k, v in matched_tags[:4]:
            tag_filter = f'["{k}"="{v}"]' if v else f'["{k}"]'
            selectors.append(f'  nwr{tag_filter}["website"]({bbox_str});')
            selectors.append(f'  nwr{tag_filter}["contact:website"]({bbox_str});')

        # Also allow name-based match when niche words are specific
        words = [w_tok for w_tok in re.split(r"\s+", self._niche) if len(w_tok) >= 3]
        if not matched_tags or len(words) >= 1:
            pattern = "|".join(self._escape_overpass_regex(tok) for tok in words[:3])
            if pattern:
                selectors.append(f'  nwr["name"~"{pattern}",i]["website"]({bbox_str});')
                selectors.append(f'  nwr["name"~"{pattern}",i]["contact:website"]({bbox_str});')

        query_limit = min(max(limit * 2, 30), 200)
        body = "\n".join(selectors)
        return f"[out:json][timeout:15];\n(\n{body}\n);\nout center tags {query_limit};"

    def _collect_candidate(
        self,
        raw_site: str,
        biz_name: str | None,
        results: list[DiscoveredCandidate],
        seen_domains: set[str],
    ) -> None:
        raw = raw_site.strip()
        if not raw:
            return
        url = ensure_http_scheme(raw)
        domain = normalize_domain(url)
        if not domain or domain in seen_domains or is_excluded_domain(domain):
            return
        seen_domains.add(domain)
        results.append(
            DiscoveredCandidate(
                url=url,
                domain=domain,
                business_name=(biz_name or "").strip() or None,
                source="OpenStreetMap",
            )
        )

    async def _discover_via_nominatim(
        self,
        client: httpx.AsyncClient,
        bbox: tuple[float, float, float, float],
        limit: int,
        results: list[DiscoveredCandidate],
        seen_domains: set[str],
    ) -> None:
        s, w, n, e = bbox
        viewbox = f"{w:.4f},{n:.4f},{e:.4f},{s:.4f}"
        matched_tags = self._match_tags(self._niche)

        queries: list[str] = []
        for k, v in matched_tags[:3]:
            queries.append(f"[{k}={v}]" if v else f"[{k}]")
        if not queries and self._niche:
            queries.append(f"{self._niche} {self._region}".strip() if self._region else self._niche)

        for q in queries:
            if len(results) >= limit:
                break
            excluded_ids: list[str] = []
            for _page in range(2):
                if self._transport is None:
                    await asyncio.sleep(1.0)
                params: dict[str, Any] = {
                    "q": q,
                    "viewbox": viewbox,
                    "bounded": 1,
                    "format": "jsonv2",
                    "extratags": 1,
                    "limit": 40,
                    "accept-language": self._language,
                }
                if excluded_ids:
                    params["exclude_place_ids"] = ",".join(excluded_ids)
                resp = await client.get(
                    self.NOMINATIM_URL,
                    params=params,
                    headers={"User-Agent": settings.crawler_user_agent},
                )
                resp.raise_for_status()
                items = resp.json()
                if not isinstance(items, list) or not items:
                    break

                page_ids: list[str] = []
                for item in items:
                    if item.get("place_id") is not None:
                        page_ids.append(str(item["place_id"]))
                    ext = item.get("extratags") or {}
                    raw_site = ext.get("website") or ext.get("contact:website") or ""
                    if raw_site:
                        self._collect_candidate(raw_site, item.get("name"), results, seen_domains)
                        if len(results) >= limit:
                            break

                if len(results) >= limit or len(items) < 40 or not page_ids:
                    break
                excluded_ids.extend(page_ids)

    async def discover(self, limit: int) -> list[DiscoveredCandidate]:
        results: list[DiscoveredCandidate] = []
        seen_domains: set[str] = set()

        async with httpx.AsyncClient(timeout=15.0, transport=self._transport) as client:
            bbox = await self._resolve_bbox(client)

            try:
                await self._discover_via_nominatim(client, bbox, limit, results, seen_domains)
            except httpx.HTTPError:
                pass

            if len(results) < limit:
                ql = self._build_overpass_query(bbox, limit)
                try:
                    resp = await client.post(
                        self.OVERPASS_URL,
                        data={"data": ql},
                        headers={"User-Agent": settings.crawler_user_agent},
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    for el in data.get("elements", []):
                        tags = el.get("tags") or {}
                        raw_site = tags.get("website") or tags.get("contact:website") or ""
                        if raw_site:
                            self._collect_candidate(raw_site, tags.get("name"), results, seen_domains)
                            if len(results) >= limit:
                                break
                except (httpx.HTTPError, ValueError):
                    if not results:
                        raise

        return results[:limit]

