# ⚡ Smart Serverless Automation Pipeline

A production-grade **event-driven serverless pipeline** built on AWS that automatically processes files uploaded to S3 using Lambda functions, stores results in DynamoDB, and monitors the entire system with CloudWatch alarms and SNS email alerts.

<p align="center">
  <img src="https://img.shields.io/badge/AWS-Lambda-FF9900?style=for-the-badge&logo=aws-lambda&logoColor=white" alt="AWS Lambda">
  <img src="https://img.shields.io/badge/AWS-S3-569A31?style=for-the-badge&logo=amazon-s3&logoColor=white" alt="AWS S3">
  <img src="https://img.shields.io/badge/AWS-DynamoDB-4053D6?style=for-the-badge&logo=amazon-dynamodb&logoColor=white" alt="DynamoDB">
  <img src="https://img.shields.io/badge/Terraform-IaC-7B42BC?style=for-the-badge&logo=terraform&logoColor=white" alt="Terraform">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/CI/CD-GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white" alt="GitHub Actions">
</p>

---

## 🏗️ Architecture

```
┌───────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────┐     ┌───────────┐
│  S3       │────▶│ S3 Event    │────▶│ AWS Lambda  │────▶│ DynamoDB  │     │ CloudWatch│
│  Upload   │     │ Notification│     │ (Processor) │     │ (Results) │     │ (Monitor) │
│  Bucket   │     │             │     │             │     │           │     │     │     │
│           │     │ Prefix      │     │ 3 Functions │     │ GSI Index │     │     ▼     │
│ logs/     │     │ Routing     │     │             │     │ TTL       │     │  SNS      │
│ images/   │     │             │     │             │     │           │     │ (Alerts)  │
│ data/     │     │             │     │             │     │           │     │           │
└───────────┘     └─────────────┘     └─────────────┘     └───────────┘     └───────────┘
```

### Three Processing Pipelines

| Upload Folder | Lambda Function | Processing |
|:---|:---|:---|
| `logs/` | **Log Analyzer** | Parses log files, extracts error patterns, severity distribution, IP analysis |
| `images/` | **Image Resizer** | Creates thumbnail (128px), medium (512px), large (1024px) variants |
| `data/` | **Data Validator** | Validates CSV/JSON against schema rules, per-record error reporting |

---

## 🚀 Quick Start

### Prerequisites
- [AWS CLI v2](https://aws.amazon.com/cli/) with configured credentials
- [Terraform v1.5+](https://www.terraform.io/downloads)
- [Python 3.12+](https://www.python.org/downloads/)

### Deploy to AWS

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/smart-serverless-pipeline.git
cd smart-serverless-pipeline

# 2. Configure variables
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your email

# 3. Install image resizer dependencies
cd ../lambdas/image_resizer
pip install Pillow -t .
cd ../../terraform

# 4. Deploy
terraform init
terraform plan
terraform apply
```

### Test the Pipeline

```bash
# Upload a log file
aws s3 cp test-data/sample.log s3://$(terraform output -raw s3_bucket_name)/logs/

# Upload a CSV file
aws s3 cp test-data/sample.csv s3://$(terraform output -raw s3_bucket_name)/data/

# Check results
aws dynamodb scan --table-name $(terraform output -raw dynamodb_table_name) --limit 5
```

### Run the Dashboard

```bash
cd dashboard
python -m http.server 8080
# Open http://localhost:8080
```

---

## 📁 Project Structure

```
├── terraform/                    # Infrastructure as Code
│   ├── main.tf                   # Provider, backend configuration
│   ├── variables.tf              # Input variables with validation
│   ├── outputs.tf                # Resource identifiers
│   ├── s3.tf                     # S3 buckets, event notifications
│   ├── dynamodb.tf               # DynamoDB table, GSIs, TTL
│   ├── lambda.tf                 # Lambda functions, IAM roles
│   ├── monitoring.tf             # CloudWatch, SNS, alarms
│   └── terraform.tfvars.example  # Example variable values
│
├── lambdas/                      # Lambda function source code
│   ├── log_analyzer/             # Log analysis processor
│   │   ├── handler.py
│   │   └── requirements.txt
│   ├── image_resizer/            # Image resizing processor
│   │   ├── handler.py
│   │   └── requirements.txt
│   ├── data_validator/           # Data validation processor
│   │   ├── handler.py
│   │   └── requirements.txt
│   └── shared/                   # Shared utilities
│       └── utils.py
│
├── dashboard/                    # Monitoring web dashboard
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js                # Application logic, mock data
│       └── charts.js             # Canvas-based chart engine
│
├── events/                       # Sample S3 events for testing
├── test-data/                    # Sample data files
├── docs/                         # Documentation
│   ├── architecture.md
│   ├── deployment-guide.md
│   └── troubleshooting.md
│
└── .github/workflows/            # CI/CD pipeline
    └── deploy.yml
```

---

## 🔒 Security

- **S3**: AES-256 encryption, public access blocked, versioning enabled
- **Lambda**: Least-privilege IAM roles per function
- **DynamoDB**: Server-side encryption, point-in-time recovery
- **Secrets**: Alert email stored as Terraform sensitive variable (not committed)

---

## 💰 Cost

All resources use **AWS Free Tier** eligible configurations:
- Lambda: 1M free requests/month
- DynamoDB: On-demand (25 WCU/RCU free)
- S3: 5GB free storage
- **Estimated cost: ~$0.05/month for development**

---

## 📊 Dashboard

The monitoring dashboard provides real-time visibility into the pipeline with:
- **Overview stats**: Total processed, success rate, avg duration, errors
- **Live charts**: Invocations over time, processing distribution
- **Pipeline status**: Per-pipeline performance metrics
- **File upload**: Drag & drop with progress tracking
- **Alerts feed**: CloudWatch alarm notifications
- **Performance metrics**: Latency (P50/P95/P99), cold starts, cost, memory

---

## 🔄 CI/CD Pipeline

GitHub Actions workflow runs automatically:
- **On PR**: Lint Python → Run tests → `terraform plan`
- **On merge to main**: Lint → Test → `terraform apply`

### Required GitHub Secrets
| Secret | Description |
|:-------|:-----------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key |
| `TF_VAR_alert_email` | Email for SNS alerts |

---

## 📚 Skills Demonstrated

| Skill | Implementation |
|:------|:-------------|
| Event-Driven Architecture | S3 → Lambda triggers with prefix-based routing |
| Serverless Computing | AWS Lambda with Python 3.12 runtime |
| Infrastructure as Code | Terraform with modular, production-grade configuration |
| NoSQL Database Design | DynamoDB with composite keys, GSIs, and TTL |
| Monitoring & Alerting | CloudWatch metrics, alarms, and SNS notifications |
| Security Best Practices | Least-privilege IAM, encryption at rest, no public access |
| CI/CD Automation | GitHub Actions with plan/apply workflow |
| Cost Optimization | Free tier configs, lifecycle rules, on-demand billing |

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
