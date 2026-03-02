# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Common Commands
# Development
npm install             # Install dependencies
npm run dev             # Start local server (hot-reload)
npm test                # Run Jest tests (Watch mode)
npm run lint            # Check code style

# Container & Deployment
docker build -t user-app:local .
helm upgrade --install user-app ./charts/user-app --set image.repository=user-app --set image.tag=local
Infrastructure Contract (The Bridge)
This application runs on infrastructure defined in the separate infra-repo. We cannot see the Terraform state, so we must adhere to these hard constraints:
• Target Platform: EKS (Karpenter)
• Database: DynamoDB
    ◦ Table Name: app-users (Must be configured via TABLE_NAME env var)
    ◦ Partition Key: userId (String)
• Scaling Trigger: Application must use podAntiAffinity in Helm charts to force Pods across Availability Zones. This is required to trigger Karpenter EC2 provisioning.
• Observability: All logs must be structured JSON to allow CloudWatch analysis.
Coding Standards (TDD & SDLC)
• Test-Driven Development (Strict):
    1. RED: Create a failing Jest test based on the OpenAPI Spec before writing implementation code.
    2. GREEN: Write the minimal TypeScript to pass the test.
    3. REFACTOR: Optimize code structure.
• Tech Stack: Node.js (v20+), Express, AWS SDK v3 (DynamoDB Client).
• Style: TypeScript Strict Mode enabled. Use async/await with try/catch blocks for all AWS SDK calls.
• Spec Compliance: API endpoints must strictly adhere to openapi.yaml in the project root. 
Verification Protocol
Do not declare success after code compiles. Follow this order:
1. Local (Unit): npm test must pass 100%.
2. Build (Container): Docker build must succeed using the multi-stage Dockerfile.
3. Cluster (Integration):
    ◦ Deploy via Helm.
    ◦ Critical Check: Verify that Karpenter launches new EC2 nodes to handle the workload (due to Anti-Affinity rules).
    ◦ Health Check: curl /health must return 200 OK.
Architecture "Anti-Patterns" to Avoid
• Hardcoding AWS Regions/Creds: Always use the SDK's default provider chain (IRSA - IAM Roles for Service Accounts).
• In-Memory State: The app is stateless. Never store session data in memory; use DynamoDB.
• Console.log: Use a structured logger (e.g., Winston/Pino) instead of raw console output.
