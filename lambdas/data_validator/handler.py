"""
Data Validator Lambda Function
===============================
Triggered by S3 uploads to the 'data/' prefix.
Validates CSV and JSON files against predefined schema rules,
generates a report with pass/fail status per record, and stores
validation results in DynamoDB.
"""

import csv
import io
import json
import os
import re
import sys
from datetime import datetime

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
    )
    logger = get_structured_logger("data-validator")
except ImportError:
    import logging
    logging.warning("Could not import shared utils — running in standalone mode")
    logger = logging.getLogger("data-validator")

# ── Validation Rules ─────────────────────────────────────────────────────────

# Default schema rules for CSV files
CSV_SCHEMA = {
    "required_columns": ["id", "name", "email"],
    "rules": {
        "id": {
            "type": "integer",
            "min": 1,
            "description": "Unique identifier, must be a positive integer",
        },
        "name": {
            "type": "string",
            "min_length": 1,
            "max_length": 100,
            "description": "Name field, 1-100 characters",
        },
        "email": {
            "type": "email",
            "description": "Valid email address",
        },
        "age": {
            "type": "integer",
            "min": 0,
            "max": 150,
            "required": False,
            "description": "Age, 0-150",
        },
        "status": {
            "type": "enum",
            "values": ["active", "inactive", "pending"],
            "required": False,
            "description": "Status must be one of: active, inactive, pending",
        },
    },
}

# Default schema rules for JSON files
JSON_SCHEMA = {
    "required_fields": ["id", "name", "email"],
    "rules": {
        "id": {"type": "integer", "min": 1},
        "name": {"type": "string", "min_length": 1, "max_length": 100},
        "email": {"type": "email"},
        "age": {"type": "integer", "min": 0, "max": 150, "required": False},
        "status": {"type": "enum", "values": ["active", "inactive", "pending"], "required": False},
    },
}

# Email regex pattern
EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def validate_field(value, rule: dict) -> list[str]:
    """
    Validate a single field value against its rule.

    Returns:
        List of error messages (empty if valid).
    """
    errors = []
    field_type = rule.get("type", "string")

    # Handle empty/None values
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if rule.get("required", True):
            errors.append("Value is required but empty")
        return errors

    value_str = str(value).strip()

    if field_type == "integer":
        try:
            int_val = int(float(value_str))
            if "min" in rule and int_val < rule["min"]:
                errors.append(f"Value {int_val} is below minimum {rule['min']}")
            if "max" in rule and int_val > rule["max"]:
                errors.append(f"Value {int_val} exceeds maximum {rule['max']}")
        except (ValueError, TypeError):
            errors.append(f"Expected integer, got '{value_str}'")

    elif field_type == "string":
        if "min_length" in rule and len(value_str) < rule["min_length"]:
            errors.append(f"String length {len(value_str)} below minimum {rule['min_length']}")
        if "max_length" in rule and len(value_str) > rule["max_length"]:
            errors.append(f"String length {len(value_str)} exceeds maximum {rule['max_length']}")

    elif field_type == "email":
        if not EMAIL_PATTERN.match(value_str):
            errors.append(f"Invalid email format: '{value_str}'")

    elif field_type == "enum":
        allowed = rule.get("values", [])
        if value_str.lower() not in [v.lower() for v in allowed]:
            errors.append(f"Value '{value_str}' not in allowed values: {allowed}")

    elif field_type == "date":
        try:
            datetime.strptime(value_str, rule.get("format", "%Y-%m-%d"))
        except ValueError:
            errors.append(f"Invalid date format: '{value_str}'")

    return errors


def validate_csv_content(content: str) -> dict:
    """
    Validate CSV content against the default schema.

    Returns:
        Validation report dictionary.
    """
    reader = csv.DictReader(io.StringIO(content))
    columns = reader.fieldnames or []

    # Check required columns
    missing_columns = [col for col in CSV_SCHEMA["required_columns"] if col not in columns]

    record_results = []
    valid_count = 0
    invalid_count = 0
    total_errors = 0
    field_error_counts = {}

    for row_num, row in enumerate(reader, start=2):  # Row 1 is header
        row_errors = {}
        row_valid = True

        for field_name, rule in CSV_SCHEMA["rules"].items():
            if field_name not in columns and not rule.get("required", True):
                continue

            value = row.get(field_name)
            errors = validate_field(value, rule)

            if errors:
                row_errors[field_name] = errors
                row_valid = False
                total_errors += len(errors)
                field_error_counts[field_name] = field_error_counts.get(field_name, 0) + len(errors)

        if row_valid:
            valid_count += 1
        else:
            invalid_count += 1

        # Keep first 50 record results for the report
        if len(record_results) < 50:
            record_results.append({
                "row": row_num,
                "valid": row_valid,
                "errors": row_errors if not row_valid else {},
            })

    total_records = valid_count + invalid_count
    validation_rate = (valid_count / total_records * 100) if total_records > 0 else 0

    return {
        "fileType": "CSV",
        "columns": columns,
        "missingRequiredColumns": missing_columns,
        "totalRecords": total_records,
        "validRecords": valid_count,
        "invalidRecords": invalid_count,
        "totalErrors": total_errors,
        "validationRate": round(validation_rate, 2),
        "fieldErrorCounts": field_error_counts,
        "recordResults": record_results,
    }


