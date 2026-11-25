import json
import logging
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Structured JSON log formatter including optional job_id and correlation_id."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for attr in ("service", "job_id", "correlation_id", "domain"):
            val = getattr(record, attr, None)
            if val is not None:
                payload[attr] = val
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(service_name: str) -> logging.Logger:
    """Configure root logging with JSON formatter and return a service logger."""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    return logging.LoggerAdapter(logging.getLogger(service_name), {"service": service_name})
