# Deployment Guide

## Prerequisites

Before deploying, ensure you have the following installed:

| Tool | Version | Installation |
|:-----|:--------|:------------|
| AWS CLI | v2+ | [aws.amazon.com/cli](https://aws.amazon.com/cli/) |
| Terraform | v1.5+ | [terraform.io](https://www.terraform.io/downloads) |
| Python | 3.12+ | [python.org](https://www.python.org/downloads/) |
| Git | Any | [git-scm.com](https://git-scm.com/) |

## Step 1: AWS Account Setup

### 1.1 Configure AWS CLI
```bash
aws configure
# Enter your:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region: us-east-1
# - Default output format: json
```

### 1.2 Verify Access
```bash
aws sts get-caller-identity
```
You should see your Account ID, User ARN, etc.

## Step 2: Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/smart-serverless-pipeline.git
cd smart-serverless-pipeline
```

## Step 3: Configure Terraform Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:
```hcl
aws_region    = "us-east-1"
project_name  = "serverless-pipeline"
environment   = "dev"
alert_email   = "your-email@example.com"
```

> **Important**: Never commit `terraform.tfvars` to Git — it's gitignored.

## Step 4: Install Lambda Dependencies

### Log Analyzer (no extra deps needed)
```bash
# boto3 is pre-installed in Lambda runtime
```

### Image Resizer (needs Pillow)
```bash
cd ../lambdas/image_resizer
pip install Pillow -t .
cd ../../terraform
```

### Data Validator (no extra deps needed)
```bash
# boto3 is pre-installed in Lambda runtime
```

## Step 5: Deploy Infrastructure

### 5.1 Initialize Terraform
```bash
terraform init
```

### 5.2 Preview Changes
```bash
terraform plan
```

Review the plan output carefully. You should see:
- 2 S3 buckets
- 1 DynamoDB table
- 3 Lambda functions
- 3 IAM roles
- 3 CloudWatch log groups
- 3 Metric filters + 4 Alarms
- 1 SNS topic + 1 email subscription
- 1 CloudWatch dashboard

### 5.3 Apply Changes
```bash
terraform apply
```

Type `yes` when prompted. Deployment takes ~60 seconds.

### 5.4 Confirm Email Subscription
Check your email and **click the confirmation link** from AWS SNS. This is required to receive alert notifications.

### 5.5 Note the Outputs
```bash
terraform output
```

Save the S3 bucket name and DynamoDB table name for testing.

## Step 6: Test the Pipeline

### 6.1 Upload a Log File
```bash
aws s3 cp ../test-data/sample.log s3://$(terraform output -raw s3_bucket_name)/logs/sample.log
```

### 6.2 Upload a Data File
```bash
aws s3 cp ../test-data/sample.csv s3://$(terraform output -raw s3_bucket_name)/data/sample.csv
```

### 6.3 Check Processing Results
```bash
aws dynamodb scan \
  --table-name $(terraform output -raw dynamodb_table_name) \
  --limit 5
```

### 6.4 Check Lambda Logs
```bash
aws logs tail /aws/lambda/serverless-pipeline-log-analyzer-dev --follow
```

## Step 7: Run the Dashboard Locally

```bash
cd ../dashboard
python -m http.server 8080
```

Open http://localhost:8080 in your browser.

> **Note**: The dashboard currently runs with mock data. To connect to live AWS data, you would integrate the AWS SDK for JavaScript with Cognito authentication.

## Step 8: Cleanup (Tear Down)

To avoid charges, destroy all resources when done:

```bash
cd ../terraform
terraform destroy
```

Type `yes` when prompted. This removes all AWS resources created by this project.

## Troubleshooting

See [troubleshooting.md](troubleshooting.md) for common issues and solutions.
