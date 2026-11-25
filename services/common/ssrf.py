import ipaddress
import socket
from collections.abc import Callable
from typing import Iterable
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = {"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"}
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".arpa")

ResolverFn = Callable[[str], Iterable[str]]


def default_dns_resolver(hostname: str) -> list[str]:
    """Resolve hostname to unique IPv4/IPv6 strings using system DNS."""
    infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    ips: list[str] = []
    for info in infos:
        ip = info[4][0]
        if ip not in ips:
            ips.append(ip)
    return ips


def is_ip_public(ip_str: str) -> bool:
    """Return True only if ip_str is a globally routable public IP address."""
    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except ValueError:
        return False

    if (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_multicast
        or ip_obj.is_reserved
        or ip_obj.is_unspecified
    ):
        return False

    # Check IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
    if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped is not None:
        return is_ip_public(str(ip_obj.ipv4_mapped))

    return True


def validate_url_safe(
    url: str,
    resolver: ResolverFn | None = None,
) -> tuple[bool, str | None, list[str]]:
    """
    Validate that URL uses http/https and resolves exclusively to public IP addresses.
    Returns (is_safe, error_reason, resolved_ips).
    """
    resolve = resolver or default_dns_resolver
    try:
        parsed = urlparse(url)
    except ValueError:
        return False, "invalid_url", []

    if parsed.scheme.lower() not in ("http", "https"):
        return False, "unsupported_scheme", []

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if not hostname:
        return False, "missing_hostname", []

    if hostname in BLOCKED_HOSTNAMES or any(hostname.endswith(sfx) for sfx in BLOCKED_SUFFIXES):
        return False, "ssrf_blocked_hostname", []

    # Direct IP literal check
    try:
        ipaddress.ip_address(hostname)
        if not is_ip_public(hostname):
            return False, "ssrf_blocked_ip", [hostname]
        return True, None, [hostname]
    except ValueError:
        pass

    try:
        resolved = list(resolve(hostname))
    except OSError:
        return False, "dns_error", []

    if not resolved:
        return False, "dns_error", []

    for ip in resolved:
        if not is_ip_public(ip):
            return False, "ssrf_blocked_ip", resolved

    return True, None, resolved
