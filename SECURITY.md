# Security Policy

## Supported versions

Security fixes are applied to the current maintained version on the `main` branch. Older app builds may not receive fixes; install a current release when one is available.

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public issue or pull request. Use GitHub's private vulnerability reporting for this repository when it is enabled. Otherwise, contact the repository maintainers privately through GitHub and include the affected area, impact, and steps to reproduce. Avoid sending real customer records or secrets in a report.

## Sensitive data

- Never commit `.env`, service-role keys, OAuth client secrets, scheduler secrets, refresh tokens, signing keys, or production data.
- `EXPO_PUBLIC_` variables are embedded in client builds and must contain only public client configuration.
- Report exposed credentials promptly so the owning provider can revoke and rotate them.
- Use synthetic data when reproducing or testing customer, sales, credit, or inventory workflows.
