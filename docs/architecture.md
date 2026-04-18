# Architecture Documentation

## System Overview

The Smart Serverless Automation Pipeline is an **event-driven, serverless architecture** built on AWS that automatically processes files uploaded to S3 using Lambda functions, stores results in DynamoDB, and monitors everything with CloudWatch and SNS.

## Architecture Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│             │     │   S3 Event        │     │  AWS Lambda       │
│  File       │────▶│   Notification    │────▶│  (Processor)      │
│  Upload     │     │                   │     │                   │
│  (S3)       │     │  Prefix Routing:  │     │  3 Functions:     │
│             │     │  logs/  → λ1      │     │  - Log Analyzer   │
└─────────────┘     │  images/→ λ2      │     │  - Image Resizer  │
                    │  data/  → λ3      │     │  - Data Validator │
                    └──────────────────┘     └────────┬──────────┘
                                                       │
                              ┌─────────────────────────┤
                              │                         │
                              ▼                         ▼
                    ┌──────────────────┐     ┌──────────────────┐
                    │   DynamoDB       │     │   CloudWatch     │
                    │   (Results)      │     │   (Logs/Metrics) │
                    │                   │     │                   │
                    │   - Processing   │     │  - Log Groups     │
                    │     results      │     │  - Metric Filters │
                    │   - Metadata     │     │  - Alarms         │
                    │   - TTL cleanup  │     │  - Dashboard      │
                    └──────────────────┘     └────────┬──────────┘
                                                       │
                                                       ▼
                                            ┌──────────────────┐
                                            │   SNS Topic      │
                                            │   (Alerts)       │
                                            │                   │
                                            │  → Email Notification
                                            └──────────────────┘
```

## Data Flow

### 1. File Upload (Trigger)
- Files are uploaded to the S3 bucket under specific prefixes:
  - `logs/` — Application log files (.log, .txt)
  - `images/` — Image files (.jpg, .png, .gif, .webp)
  - `data/` — Data files (.csv, .json)

### 2. Event Routing
- S3 Event Notifications detect `ObjectCreated` events
- Events are routed to the correct Lambda function based on the key prefix
- Each Lambda function has a dedicated **least-privilege IAM role**

### 3. Processing (Lambda Functions)

#### Log Analyzer (`logs/` prefix)
- Parses uploaded log files
- Extracts severity distribution (ERROR, WARN, INFO, DEBUG)
- Identifies recurring error patterns using regex
- Analyzes IP addresses for access log patterns
- Calculates error rate and generates summary

#### Image Resizer (`images/` prefix)
- Downloads the original image from S3
- Generates three resized variants:
  - **Thumbnail**: 128px (max dimension)
  - **Medium**: 512px
  - **Large**: 1024px
- Uploads resized images to the processed S3 bucket
- Calculates compression ratio

#### Data Validator (`data/` prefix)
- Validates CSV/JSON files against predefined schema rules
- Checks:
  - Required fields presence
  - Data types (integer, string, email, enum, date)
  - Value ranges (min/max for numbers, min/max length for strings)
- Generates per-record validation report
- Calculates validation rate

### 4. Results Storage (DynamoDB)
- All processing results are stored in a DynamoDB table
- Table Schema:
  - **Partition Key**: `id` (UUID)
  - **Sort Key**: `timestamp` (ISO 8601)
  - **GSI**: `processingType-timestamp` — Query by pipeline type
  - **GSI**: `status-timestamp` — Query by result status
  - **TTL**: `expiresAt` — Auto-delete after 30 days

### 5. Monitoring (CloudWatch + SNS)
- **Log Groups**: One per Lambda function with 14-day retention
- **Metric Filters**: Detect ERROR patterns in logs
- **Alarms**: Trigger when error count ≥ 1 in 5 minutes
- **Throttle Alarm**: Detects Lambda throttling across all functions
- **SNS Alerts**: Email notifications for alarm state changes
- **Dashboard**: CloudWatch dashboard with invocation, error, duration, and throttle metrics

## Security Model

| Layer | Security Control |
|:------|:----------------|
| S3 Upload Bucket | AES-256 encryption, public access blocked, versioning enabled |
| S3 Processed Bucket | AES-256 encryption, public access blocked |
| Lambda IAM Roles | Least-privilege per function (S3 read-only for source, DynamoDB write-only) |
| DynamoDB | Server-side encryption, point-in-time recovery |
| Lambda Environment | Variables encrypted at rest with default KMS key |

## Cost Estimation (Monthly)

Assuming ~1,000 file uploads per month in development:

| Service | Estimated Cost | Notes |
|:--------|:--------------|:------|
| Lambda | **$0.00** | Well within 1M free requests/month |
| S3 | **~$0.05** | Minimal storage, lifecycle cleanup |
| DynamoDB | **~$0.00** | On-demand billing, minimal requests |
| CloudWatch | **~$0.00** | 5GB free log ingestion/month |
| SNS | **~$0.00** | First 1,000 emails free |
| **Total** | **~$0.05/month** | Effectively free for development |

## Infrastructure as Code

All resources are defined using **Terraform** with modular file organization:

```
terraform/
├── main.tf           # Provider config, backend
├── variables.tf      # Input variables with validation
├── outputs.tf        # Resource identifiers for reference
├── s3.tf             # Upload + processed buckets, notifications
├── dynamodb.tf       # Results table, GSIs, TTL
├── lambda.tf         # 3 functions, IAM roles, permissions
└── monitoring.tf     # CloudWatch, SNS, alarms, dashboard
```
