# Infrastructure Request: GitHub Actions Pipeline

**Requesting repo:** `normjon/claude-simple-app-test`
**Date:** 2026-03-02
**Priority:** Required before the CI/CD pipeline can execute

---

## Context

The application repo has a GitHub Actions pipeline configured in `.github/workflows/`:

- **`ci.yml`** — runs on every pull request, executes `npm run test:ci` and `npm run lint`.
  Blocks merge if either fails. No AWS access required.

- **`deploy-dev.yml`** — runs on every merge to `main`. Builds a `linux/arm64` Docker image,
  pushes to ECR, then runs `helm upgrade` against the EKS cluster. Requires AWS access via OIDC.

The pipeline is written and committed. It cannot run until the AWS and GitHub prerequisites
below are in place.

---

## Existing Infrastructure (do not recreate)

| Resource | Value |
|---|---|
| AWS Account | `096305373014` |
| Region | `us-east-2` |
| EKS Cluster | `ex-claude-cloud-test` |
| ECR Repository | `096305373014.dkr.ecr.us-east-2.amazonaws.com/user-app` |
| DynamoDB Table | `app-users` |
| App IRSA Role | `arn:aws:iam::096305373014:role/ex-claude-cloud-test-user-app` |
| Kubernetes Namespace | `default` |
| Kubernetes Service Account | `user-app-sa` |

---

## Required: AWS Infrastructure

### 1. GitHub OIDC Identity Provider

Check whether `token.actions.githubusercontent.com` already exists as an IAM OIDC provider
in account `096305373014`. If it does, skip this step.

If it does not exist, create it:

```hcl
resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1",
                     "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}
```

---

### 2. GitHub Actions IAM Role

Create an IAM role that the GitHub Actions pipeline will assume via OIDC.

**Trust policy** — restricted to the `main` branch of this repository only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::096305373014:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub":
            "repo:normjon/claude-simple-app-test:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

**Permissions policy** — minimum required for build and deploy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:us-east-2:096305373014:repository/user-app"
    },
    {
      "Sid": "EKSDescribe",
      "Effect": "Allow",
      "Action": "eks:DescribeCluster",
      "Resource": "arn:aws:eks:us-east-2:096305373014:cluster/ex-claude-cloud-test"
    }
  ]
}
```

**Suggested role name:** `ex-claude-cloud-test-github-actions`

---

### 3. EKS Cluster Access for the GitHub Actions Role

The `helm upgrade` and `kubectl get ingress` commands in the pipeline need Kubernetes API
access. IAM permissions alone are not sufficient — the role must also be granted access
inside the cluster.

Create an EKS access entry for the GitHub Actions role:

```hcl
resource "aws_eks_access_entry" "github_actions" {
  cluster_name  = "ex-claude-cloud-test"
  principal_arn = aws_iam_role.github_actions.arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "github_actions" {
  cluster_name  = "ex-claude-cloud-test"
  principal_arn = aws_iam_role.github_actions.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy"

  access_scope {
    type       = "namespace"
    namespaces = ["default"]
  }
}
```

> **Scope:** namespace `default` only. The pipeline deploys to the `default` namespace
> exclusively. Do not grant cluster-wide admin.

---

## Required: GitHub Configuration

These steps require GitHub repository admin access on `normjon/claude-simple-app-test`.
They cannot be done via Terraform — they must be done through the GitHub UI or API.

### 4. Repository Secret: `AWS_DEPLOY_ROLE_ARN`

Once the IAM role above is created, add its ARN as a repository secret:

1. Go to `https://github.com/normjon/claude-simple-app-test/settings/secrets/actions`
2. Click **New repository secret**
3. Name: `AWS_DEPLOY_ROLE_ARN`
4. Value: ARN of the role created in step 2
   (e.g. `arn:aws:iam::096305373014:role/ex-claude-cloud-test-github-actions`)

### 5. GitHub Environment: `dev`

The `deploy-dev.yml` workflow references a GitHub Environment named `dev` for deployment
tracking. Create it with no approval requirements (auto-deploy):

1. Go to `https://github.com/normjon/claude-simple-app-test/settings/environments`
2. Click **New environment**
3. Name: `dev`
4. Required reviewers: none
5. Save

### 6. Branch Protection on `main`

1. Go to `https://github.com/normjon/claude-simple-app-test/settings/branches`
2. Add a branch protection rule for `main`:
   - **Require a pull request before merging:** enabled
   - **Required approving reviews:** 1
   - **Require status checks to pass before merging:** enabled
     - Add status check: `Test & Lint` (this is the job name in `ci.yml`)
   - **Do not allow bypassing the above settings:** enabled

---

## Verification

After all steps are complete, verify with the following:

```bash
# 1. Confirm OIDC provider exists
aws iam list-open-id-connect-providers \
  | grep token.actions.githubusercontent.com

# 2. Confirm role exists and trust policy is correct
aws iam get-role --role-name ex-claude-cloud-test-github-actions \
  --query 'Role.AssumeRolePolicyDocument' --output json

# 3. Confirm EKS access entry exists
aws eks list-access-entries --cluster-name ex-claude-cloud-test \
  | grep github-actions

# 4. Confirm the pipeline can run by pushing a commit to a feature branch,
#    opening a PR to main, and verifying that the 'Test & Lint' check appears.
```

---

## What to Return

Please provide the following once complete so the application repo can be confirmed end-to-end:

| Item | Value |
|---|---|
| GitHub Actions IAM Role ARN | `arn:aws:iam::096305373014:role/ex-claude-cloud-test-github-actions` |
| EKS access entry confirmed | yes — AmazonEKSAdminPolicy, namespace `default` |
| `AWS_DEPLOY_ROLE_ARN` secret set in GitHub | yes — updated 2026-03-02T16:21Z |
| `dev` GitHub Environment created | yes — no approval gates |
| Branch protection on `main` enabled | yes — 1 review required, Test & Lint check required, admins enforced |
