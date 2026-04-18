# =============================================================================
# Smart Serverless Automation Pipeline — Main Terraform Configuration
# =============================================================================
# This file configures the AWS provider and Terraform settings.
# For production, switch to an S3 backend for remote state management.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Local backend for development. For production, uncomment the S3 backend below.
  # backend "s3" {
  #   bucket         = "your-terraform-state-bucket"
  #   key            = "serverless-pipeline/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Data source to get the current AWS account ID and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
