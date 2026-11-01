# How this app WOULD be deployed to AWS on ECS Fargate (serverless containers).
# This is for learning: it is checked with `terraform validate` but never applied.
#
# The flow: build the Docker image -> push it to ECR -> ECS runs it as a "task"
# -> the container's console output goes to CloudWatch Logs.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "app_name" {
  type    = string
  default = "event-timeline-assistant"
}

# Who may reach the app, e.g. "203.0.113.7/32" for just your IP. No default on purpose:
# opening it to 0.0.0.0/0 would let anyone call /ask and spend the Gemini quota.
variable "allowed_cidr" {
  type = string
}

# ECR: a private Docker registry. You `docker push` the image here and ECS pulls it.
resource "aws_ecr_repository" "app" {
  name = var.app_name
}

# CloudWatch log group: where everything the app prints (console.log) is stored and searchable.
# Keep logs 14 days so they don't pile up costs forever.
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.app_name}"
  retention_in_days = 14
}

# Secrets Manager: holds the Gemini API key. Terraform only creates the empty "box"; you put the
# value in by hand (aws secretsmanager put-secret-value), so the key never appears in code or state.
resource "aws_secretsmanager_secret" "gemini_key" {
  name = "${var.app_name}/gemini-api-key"
}

# IAM role: an identity that ECS "assumes" when starting the container. The trust policy below
# says WHO may use the role (only the ECS tasks service), and the policies say WHAT it may do.
resource "aws_iam_role" "task_execution" {
  name = "${var.app_name}-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# AWS-managed policy: lets ECS pull the image from ECR and write logs to CloudWatch.
resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Least privilege: the role may read exactly ONE secret, nothing else in Secrets Manager.
resource "aws_iam_role_policy" "read_gemini_key" {
  name = "read-gemini-key"
  role = aws_iam_role.task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = aws_secretsmanager_secret.gemini_key.arn
    }]
  })
}

# ECS cluster: a logical group for our running containers (Fargate means no servers to manage).
resource "aws_ecs_cluster" "main" {
  name = var.app_name
}

# Task definition: the "recipe" for running the container (image, CPU/memory, port, env, logs).
resource "aws_ecs_task_definition" "app" {
  family                   = var.app_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256" # 0.25 vCPU
  memory                   = "512" # MiB
  execution_role_arn       = aws_iam_role.task_execution.arn

  container_definitions = jsonencode([{
    name         = var.app_name
    image        = "${aws_ecr_repository.app.repository_url}:latest"
    essential    = true
    portMappings = [{ containerPort = 3000 }]
    # ECS reads the secret at startup and passes it in as the GEMINI_API_KEY environment variable.
    secrets = [{ name = "GEMINI_API_KEY", valueFrom = aws_secretsmanager_secret.gemini_key.arn }]
    # The awslogs driver ships the container's stdout/stderr to our CloudWatch log group.
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "app"
      }
    }
  }])
}

# Networking: use the account's default VPC and its subnets to keep this short.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security group = a firewall. Allow port 3000 in from allowed_cidr only, and anything out (to call Gemini).
# This is plain HTTP. Before a public launch, put an Application Load Balancer in front with an
# ACM certificate and an HTTPS listener, and allow port 3000 only from the load balancer.
resource "aws_security_group" "app" {
  name   = "${var.app_name}-sg"
  vpc_id = data.aws_vpc.default.id

  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Service: keeps 1 copy of the task running and restarts it if it crashes.
resource "aws_ecs_service" "app" {
  name            = var.app_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}
