# =============================================================================
# Smart Serverless Automation Pipeline — Lambda Functions
# =============================================================================
# Defines three Lambda functions, their IAM roles, and S3 invocation permissions.
# Each function follows the principle of least privilege.
# =============================================================================

# =============================================================================
# IAM Roles & Policies
# =============================================================================

# --- Shared Lambda Execution Policy ---
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# --- Log Analyzer IAM ---
resource "aws_iam_role" "log_analyzer_role" {
  name               = "${var.project_name}-log-analyzer-role-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = { Function = "log-analyzer" }
}

data "aws_iam_policy_document" "log_analyzer_policy" {
  # CloudWatch Logs
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"]
  }

  # S3 Read (upload bucket only)
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:HeadObject"
    ]
    resources = ["${aws_s3_bucket.upload_bucket.arn}/logs/*"]
  }

  # DynamoDB Write
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem"
    ]
    resources = [
      aws_dynamodb_table.processing_results.arn
    ]
  }
}

resource "aws_iam_role_policy" "log_analyzer_policy" {
  name   = "${var.project_name}-log-analyzer-policy"
  role   = aws_iam_role.log_analyzer_role.id
  policy = data.aws_iam_policy_document.log_analyzer_policy.json
}

# --- Image Resizer IAM ---
resource "aws_iam_role" "image_resizer_role" {
  name               = "${var.project_name}-image-resizer-role-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = { Function = "image-resizer" }
}

data "aws_iam_policy_document" "image_resizer_policy" {
  # CloudWatch Logs
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"]
  }

  # S3 Read (upload bucket, images prefix)
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:HeadObject"
    ]
    resources = ["${aws_s3_bucket.upload_bucket.arn}/images/*"]
  }

  # S3 Write (processed bucket, for resized images)
  statement {
    effect = "Allow"
    actions = [
      "s3:PutObject"
    ]
    resources = ["${aws_s3_bucket.processed_bucket.arn}/*"]
  }

  # DynamoDB Write
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem"
    ]
    resources = [
      aws_dynamodb_table.processing_results.arn
    ]
  }
}

resource "aws_iam_role_policy" "image_resizer_policy" {
  name   = "${var.project_name}-image-resizer-policy"
  role   = aws_iam_role.image_resizer_role.id
  policy = data.aws_iam_policy_document.image_resizer_policy.json
}

# --- Data Validator IAM ---
resource "aws_iam_role" "data_validator_role" {
  name               = "${var.project_name}-data-validator-role-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = { Function = "data-validator" }
}

data "aws_iam_policy_document" "data_validator_policy" {
  # CloudWatch Logs
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"]
  }

  # S3 Read (upload bucket, data prefix)
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:HeadObject"
    ]
    resources = ["${aws_s3_bucket.upload_bucket.arn}/data/*"]
  }

  # DynamoDB Write
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem"
    ]
    resources = [
      aws_dynamodb_table.processing_results.arn
    ]
  }
}

resource "aws_iam_role_policy" "data_validator_policy" {
  name   = "${var.project_name}-data-validator-policy"
  role   = aws_iam_role.data_validator_role.id
  policy = data.aws_iam_policy_document.data_validator_policy.json
}

# =============================================================================
# Lambda Function Packages
# =============================================================================

# Package each Lambda function as a ZIP
data "archive_file" "log_analyzer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/log_analyzer"
  output_path = "${path.module}/../lambdas/log_analyzer.zip"
}

data "archive_file" "image_resizer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/image_resizer"
  output_path = "${path.module}/../lambdas/image_resizer.zip"
}

data "archive_file" "data_validator_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/data_validator"
  output_path = "${path.module}/../lambdas/data_validator.zip"
}

# =============================================================================
# Lambda Functions
# =============================================================================

# --- Log Analyzer ---
resource "aws_lambda_function" "log_analyzer" {
  function_name    = "${var.project_name}-log-analyzer-${var.environment}"
  description      = "Analyzes uploaded log files — extracts error counts, patterns, and severity distribution"
  role             = aws_iam_role.log_analyzer_role.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout
  filename         = data.archive_file.log_analyzer_zip.output_path
  source_code_hash = data.archive_file.log_analyzer_zip.output_base64sha256

  environment {
    variables = {
      TABLE_NAME    = aws_dynamodb_table.processing_results.name
      BUCKET_NAME   = aws_s3_bucket.upload_bucket.id
      ENVIRONMENT   = var.environment
      FUNCTION_NAME = "log-analyzer"
    }
  }

  tags = { Function = "log-analyzer" }
}

# --- Image Resizer ---
resource "aws_lambda_function" "image_resizer" {
  function_name    = "${var.project_name}-image-resizer-${var.environment}"
  description      = "Resizes uploaded images into thumbnail, medium, and large variants"
  role             = aws_iam_role.image_resizer_role.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  memory_size      = 512 # Image processing needs more memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.image_resizer_zip.output_path
  source_code_hash = data.archive_file.image_resizer_zip.output_base64sha256

  environment {
    variables = {
      TABLE_NAME       = aws_dynamodb_table.processing_results.name
      UPLOAD_BUCKET    = aws_s3_bucket.upload_bucket.id
      PROCESSED_BUCKET = aws_s3_bucket.processed_bucket.id
      ENVIRONMENT      = var.environment
      FUNCTION_NAME    = "image-resizer"
    }
  }

  # Use a Lambda layer for Pillow (pre-built for Lambda runtime)
  # layers = [aws_lambda_layer_version.pillow_layer.arn]

  tags = { Function = "image-resizer" }
}

# --- Data Validator ---
resource "aws_lambda_function" "data_validator" {
  function_name    = "${var.project_name}-data-validator-${var.environment}"
  description      = "Validates uploaded CSV/JSON data files against predefined schema rules"
  role             = aws_iam_role.data_validator_role.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout
  filename         = data.archive_file.data_validator_zip.output_path
  source_code_hash = data.archive_file.data_validator_zip.output_base64sha256

  environment {
    variables = {
      TABLE_NAME    = aws_dynamodb_table.processing_results.name
      BUCKET_NAME   = aws_s3_bucket.upload_bucket.id
      ENVIRONMENT   = var.environment
      FUNCTION_NAME = "data-validator"
    }
  }

  tags = { Function = "data-validator" }
}

# =============================================================================
# S3 → Lambda Invocation Permissions
# =============================================================================

resource "aws_lambda_permission" "allow_s3_log_analyzer" {
  statement_id   = "AllowS3InvokeLogAnalyzer"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.log_analyzer.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.upload_bucket.arn
  source_account = data.aws_caller_identity.current.account_id
}

resource "aws_lambda_permission" "allow_s3_image_resizer" {
  statement_id   = "AllowS3InvokeImageResizer"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.image_resizer.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.upload_bucket.arn
  source_account = data.aws_caller_identity.current.account_id
}

resource "aws_lambda_permission" "allow_s3_data_validator" {
  statement_id   = "AllowS3InvokeDataValidator"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.data_validator.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.upload_bucket.arn
  source_account = data.aws_caller_identity.current.account_id
}
