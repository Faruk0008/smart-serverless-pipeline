# =============================================================================
# Smart Serverless Automation Pipeline — Variables
# =============================================================================

variable "aws_region" {
  description = "AWS region to deploy resources in"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name of the project, used as prefix for all resources"
  type        = string
  default     = "serverless-pipeline"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "alert_email" {
  description = "Email address to receive SNS alert notifications"
  type        = string
  sensitive   = true
}

variable "lambda_memory_size" {
  description = "Memory allocation for Lambda functions (MB)"
  type        = number
  default     = 256
}

variable "lambda_timeout" {
  description = "Timeout for Lambda functions (seconds)"
  type        = number
  default     = 60
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 14
}

variable "error_alarm_threshold" {
  description = "Number of errors in evaluation period to trigger alarm"
  type        = number
  default     = 1
}

variable "error_alarm_period" {
  description = "Evaluation period for error alarms (seconds)"
  type        = number
  default     = 300
}
