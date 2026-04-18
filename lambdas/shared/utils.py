"""
Shared Utilities for Serverless Pipeline Lambda Functions
=========================================================
Common helpers for S3 operations, DynamoDB writes, and structured logging.
"""

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

# ── Structured Logger ────────────────────────────────────────────────────────

logger = logging.getLogger("serverless-pipeline")
logger.setLevel(logging.INFO)


def get_structured_logger(function_name: str) -> logging.Logger:
    """Return a logger configured for structured JSON output."""
    log = logging.getLogger(function_name)
    log.setLevel(logging.INFO)
    return log


def log_event(log: logging.Logger, level: str, message: str, **kwargs):
    """Emit a structured log entry with consistent fields."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "function": os.environ.get("FUNCTION_NAME", "unknown"),
        "environment": os.environ.get("ENVIRONMENT", "unknown"),
        "level": level,
        "message": message,
        **kwargs,
    }
    getattr(log, level.lower(), log.info)(json.dumps(entry))


# ── S3 Helpers ───────────────────────────────────────────────────────────────

def get_s3_client():
    """Return a reusable S3 client."""
    return boto3.client("s3")


def download_s3_object(bucket: str, key: str) -> bytes:
    """Download an object from S3 and return its content as bytes."""
    s3 = get_s3_client()
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        return response["Body"].read()
    except ClientError as e:
        logger.error(f"Failed to download s3://{bucket}/{key}: {e}")
        raise


def upload_s3_object(bucket: str, key: str, body: bytes, content_type: str = None):
    """Upload content to S3."""
    s3 = get_s3_client()
    params = {"Bucket": bucket, "Key": key, "Body": body}
    if content_type:
        params["ContentType"] = content_type
    try:
        s3.put_object(**params)
        logger.info(f"Uploaded to s3://{bucket}/{key}")
    except ClientError as e:
        logger.error(f"Failed to upload to s3://{bucket}/{key}: {e}")
        raise


def get_s3_object_metadata(bucket: str, key: str) -> dict:
    """Get metadata for an S3 object."""
    s3 = get_s3_client()
    try:
        response = s3.head_object(Bucket=bucket, Key=key)
        return {
            "content_length": response["ContentLength"],
            "content_type": response.get("ContentType", "unknown"),
            "last_modified": response["LastModified"].isoformat(),
        }
    except ClientError as e:
        logger.error(f"Failed to get metadata for s3://{bucket}/{key}: {e}")
        raise


# ── DynamoDB Helpers ─────────────────────────────────────────────────────────

def get_dynamodb_table():
    """Return a DynamoDB Table resource."""
    dynamodb = boto3.resource("dynamodb")
    table_name = os.environ.get("TABLE_NAME", "serverless-pipeline-results-dev")
    return dynamodb.Table(table_name)


def _convert_floats(obj):
    """Convert float values to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _convert_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_floats(i) for i in obj]
    return obj


def store_processing_result(
    processing_type: str,
    source_file: str,
    status: str,
    result_data: dict,
    processing_time_ms: float = 0,
):
    """
    Store a processing result in DynamoDB.

    Args:
        processing_type: One of 'log_analysis', 'image_resize', 'data_validation'
        source_file: S3 key of the source file
        status: One of 'success', 'error', 'warning'
        result_data: Dictionary containing processing-specific results
        processing_time_ms: Time taken to process in milliseconds
    """
    table = get_dynamodb_table()
    now = datetime.now(timezone.utc)

    item = {
        "id": str(uuid.uuid4()),
        "timestamp": now.isoformat(),
        "processingType": processing_type,
        "status": status,
        "sourceFile": source_file,
        "resultData": _convert_floats(result_data),
        "processingTimeMs": Decimal(str(processing_time_ms)),
        "environment": os.environ.get("ENVIRONMENT", "unknown"),
        # TTL: auto-delete after 30 days
        "expiresAt": int(now.timestamp()) + (30 * 24 * 60 * 60),
    }

    try:
        table.put_item(Item=item)
        logger.info(f"Stored result: {item['id']} ({processing_type}/{status})")
        return item["id"]
    except ClientError as e:
        logger.error(f"Failed to store result: {e}")
        raise


# ── Event Parsing ────────────────────────────────────────────────────────────

def parse_s3_event(event: dict) -> list[dict]:
    """
    Parse an S3 event and return a list of file info dicts.

    Returns:
        List of dicts with keys: bucket, key, size, event_time
    """
    records = []
    for record in event.get("Records", []):
        s3_info = record.get("s3", {})
        records.append(
            {
                "bucket": s3_info.get("bucket", {}).get("name", ""),
                "key": s3_info.get("object", {}).get("key", ""),
                "size": s3_info.get("object", {}).get("size", 0),
                "event_time": record.get("eventTime", ""),
            }
        )
    return records


# ── Timer Context Manager ───────────────────────────────────────────────────

class Timer:
    """Simple context manager to measure execution time in milliseconds."""

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, *args):
        self.elapsed_ms = (time.perf_counter() - self.start) * 1000
