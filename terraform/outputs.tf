# =============================================================================
# Smart Serverless Automation Pipeline — Outputs
# =============================================================================

output "s3_bucket_name" {
  description = "Name of the S3 upload bucket"
  value       = aws_s3_bucket.upload_bucket.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 upload bucket"
  value       = aws_s3_bucket.upload_bucket.arn
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB results table"
  value       = aws_dynamodb_table.processing_results.name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB results table"
  value       = aws_dynamodb_table.processing_results.arn
}

output "lambda_log_analyzer_arn" {
  description = "ARN of the Log Analyzer Lambda function"
  value       = aws_lambda_function.log_analyzer.arn
}

output "lambda_image_resizer_arn" {
  description = "ARN of the Image Resizer Lambda function"
  value       = aws_lambda_function.image_resizer.arn
}

output "lambda_data_validator_arn" {
  description = "ARN of the Data Validator Lambda function"
  value       = aws_lambda_function.data_validator.arn
}

output "sns_alert_topic_arn" {
  description = "ARN of the SNS alert topic"
  value       = aws_sns_topic.pipeline_alerts.arn
}

output "cloudwatch_dashboard_url" {
  description = "URL to the CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.pipeline_dashboard.dashboard_name}"
}

output "aws_region" {
  description = "AWS region where resources are deployed"
  value       = var.aws_region
}
