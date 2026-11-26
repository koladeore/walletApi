# AWS ECR publishing templates

These templates document the IAM permissions and trust relationship for publishing Wallet API images from GitHub Actions to AWS ECR. The active CI workflow publishes to GitHub Container Registry.

- In both JSON templates, replace `<AWS_ACCOUNT_ID>` with the target AWS account ID.
- In the trust template, replace `<GITHUB_OWNER>` and `<GITHUB_REPOSITORY>` with the exact repository owner and name. The subject restricts role assumption to `main`; update the condition if you use a different release branch.
- In the permissions template, adjust the region and repository name to match the ECR repository.

To use ECR, configure GitHub's OIDC provider and an IAM role with these policies in the target account, then grant `id-token: write` to the publishing job and configure it to assume that role. Keep any deployment credentials in the platform's secret store. Review the resulting policies before applying them.
