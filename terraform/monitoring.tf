# =============================================================================
# Smart Serverless Automation Pipeline — Monitoring & Alerting
# =============================================================================
# CloudWatch Log Groups, Metric Filters, Alarms, SNS Topic, and Dashboard.
# =============================================================================

# =============================================================================
# SNS Topic for Alerts
# =============================================================================

resource "aws_sns_topic" "pipeline_alerts" {
  name = "${var.project_name}-alerts-${var.environment}"

  tags = {
    Name = "${var.project_name}-alerts"
  }
}

resource "aws_sns_topic_subscription" "email_alert" {
  topic_arn = aws_sns_topic.pipeline_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# =============================================================================
# CloudWatch Log Groups
# =============================================================================

resource "aws_cloudwatch_log_group" "log_analyzer_logs" {
  name              = "/aws/lambda/${aws_lambda_function.log_analyzer.function_name}"
  retention_in_days = var.log_retention_days

  tags = { Function = "log-analyzer" }
}

resource "aws_cloudwatch_log_group" "image_resizer_logs" {
  name              = "/aws/lambda/${aws_lambda_function.image_resizer.function_name}"
  retention_in_days = var.log_retention_days

  tags = { Function = "image-resizer" }
}

resource "aws_cloudwatch_log_group" "data_validator_logs" {
  name              = "/aws/lambda/${aws_lambda_function.data_validator.function_name}"
  retention_in_days = var.log_retention_days

  tags = { Function = "data-validator" }
}

# =============================================================================
# CloudWatch Metric Filters — Detect ERROR logs
# =============================================================================

resource "aws_cloudwatch_log_metric_filter" "log_analyzer_errors" {
  name           = "${var.project_name}-log-analyzer-errors"
  log_group_name = aws_cloudwatch_log_group.log_analyzer_logs.name
  pattern        = "\"ERROR\""

  metric_transformation {
    name          = "LogAnalyzerErrors"
    namespace     = "${var.project_name}/Lambda"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "image_resizer_errors" {
  name           = "${var.project_name}-image-resizer-errors"
  log_group_name = aws_cloudwatch_log_group.image_resizer_logs.name
  pattern        = "\"ERROR\""

  metric_transformation {
    name          = "ImageResizerErrors"
    namespace     = "${var.project_name}/Lambda"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "data_validator_errors" {
  name           = "${var.project_name}-data-validator-errors"
  log_group_name = aws_cloudwatch_log_group.data_validator_logs.name
  pattern        = "\"ERROR\""

  metric_transformation {
    name          = "DataValidatorErrors"
    namespace     = "${var.project_name}/Lambda"
    value         = "1"
    default_value = "0"
  }
}

# =============================================================================
# CloudWatch Alarms
# =============================================================================

resource "aws_cloudwatch_metric_alarm" "log_analyzer_error_alarm" {
  alarm_name          = "${var.project_name}-log-analyzer-errors-${var.environment}"
  alarm_description   = "Triggered when Log Analyzer Lambda produces errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "LogAnalyzerErrors"
  namespace           = "${var.project_name}/Lambda"
  period              = var.error_alarm_period
  statistic           = "Sum"
  threshold           = var.error_alarm_threshold
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.pipeline_alerts.arn]
  ok_actions    = [aws_sns_topic.pipeline_alerts.arn]

  tags = { Function = "log-analyzer" }
}

resource "aws_cloudwatch_metric_alarm" "image_resizer_error_alarm" {
  alarm_name          = "${var.project_name}-image-resizer-errors-${var.environment}"
  alarm_description   = "Triggered when Image Resizer Lambda produces errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ImageResizerErrors"
  namespace           = "${var.project_name}/Lambda"
  period              = var.error_alarm_period
  statistic           = "Sum"
  threshold           = var.error_alarm_threshold
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.pipeline_alerts.arn]
  ok_actions    = [aws_sns_topic.pipeline_alerts.arn]

  tags = { Function = "image-resizer" }
}

resource "aws_cloudwatch_metric_alarm" "data_validator_error_alarm" {
  alarm_name          = "${var.project_name}-data-validator-errors-${var.environment}"
  alarm_description   = "Triggered when Data Validator Lambda produces errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "DataValidatorErrors"
  namespace           = "${var.project_name}/Lambda"
  period              = var.error_alarm_period
  statistic           = "Sum"
  threshold           = var.error_alarm_threshold
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.pipeline_alerts.arn]
  ok_actions    = [aws_sns_topic.pipeline_alerts.arn]

  tags = { Function = "data-validator" }
}

# Alarm for Lambda throttling
resource "aws_cloudwatch_metric_alarm" "lambda_throttles_alarm" {
  alarm_name          = "${var.project_name}-lambda-throttles-${var.environment}"
  alarm_description   = "Triggered when any pipeline Lambda is being throttled"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0

  metric_query {
    id          = "total_throttles"
    expression  = "t1 + t2 + t3"
    label       = "Total Lambda Throttles"
    return_data = true
  }

  metric_query {
    id = "t1"
    metric {
      metric_name = "Throttles"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.log_analyzer.function_name
      }
    }
  }

  metric_query {
    id = "t2"
    metric {
      metric_name = "Throttles"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.image_resizer.function_name
      }
    }
  }

  metric_query {
    id = "t3"
    metric {
      metric_name = "Throttles"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.data_validator.function_name
      }
    }
  }

  alarm_actions = [aws_sns_topic.pipeline_alerts.arn]
}

# =============================================================================
# CloudWatch Dashboard
# =============================================================================

resource "aws_cloudwatch_dashboard" "pipeline_dashboard" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title = "Lambda Invocations"
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.log_analyzer.function_name, { label = "Log Analyzer" }],
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.image_resizer.function_name, { label = "Image Resizer" }],
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.data_validator.function_name, { label = "Data Validator" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title = "Lambda Errors"
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.log_analyzer.function_name, { label = "Log Analyzer", color = "#d13212" }],
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.image_resizer.function_name, { label = "Image Resizer", color = "#ff9900" }],
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.data_validator.function_name, { label = "Data Validator", color = "#1d8102" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title = "Lambda Duration (ms)"
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.log_analyzer.function_name, { label = "Log Analyzer", stat = "Average" }],
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.image_resizer.function_name, { label = "Image Resizer", stat = "Average" }],
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.data_validator.function_name, { label = "Data Validator", stat = "Average" }]
          ]
          period = 300
          region = var.aws_region
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title = "Lambda Throttles & Concurrent Executions"
          metrics = [
            ["AWS/Lambda", "Throttles", "FunctionName", aws_lambda_function.log_analyzer.function_name, { label = "Throttles - Log Analyzer" }],
            ["AWS/Lambda", "ConcurrentExecutions", "FunctionName", aws_lambda_function.log_analyzer.function_name, { label = "Concurrency - Log Analyzer" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          view   = "timeSeries"
        }
      }
    ]
  })
}
