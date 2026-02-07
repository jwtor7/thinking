# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Email the maintainer or use [GitHub Security Advisories](https://github.com/jwtor7/thinking/security/advisories/new)
3. Include steps to reproduce the vulnerability
4. Allow reasonable time for a fix before public disclosure

## Security Design

Thinking Monitor is designed with security in mind:

- **Localhost-only** — Binds exclusively to `127.0.0.1`, never exposed to the network
- **No persistence** — Events exist only in memory during the session
- **Secret redaction** — API keys, tokens, and passwords are automatically masked
- **Path validation** — File operations are restricted and validated
- **XSS prevention** — All content is HTML-escaped before rendering
- **CSP headers** — Content-Security-Policy for defense-in-depth
- **Rate limiting** — Protects against local DoS
