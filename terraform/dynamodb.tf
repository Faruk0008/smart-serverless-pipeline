# =============================================================================
# Smart Serverless Automation Pipeline — DynamoDB Configuration
# =============================================================================
# Stores processing results from all three Lambda pipelines.
# Uses on-demand (PAY_PER_REQUEST) billing for cost efficiency in dev/demo.
# =============================================================================

resource "aws_dynamodb_table" "processing_results" {
  name         = "${var.project_name}-results-${var.environment}"
  billing_mode = "PAY_PER_REQUEST" # Cost-effective for variable workloads
  hash_key     = "id"
  range_key    = "timestamp"

  # Primary key: unique processing ID
  attribute {
    name = "id"
    type = "S"
  }

  # Sort key: ISO 8601 timestamp for chronological ordering
  attribute {
    name = "timestamp"
    type = "S"
  }

  # Attribute for GSI: processing type (log_analysis, image_resize, data_validation)
  attribute {
    name = "processingType"
    type = "S"
  }

  # Attribute for GSI: processing status (success, error, warning)
  attribute {
    name = "status"
    type = "S"
  }

  # Global Secondary Index: Query by processing type
  global_secondary_index {
    name            = "ProcessingTypeIndex"
    hash_key        = "processingType"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Global Secondary Index: Query by status (for monitoring/alerting)
  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Enable point-in-time recovery for data protection
  point_in_time_recovery {
    enabled = true
  }

  # Enable server-side encryption
  server_side_encryption {
    enabled = true
  }

  # TTL to auto-delete old records (cost optimization)
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-results"
  }
}
