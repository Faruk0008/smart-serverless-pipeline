"""
Log Analyzer Lambda Function
=============================
Triggered by S3 uploads to the 'logs/' prefix.
Parses log files, extracts severity distribution, identifies error patterns,
and stores analysis results in DynamoDB.
"""

import json
import os
import re
import sys
from collections import Counter

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
    logger = get_structured_logger("log-analyzer")
except ImportError:
    # When deployed as a standalone Lambda, shared utils are bundled
    import logging
    logging.warning("Could not import shared utils — running in standalone mode")
    logger = logging.getLogger("log-analyzer")

# ── Log Patterns ─────────────────────────────────────────────────────────────

# Common log severity patterns
SEVERITY_PATTERNS = {
    "ERROR": re.compile(r"\b(ERROR|FATAL|CRITICAL)\b", re.IGNORECASE),
    "WARN": re.compile(r"\b(WARN|WARNING)\b", re.IGNORECASE),
    "INFO": re.compile(r"\b(INFO)\b", re.IGNORECASE),
    "DEBUG": re.compile(r"\b(DEBUG|TRACE)\b", re.IGNORECASE),
}

# Common error message patterns to identify recurring issues
ERROR_PATTERNS = [
    (re.compile(r"Connection\s+(refused|timeout|reset)", re.IGNORECASE), "Connection Issue"),
    (re.compile(r"Out\s+of\s+memory", re.IGNORECASE), "Memory Issue"),
    (re.compile(r"Permission\s+denied", re.IGNORECASE), "Permission Issue"),
    (re.compile(r"File\s+not\s+found", re.IGNORECASE), "File Not Found"),
    (re.compile(r"Timeout\s+(exceeded|expired)", re.IGNORECASE), "Timeout"),
    (re.compile(r"(5\d{2})\s+(Internal\s+Server\s+Error|Bad\s+Gateway|Service\s+Unavailable)", re.IGNORECASE), "HTTP 5xx Error"),
    (re.compile(r"(4\d{2})\s+(Not\s+Found|Unauthorized|Forbidden|Bad\s+Request)", re.IGNORECASE), "HTTP 4xx Error"),
    (re.compile(r"Null\s*Pointer|NoneType|undefined\s+is\s+not", re.IGNORECASE), "Null Reference"),
    (re.compile(r"Disk\s+(full|space)", re.IGNORECASE), "Disk Space Issue"),
    (re.compile(r"SSL|TLS|certificate", re.IGNORECASE), "SSL/TLS Issue"),
]

# IP address pattern for access log analysis
IP_PATTERN = re.compile(r"\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b")

# Timestamp patterns
TIMESTAMP_PATTERNS = [
    re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}"),  # ISO 8601
    re.compile(r"\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2}"),      # Apache CLF
]


def analyze_log_content(content: str) -> dict:
    """
    Analyze log file content and return a comprehensive report.

    Returns:
        Dictionary containing severity counts, error patterns, and metadata.
    """
    lines = content.split("\n")
    total_lines = len(lines)
    non_empty_lines = [line for line in lines if line.strip()]

    # ── Severity Distribution ──
    severity_counts = Counter()
    error_lines = []

    for i, line in enumerate(non_empty_lines):
        matched = False
        for severity, pattern in SEVERITY_PATTERNS.items():
            if pattern.search(line):
                severity_counts[severity] += 1
                matched = True
                if severity == "ERROR":
                    # Keep first 50 error lines for analysis
                    if len(error_lines) < 50:
                        error_lines.append({"line_number": i + 1, "content": line[:200]})
                break
        if not matched:
            severity_counts["OTHER"] += 1

    # ── Error Pattern Detection ──
    error_pattern_counts = Counter()
    for line in non_empty_lines:
        for pattern, label in ERROR_PATTERNS:
            if pattern.search(line):
                error_pattern_counts[label] += 1

    # ── IP Address Analysis (for access logs) ──
    ip_counts = Counter()
    for line in non_empty_lines:
        ips = IP_PATTERN.findall(line)
        for ip in ips:
            ip_counts[ip] += 1

    # Top 10 IPs by frequency
    top_ips = dict(ip_counts.most_common(10))

    # ── Summary Metrics ──
    total_categorized = sum(severity_counts.values())
    error_count = severity_counts.get("ERROR", 0)
    warn_count = severity_counts.get("WARN", 0)
    error_rate = (error_count / total_categorized * 100) if total_categorized > 0 else 0

    return {
        "totalLines": total_lines,
        "nonEmptyLines": len(non_empty_lines),
        "severityDistribution": dict(severity_counts),
        "errorRate": round(error_rate, 2),
        "errorPatterns": dict(error_pattern_counts.most_common(10)),
        "topIPs": top_ips,
        "sampleErrors": error_lines[:10],  # First 10 error lines
        "summary": {
            "errors": error_count,
            "warnings": warn_count,
            "info": severity_counts.get("INFO", 0),
            "debug": severity_counts.get("DEBUG", 0),
            "other": severity_counts.get("OTHER", 0),
        },
    }


def lambda_handler(event, context):
    """
    AWS Lambda handler — triggered by S3 event when a file is uploaded to logs/ prefix.
    """
    log_event(logger, "INFO", "Log Analyzer invoked", event=json.dumps(event))

    records = parse_s3_event(event)

    results = []
    for record in records:
        bucket = record["bucket"]
        key = record["key"]
        file_size = record["size"]

        log_event(logger, "INFO", "Processing log file", bucket=bucket, key=key, size=file_size)

        try:
            with Timer() as timer:
                # Download and decode the log file
                content_bytes = download_s3_object(bucket, key)
                content = content_bytes.decode("utf-8", errors="replace")

                # Run analysis
                analysis = analyze_log_content(content)

                # Enrich with file metadata
                analysis["fileName"] = key.split("/")[-1]
                analysis["filePath"] = key
                analysis["fileSizeBytes"] = file_size

            # Determine status based on error rate
            if analysis["errorRate"] > 10:
                status = "warning"
            elif analysis["summary"]["errors"] > 0:
                status = "success"  # Processed successfully, but found errors in the log
            else:
                status = "success"

            # Store results in DynamoDB
            result_id = store_processing_result(
                processing_type="log_analysis",
                source_file=key,
                status=status,
                result_data=analysis,
                processing_time_ms=timer.elapsed_ms,
            )

            log_event(
                logger, "INFO", "Log analysis completed",
                result_id=result_id,
                total_lines=analysis["totalLines"],
                errors=analysis["summary"]["errors"],
                error_rate=analysis["errorRate"],
                processing_time_ms=round(timer.elapsed_ms, 2),
            )

            results.append({"file": key, "result_id": result_id, "status": status})

        except Exception as e:
            log_event(logger, "ERROR", "Failed to process log file", error=str(e), key=key)
            store_processing_result(
                processing_type="log_analysis",
                source_file=key,
                status="error",
                result_data={"error": str(e)},
            )
            results.append({"file": key, "status": "error", "error": str(e)})

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Log analysis complete", "results": results}),
    }
