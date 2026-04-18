"""
Image Resizer Lambda Function
==============================
Triggered by S3 uploads to the 'images/' prefix.
Downloads the uploaded image, creates thumbnail (128px), medium (512px),
and large (1024px) variants, uploads them to the processed bucket,
and stores metadata in DynamoDB.
"""

import io
import json
import os
import sys
from pathlib import Path

# Add shared utilities to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))

try:
    from utils import (
        Timer,
        download_s3_object,
        get_structured_logger,
        log_event,
        parse_s3_event,
        store_processing_result,
        upload_s3_object,
    )
except ImportError:
    import logging
    logging.warning("Could not import shared utils — running in standalone mode")

# Pillow for image processing
try:
    from PIL import Image
except ImportError:
    # Pillow must be included in the Lambda deployment package or layer
    raise ImportError("Pillow is required. Include it in requirements.txt or use a Lambda Layer.")

logger = get_structured_logger("image-resizer")

# ── Configuration ────────────────────────────────────────────────────────────

RESIZE_TARGETS = {
    "thumbnail": 128,
    "medium": 512,
    "large": 1024,
}

SUPPORTED_FORMATS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff"}

OUTPUT_FORMAT = "JPEG"
OUTPUT_QUALITY = 85
OUTPUT_CONTENT_TYPE = "image/jpeg"


def resize_image(image_bytes: bytes, target_size: int) -> tuple[bytes, tuple[int, int]]:
    """
    Resize an image proportionally so its largest dimension equals target_size.

    Args:
        image_bytes: Raw image bytes
        target_size: Maximum dimension in pixels

    Returns:
        Tuple of (resized image bytes, (width, height))
    """
    img = Image.open(io.BytesIO(image_bytes))

    # Convert to RGB if necessary (handles RGBA, P mode, etc.)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Calculate proportional size
    original_width, original_height = img.size
    ratio = min(target_size / original_width, target_size / original_height)

    # Only shrink, never enlarge
    if ratio >= 1:
        ratio = 1

    new_width = int(original_width * ratio)
    new_height = int(original_height * ratio)

    # Use LANCZOS for high-quality downsampling
    resized = img.resize((new_width, new_height), Image.LANCZOS)

    # Save to bytes
    output = io.BytesIO()
    resized.save(output, format=OUTPUT_FORMAT, quality=OUTPUT_QUALITY, optimize=True)
    output.seek(0)

    return output.getvalue(), (new_width, new_height)


def get_image_info(image_bytes: bytes) -> dict:
    """Extract basic metadata from image bytes."""
    img = Image.open(io.BytesIO(image_bytes))
    return {
        "width": img.size[0],
        "height": img.size[1],
        "format": img.format or "unknown",
        "mode": img.mode,
    }


def lambda_handler(event, context):
    """
    AWS Lambda handler — triggered by S3 event when a file is uploaded to images/ prefix.
    """
    log_event(logger, "INFO", "Image Resizer invoked", event=json.dumps(event))

    records = parse_s3_event(event)
    processed_bucket = os.environ.get("PROCESSED_BUCKET", "")

    results = []
    for record in records:
        bucket = record["bucket"]
        key = record["key"]
        file_size = record["size"]

        # Validate file extension
        file_ext = Path(key).suffix.lower()
        if file_ext not in SUPPORTED_FORMATS:
            log_event(logger, "WARN", f"Unsupported format: {file_ext}", key=key)
            store_processing_result(
                processing_type="image_resize",
                source_file=key,
                status="error",
                result_data={"error": f"Unsupported format: {file_ext}"},
            )
            results.append({"file": key, "status": "error", "error": f"Unsupported format: {file_ext}"})
            continue

        log_event(logger, "INFO", f"Processing image", bucket=bucket, key=key, size=file_size)

        try:
            with Timer() as timer:
                # Download original image
                image_bytes = download_s3_object(bucket, key)
                original_info = get_image_info(image_bytes)

                # Generate filename base
                filename = Path(key).stem
                folder = Path(key).parent.as_posix()

                # Resize to each target size
                resize_results = {}
                for size_name, target_px in RESIZE_TARGETS.items():
                    resized_bytes, dimensions = resize_image(image_bytes, target_px)

                    # Upload resized image to processed bucket
                    output_key = f"resized/{filename}_{size_name}.jpg"
                    upload_s3_object(
                        bucket=processed_bucket,
                        key=output_key,
                        body=resized_bytes,
                        content_type=OUTPUT_CONTENT_TYPE,
                    )

                    resize_results[size_name] = {
                        "width": dimensions[0],
                        "height": dimensions[1],
                        "sizeBytes": len(resized_bytes),
                        "outputKey": output_key,
                    }

                    log_event(
                        logger, "INFO", f"Created {size_name} variant",
                        output_key=output_key,
                        width=dimensions[0],
                        height=dimensions[1],
                    )

            # Calculate compression stats
            total_resized = sum(r["sizeBytes"] for r in resize_results.values())
            compression_ratio = (1 - total_resized / len(image_bytes)) * 100 if len(image_bytes) > 0 else 0

            result_data = {
                "original": {
                    "fileName": Path(key).name,
                    "width": original_info["width"],
                    "height": original_info["height"],
                    "format": original_info["format"],
                    "sizeBytes": len(image_bytes),
                },
                "resized": resize_results,
                "compressionRatio": round(compression_ratio, 2),
                "outputBucket": processed_bucket,
            }

            # Store results in DynamoDB
            result_id = store_processing_result(
                processing_type="image_resize",
                source_file=key,
                status="success",
                result_data=result_data,
                processing_time_ms=timer.elapsed_ms,
            )

            log_event(
                logger, "INFO", "Image resize completed",
                result_id=result_id,
                original_size=len(image_bytes),
                variants_created=len(resize_results),
                processing_time_ms=round(timer.elapsed_ms, 2),
            )

            results.append({"file": key, "result_id": result_id, "status": "success"})

        except Exception as e:
            log_event(logger, "ERROR", f"Failed to process image", error=str(e), key=key)
            store_processing_result(
                processing_type="image_resize",
                source_file=key,
                status="error",
                result_data={"error": str(e)},
            )
            results.append({"file": key, "status": "error", "error": str(e)})

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Image resizing complete", "results": results}),
    }
