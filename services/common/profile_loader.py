import json
from pathlib import Path
from typing import Any

import jsonschema
import yaml


class ProfileValidationError(ValueError):
    """Raised when a service profile YAML fails JSON Schema or semantic validation."""


def load_and_validate_profile(profile_path: Path, schema_path: Path) -> dict[str, Any]:
    """Load a YAML service profile and validate it against JSON Schema and domain invariants."""
    with schema_path.open("r", encoding="utf-8") as sf:
        schema = json.load(sf)

    with profile_path.open("r", encoding="utf-8") as pf:
        profile = yaml.safe_load(pf)

    try:
        jsonschema.validate(instance=profile, schema=schema)
    except jsonschema.ValidationError as exc:
        raise ProfileValidationError(f"Schema validation failed for {profile_path.name}: {exc.message}") from exc

    categories = profile.get("categories", [])
    total_weight = sum(float(c["weight"]) for c in categories)
    if abs(total_weight - 100.0) > 1e-6:
        raise ProfileValidationError(
            f"Category weights in {profile_path.name} must sum to 100, got {total_weight}."
        )

    category_keys = {c["key"] for c in categories}
    seen_check_ids: set[str] = set()
    for check in profile.get("checks", []):
        cid = check["id"]
        if cid in seen_check_ids:
            raise ProfileValidationError(f"Duplicate check id '{cid}' in {profile_path.name}.")
        seen_check_ids.add(cid)
        if check["category"] not in category_keys:
            raise ProfileValidationError(
                f"Check '{cid}' references unknown category '{check['category']}'."
            )

    return profile