def validate_json_content(content: str) -> dict:
    """
    Validate JSON content against the default schema.
    Handles both single objects and arrays of objects.

    Returns:
        Validation report dictionary.
    """
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        return {
            "fileType": "JSON",
            "totalRecords": 0,
            "validRecords": 0,
            "invalidRecords": 0,
            "totalErrors": 1,
            "validationRate": 0,
            "parseError": f"Invalid JSON: {str(e)}",
            "recordResults": [],
        }

    # Normalize to list
    if isinstance(data, dict):
        records = [data]
    elif isinstance(data, list):
        records = data
    else:
        return {
            "fileType": "JSON",
            "totalRecords": 0,
            "totalErrors": 1,
            "validationRate": 0,
            "parseError": "JSON root must be an object or array of objects",
            "recordResults": [],
        }

    record_results = []
    valid_count = 0
    invalid_count = 0
    total_errors = 0
    field_error_counts = {}

    for idx, record in enumerate(records):
        if not isinstance(record, dict):
            record_results.append({
                "index": idx,
                "valid": False,
                "errors": {"_root": [f"Expected object, got {type(record).__name__}"]},
            })
            invalid_count += 1
            total_errors += 1
            continue

        # Check required fields
        row_errors = {}
        row_valid = True

        for field_name in JSON_SCHEMA["required_fields"]:
            if field_name not in record:
                row_errors[field_name] = ["Required field is missing"]
                row_valid = False
                total_errors += 1
                field_error_counts[field_name] = field_error_counts.get(field_name, 0) + 1

        # Validate each field
        for field_name, rule in JSON_SCHEMA["rules"].items():
            if field_name not in record and not rule.get("required", True):
                continue

            value = record.get(field_name)
            errors = validate_field(value, rule)

            if errors:
                row_errors[field_name] = errors
                row_valid = False
                total_errors += len(errors)
                field_error_counts[field_name] = field_error_counts.get(field_name, 0) + len(errors)

        if row_valid:
            valid_count += 1
        else:
            invalid_count += 1

        if len(record_results) < 50:
            record_results.append({
                "index": idx,
                "valid": row_valid,
                "errors": row_errors if not row_valid else {},
            })

    total_records = valid_count + invalid_count
    validation_rate = (valid_count / total_records * 100) if total_records > 0 else 0

    return {
        "fileType": "JSON",
        "totalRecords": total_records,
        "validRecords": valid_count,
        "invalidRecords": invalid_count,
        "totalErrors": total_errors,
        "validationRate": round(validation_rate, 2),
        "fieldErrorCounts": field_error_counts,
        "recordResults": record_results,
    }


def lambda_handler(event, context):
    """
    AWS Lambda handler — triggered by S3 event when a file is uploaded to data/ prefix.
    """
    log_event(logger, "INFO", "Data Validator invoked", event=json.dumps(event))

    records = parse_s3_event(event)

    results = []
    for record in records:
        bucket = record["bucket"]
        key = record["key"]
        file_size = record["size"]

        log_event(logger, "INFO", "Validating data file", bucket=bucket, key=key, size=file_size)

        try:
            with Timer() as timer:
                # Download the data file
                content_bytes = download_s3_object(bucket, key)
                content = content_bytes.decode("utf-8", errors="replace")

                # Determine file type and validate
                if key.lower().endswith(".csv"):
                    validation = validate_csv_content(content)
                elif key.lower().endswith(".json"):
                    validation = validate_json_content(content)
                else:
                    validation = {
                        "fileType": "unknown",
                        "error": "Unsupported file type. Expected .csv or .json",
                        "totalRecords": 0,
                        "validRecords": 0,
                        "invalidRecords": 0,
                    }

                # Enrich with file metadata
                validation["fileName"] = key.split("/")[-1]
                validation["filePath"] = key
                validation["fileSizeBytes"] = file_size

            # Determine status
            if validation.get("totalErrors", 0) == 0 and validation.get("totalRecords", 0) > 0:
                status = "success"
            elif validation.get("invalidRecords", 0) > 0:
                status = "warning"
            else:
                status = "error"

            # Store results
            result_id = store_processing_result(
                processing_type="data_validation",
                source_file=key,
                status=status,
                result_data=validation,
                processing_time_ms=timer.elapsed_ms,
            )

            log_event(
                logger, "INFO", "Data validation completed",
                result_id=result_id,
                total_records=validation.get("totalRecords", 0),
                valid_records=validation.get("validRecords", 0),
                validation_rate=validation.get("validationRate", 0),
                processing_time_ms=round(timer.elapsed_ms, 2),
            )

            results.append({"file": key, "result_id": result_id, "status": status})

        except Exception as e:
            log_event(logger, "ERROR", "Failed to validate data file", error=str(e), key=key)
            store_processing_result(
                processing_type="data_validation",
                source_file=key,
                status="error",
                result_data={"error": str(e)},
            )
            results.append({"file": key, "status": "error", "error": str(e)})

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Data validation complete", "results": results}),
    }
