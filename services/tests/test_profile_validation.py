from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))

from common.profile_loader import load_and_validate_profile  # noqa: E402


def test_web_studio_v1_profile_is_valid() -> None:
    profile_path = ROOT / "profiles" / "web_studio.v1.yaml"
    schema_path = ROOT / "profiles" / "schema" / "service-profile.schema.json"

    profile = load_and_validate_profile(profile_path, schema_path)

    assert profile["key"] == "web_studio"
    assert profile["version"] == 1
    assert len(profile["categories"]) == 8
    assert sum(c["weight"] for c in profile["categories"]) == 100
    assert len(profile["checks"]) == 31
    assert len(profile["email_templates"]) == 8
