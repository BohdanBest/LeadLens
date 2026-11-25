from typing import Protocol

import boto3
from botocore.client import Config

from common.config import settings


class ArtifactStorage(Protocol):
    def upload_bytes(self, key: str, data: bytes, content_type: str) -> str: ...
    def download_bytes(self, key: str) -> bytes: ...


class S3ArtifactStorage:
    """S3-compatible artifact storage backed by MinIO."""

    def __init__(
        self,
        endpoint: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        bucket: str | None = None,
    ) -> None:
        self._bucket = bucket or settings.minio_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint or settings.minio_endpoint,
            aws_access_key_id=access_key or settings.minio_access_key,
            aws_secret_access_key=secret_key or settings.minio_secret_key,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> str:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return key

    def download_bytes(self, key: str) -> bytes:
        resp = self._client.get_object(Bucket=self._bucket, Key=key)
        return resp["Body"].read()


class InMemoryArtifactStorage:
    """In-memory artifact store for unit and integration tests."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> str:
        self.objects[key] = (data, content_type)
        return key

    def download_bytes(self, key: str) -> bytes:
        return self.objects[key][0]
