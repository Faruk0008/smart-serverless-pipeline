# =============================================================================
# Smart Serverless Automation Pipeline — S3 Configuration
# =============================================================================
# Creates the upload bucket with event notifications to trigger Lambda functions
# based on the folder prefix of the uploaded file.
# =============================================================================

# --- S3 Upload Bucket ---
resource "aws_s3_bucket" "upload_bucket" {
  bucket        = "${var.project_name}-uploads-${data.aws_caller_identity.current.account_id}-${var.environment}"
  force_destroy = var.environment != "prod" # Allow destroy in non-prod environments

  tags = {
    Name = "${var.project_name}-uploads"
  }
}

# Enable versioning for data protection
resource "aws_s3_bucket_versioning" "upload_bucket_versioning" {
  bucket = aws_s3_bucket.upload_bucket.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption (AES-256)
resource "aws_s3_bucket_server_side_encryption_configuration" "upload_bucket_encryption" {
  bucket = aws_s3_bucket.upload_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "upload_bucket_public_access" {
  bucket = aws_s3_bucket.upload_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle rule to clean up processed files after 30 days (cost optimization)
resource "aws_s3_bucket_lifecycle_configuration" "upload_bucket_lifecycle" {
  bucket = aws_s3_bucket.upload_bucket.id

  rule {
    id     = "cleanup-processed"
    status = "Enabled"

    filter {
      prefix = "processed/"
    }

    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    expiration {
      days = 90
    }
  }
}

# --- S3 Event Notifications ---
# Route uploads to the correct Lambda based on folder prefix

resource "aws_s3_bucket_notification" "upload_notifications" {
  bucket = aws_s3_bucket.upload_bucket.id

  # Log files → Log Analyzer Lambda
  lambda_function {
    lambda_function_arn = aws_lambda_function.log_analyzer.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "logs/"
  }

  # Image files → Image Resizer Lambda
  lambda_function {
    lambda_function_arn = aws_lambda_function.image_resizer.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "images/"
  }

  # Data files → Data Validator Lambda
  lambda_function {
    lambda_function_arn = aws_lambda_function.data_validator.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "data/"
  }

  depends_on = [
    aws_lambda_permission.allow_s3_log_analyzer,
    aws_lambda_permission.allow_s3_image_resizer,
    aws_lambda_permission.allow_s3_data_validator,
  ]
}

# --- S3 Bucket for Processed Results (resized images, etc.) ---
resource "aws_s3_bucket" "processed_bucket" {
  bucket        = "${var.project_name}-processed-${data.aws_caller_identity.current.account_id}-${var.environment}"
  force_destroy = var.environment != "prod"

  tags = {
    Name = "${var.project_name}-processed"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "processed_bucket_encryption" {
  bucket = aws_s3_bucket.processed_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "processed_bucket_public_access" {
  bucket = aws_s3_bucket.processed_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
