/**
 * Secret redaction module for the Thinking Monitor.
 *
 * Provides pattern-based detection and redaction of sensitive data
 * before logging or broadcasting to WebSocket clients.
 */

/** Placeholder text for redacted secrets */
const REDACTED = '[REDACTED]';

/**
 * Secret pattern configuration.
 * Each pattern has a regex and optional validation rules.
 */
interface SecretPattern {
  /** Human-readable name for the pattern */
  name: string;
  /** Regex pattern to match (must have a capture group for the secret value) */
  pattern: RegExp;
  /** Minimum length of the secret value (excludes false positives) */
  minLength?: number;
}

/**
 * Patterns for detecting various types of secrets.
 *
 * Pattern design considerations:
 * - Use word boundaries where appropriate to reduce false positives
 * - Capture the secret value to enable proper redaction
 * - Be careful with greedy matching to avoid over-redacting
 */
const SECRET_PATTERNS: SecretPattern[] = [
  // API Key prefixes (common cloud providers and services)
  {
    name: 'Stripe API key',
    pattern: /\b(sk_(?:live|test)_[a-zA-Z0-9]{24,})\b/g,
    minLength: 20,
  },
  {
    name: 'Stripe publishable key',
    pattern: /\b(pk_(?:live|test)_[a-zA-Z0-9]{24,})\b/g,
    minLength: 20,
  },
  {
    name: 'AWS access key',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    minLength: 20,
  },
  {
    name: 'AWS secret key',
    pattern: /\b(aws_secret_access_key\s*[=:]\s*)([a-zA-Z0-9+/]{40})\b/gi,
  },
  {
    name: 'OpenAI API key',
    pattern: /\b(sk-[a-zA-Z0-9]{32,})\b/g,
    minLength: 20,
  },
  {
    name: 'OpenAI project key',
    pattern: /\b(sk-proj-[a-zA-Z0-9_-]{20,})\b/g,
    minLength: 20,
  },
  {
    name: 'Anthropic API key',
    pattern: /\b(sk-ant(?:-[a-zA-Z0-9]+)?-[a-zA-Z0-9_-]{20,}(?:-ant-v2)?)\b/g,
    minLength: 20,
  },
  {
    name: 'Databricks token',
    pattern: /\b(dapi[a-zA-Z0-9]{32,})\b/g,
    minLength: 20,
  },
  {
    name: 'Supabase secret key',
    pattern: /\b(sb_secret_[a-zA-Z0-9_-]{20,})\b/g,
    minLength: 20,
  },
  {
    name: 'Supabase service role key assignment',
    pattern: /\b((?:SUPABASE_SERVICE_ROLE_KEY|supabase_service_role_key|service_role_key)\s*[=:]\s*)["']?([a-zA-Z0-9._-]{20,})["']?/gi,
  },
  {
    name: 'GitHub token',
    pattern: /\b(gh[ps]_[a-zA-Z0-9]{36,})\b/g,
    minLength: 20,
  },
  {
    name: 'GitHub OAuth token',
    pattern: /\b(gho_[a-zA-Z0-9]{36,})\b/g,
    minLength: 20,
  },
  {
    name: 'Google API key',
    pattern: /\b(AIza[0-9A-Za-z_-]{32,})\b/g,
    minLength: 30,
  },
  {
    name: 'Slack token',
    pattern: /\b(xox[baprs]-[0-9a-zA-Z-]{10,})\b/g,
    minLength: 15,
  },
  {
    name: 'NPM token',
    pattern: /\b(npm_[a-zA-Z0-9]{20,})\b/g,
    minLength: 20,
  },

  // JWT tokens
  {
    name: 'JWT token',
    pattern: /\b(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g,
    minLength: 50,
  },

  // Bearer tokens in headers (real tokens are typically <128 chars)
  {
    name: 'Bearer token',
    pattern: /(Bearer\s+)([a-zA-Z0-9_.-]{20,128})\b/gi,
  },

  // Authorization header values
  {
    name: 'Basic auth',
    pattern: /(Basic\s+)([a-zA-Z0-9+/]+={0,2})(?=\s|$)/gi,
  },

  // Key-value patterns (api_key=value, apiKey: value, etc.)
  // Note: Max quantifiers ({16,80}) prevent ReDoS via catastrophic backtracking
  // Upper bound of 80 covers most real API keys while limiting backtracking
  {
    name: 'API key assignment',
    pattern: /\b(api[_-]?key\s*[=:]\s*)["']?([a-zA-Z0-9_.-]{16,80})["']?/gi,
  },
  {
    name: 'Secret assignment',
    pattern: /\b([a-zA-Z_]*secret\s*[=:]\s*)["']?([a-zA-Z0-9_.-]{16,80})["']?/gi,
  },
  {
    name: 'Token assignment',
    pattern: /\b((?:access[_-]?)?token\s*[=:]\s*)["']?([a-zA-Z0-9_.-]{16,80})["']?/gi,
  },

  // Password patterns
  // Max quantifier {8,40} prevents ReDoS on long password-like strings
  {
    name: 'Password field',
    pattern: /\b((?:pass(?:word)?|pwd|passwd)\s*[=:]\s*)["']?([^\s"',;]{8,40})["']?/gi,
  },

  // Private keys (PEM format)
  {
    name: 'Private key block',
    pattern: /(-----BEGIN\s+(?:[A-Z]+\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:[A-Z]+\s+)?PRIVATE\s+KEY-----)/g,
  },

  // Generic hex strings that look like secrets (32+ chars)
  {
    name: 'Hex secret',
    pattern: /\b([a-f0-9]{32,64})\b/gi,
    minLength: 32,
  },

  // Connection strings with credentials
  // Bound password capture to {1,80} to prevent backtracking on malformed URLs
  {
    name: 'Database URL with password',
    pattern: /((?:postgres|mysql|mongodb|redis):\/\/[^:]+:)([^@]{1,80})(@)/gi,
  },
];

/** Maximum content length for regex-based redaction (ReDoS protection) */
const MAX_REDACTION_LENGTH = 50_000; // 50KB

/**
 * Redact secrets from a string based on known patterns.
 *
 * @param content - The string to scan for secrets
 * @returns The content with secrets replaced by [REDACTED]
 *
 * @example
 * ```typescript
 * const input = 'Using API key sk_live_abc123xyz...';
 * const output = redactSecrets(input);
 * // Output: 'Using API key [REDACTED]'
 * ```
 */
export function redactSecrets(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // ReDoS protection: cap content length for regex processing
  // Patterns with {16,256} quantifiers can cause O(n²) backtracking on malicious input
  let truncated = false;
  if (content.length > MAX_REDACTION_LENGTH) {
    content = content.slice(0, MAX_REDACTION_LENGTH);
    truncated = true;
  }

  let redacted = content;

  for (const { pattern, minLength } of SECRET_PATTERNS) {
    // Reset regex state (important for global patterns)
    pattern.lastIndex = 0;

    redacted = redacted.replace(pattern, (...args) => {
      // Handle patterns with multiple capture groups
      // The full match is args[0], capture groups follow
      const groups = args.slice(1, -2); // Exclude offset and full string

      if (groups.length === 1) {
        // Simple pattern with one capture group (the secret itself)
        const secret = groups[0];
        if (minLength && secret.length < minLength) {
          return args[0]; // Don't redact if too short
        }
        return REDACTED;
      } else if (groups.length >= 2) {
        // Pattern with prefix/suffix groups
        // Usually: [prefix, secret, optional suffix]
        const prefix = groups[0] || '';
        const secret = groups[1] || '';
        const suffix = groups[2] || '';

        if (minLength && secret.length < minLength) {
          return args[0]; // Don't redact if too short
        }
        return prefix + REDACTED + suffix;
      }

      return args[0]; // Fallback to original match
    });
  }

  // Append truncation notice if content was capped
  if (truncated) {
    redacted += '\n[... content truncated for security scanning ...]';
  }

  return redacted;
}

/**
 * Check if a string contains any detected secrets.
 *
 * @param content - The string to scan
 * @returns true if secrets were detected
 */
export function containsSecrets(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  for (const { pattern, minLength } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);

    if (match) {
      // Check minimum length if specified
      const secretGroup = match[1] || match[0];
      if (!minLength || secretGroup.length >= minLength) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Recursively redact secrets from an object's string values.
 *
 * @param obj - The object to process
 * @returns A new object with secrets redacted from all string values
 */
export function redactSecretsFromObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return redactSecrets(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecretsFromObject(item)) as T;
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactSecretsFromObject(value);
    }
    return result as T;
  }

  return obj;
}
