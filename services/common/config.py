from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class ServiceSettings(BaseSettings):
    """Configuration loaded from environment variables for LeadLens Python services."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "leadlens-python"
    internal_service_token: str = "dev_internal_service_token_change_me"
    redis_url: str = "redis://localhost:6379/1"
    minio_endpoint: str = "http://localhost:9000"
    minio_access_key: str = "leadlens_minio"
    minio_secret_key: str = "leadlens_minio_secret_change_me"
    minio_bucket: str = "leadlens-artifacts"
    profiles_dir: Path = Path("/app/profiles")
    google_places_api_key: str = ""
    crawler_user_agent: str = "LeadLensBot/1.0 (+https://leadlens.local/bot; contact=bot@leadlens.local)"
    crawler_rate_limit_rps: float = 1.0
    audit_timeout_seconds: int = 120


settings = ServiceSettings()
