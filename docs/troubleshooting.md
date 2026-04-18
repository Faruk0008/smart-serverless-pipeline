# Troubleshooting Guide

## Common Issues

### 1. Terraform Init Fails

**Symptom**: `Error: Failed to install provider`

**Solution**:
```bash
# Clear Terraform cache and retry
rm -rf .terraform .terraform.lock.hcl
terraform init
```

If behind a corporate proxy:
```bash
export HTTP_PROXY=http://proxy:port
export HTTPS_PROXY=http://proxy:port
terraform init
```

---

### 2. Terraform Apply — Access Denied

**Symptom**: `Error: Error creating S3 bucket: AccessDenied`

**Cause**: Your AWS IAM user lacks permissions.

**Solution**: Ensure your IAM user has the following policies:
- `AmazonS3FullAccess`
- `AmazonDynamoDBFullAccess`
- `AWSLambda_FullAccess`
- `CloudWatchFullAccess`
- `AmazonSNSFullAccess`
- `IAMFullAccess` (for creating Lambda roles)

Or use the `AdministratorAccess` policy for development (not recommended for production).

---

### 3. Lambda Function Not Triggering

**Symptom**: File uploaded to S3, but Lambda doesn't execute.

**Checks**:
1. **Correct prefix**: Ensure the file is uploaded under `logs/`, `images/`, or `data/` — NOT the root of the bucket
2. **S3 event notifications**: Verify in AWS Console → S3 → Properties → Event Notifications
3. **Lambda permissions**: Check that S3 has permission to invoke Lambda:
   ```bash
   aws lambda get-policy --function-name serverless-pipeline-log-analyzer-dev
   ```
4. **CloudWatch logs**: Check if Lambda was invoked but errored:
   ```bash
   aws logs tail /aws/lambda/serverless-pipeline-log-analyzer-dev --since 5m
   ```

---

### 4. Lambda Timeout

**Symptom**: `Task timed out after 60.00 seconds`

**Solution**: 
- Check file size — large files may need more time
- Increase timeout in `terraform/variables.tf`:
  ```hcl
  variable "lambda_timeout" {
    default = 120  # Increase from 60
  }
  ```
- For image resizer, increase memory (which also increases CPU):
  ```hcl
  # In terraform/lambda.tf, update memory_size
  memory_size = 1024  # Increase from 512
  ```

---

### 5. DynamoDB Writes Failing

**Symptom**: `An error occurred (AccessDeniedException)`

**Checks**:
1. Verify the Lambda role has `dynamodb:PutItem` permission
2. Verify the `TABLE_NAME` environment variable is set correctly:
   ```bash
   aws lambda get-function-configuration \
     --function-name serverless-pipeline-log-analyzer-dev \
     --query 'Environment.Variables'
   ```

---

### 6. SNS Email Not Received

**Symptom**: Alarm triggered but no email received.

**Checks**:
1. **Confirm subscription**: Check your email for the AWS SNS confirmation email and click the link
2. **Check spam folder**: SNS emails often end up in spam
3. **Verify subscription status**:
   ```bash
   aws sns list-subscriptions-by-topic \
     --topic-arn $(terraform output -raw sns_alert_topic_arn)
   ```
   Status should be `Confirmed`, not `PendingConfirmation`

---

### 7. Image Resizer — Pillow Import Error

**Symptom**: `Unable to import module 'handler': No module named 'PIL'`

**Solution**: Pillow must be installed in the Lambda deployment package:
```bash
cd lambdas/image_resizer
pip install Pillow -t .
cd ../../terraform
terraform apply  # This will re-package the Lambda
```

Alternatively, use a Lambda Layer with pre-built Pillow for the Lambda runtime.

---

### 8. Dashboard Not Loading

**Symptom**: Blank page or errors when opening `index.html`.

**Solutions**:
1. Use a local HTTP server (don't open the file directly):
   ```bash
   cd dashboard
   python -m http.server 8080
   ```
2. Check browser console (F12) for JavaScript errors
3. Ensure all files are present: `index.html`, `css/styles.css`, `js/charts.js`, `js/app.js`

---

## Reading CloudWatch Logs

### Via CLI
```bash
# Tail logs in real-time
aws logs tail /aws/lambda/serverless-pipeline-log-analyzer-dev --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/serverless-pipeline-log-analyzer-dev \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s000)
```

### Via Console
1. Go to [CloudWatch Console](https://console.aws.amazon.com/cloudwatch)
2. Navigate to Logs → Log Groups
3. Click on `/aws/lambda/serverless-pipeline-*`
4. Browse log streams (sorted by most recent)

## Testing Lambda Locally

### Using SAM CLI
```bash
# Install SAM CLI
pip install aws-sam-cli

# Invoke locally with test event
sam local invoke LogAnalyzerFunction -e events/s3-log-event.json

# Start local API (if using API Gateway)
sam local start-api
```

### Using Python directly
```bash
cd lambdas
python -c "
import json
from log_analyzer.handler import lambda_handler

with open('../events/s3-log-event.json') as f:
    event = json.load(f)

# Note: This will fail to connect to AWS services locally
# Use moto library for mocking
"
```

### Using Moto (Mock AWS)
```bash
pip install moto pytest

# Create a test file
python -m pytest tests/ -v
```
