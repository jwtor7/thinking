/**
 * Unit tests for the secrets redaction module.
 *
 * Tests pattern-based secret detection and redaction functionality.
 */

import { describe, it, expect } from 'vitest';
import {
  redactSecrets,
  containsSecrets,
  redactSecretsFromObject,
} from './secrets.ts';

describe('redactSecrets', () => {
  describe('API key patterns', () => {
    it('should redact Stripe live secret keys', () => {
      const input = 'Using key sk_live_51ABC123def456ghij789klmno';
      const result = redactSecrets(input);
      expect(result).toBe('Using key [REDACTED]');
      expect(result).not.toContain('sk_live_');
    });

    it('should redact Stripe test secret keys', () => {
      const input = 'API: sk_test_51ABC123def456ghij789klmno';
      const result = redactSecrets(input);
      expect(result).toBe('API: [REDACTED]');
    });

    it('should redact Stripe publishable keys', () => {
      const input = 'pk_live_51ABC123def456ghij789klmno';
      const result = redactSecrets(input);
      expect(result).toBe('[REDACTED]');
    });

    it('should redact AWS access keys', () => {
      const input = 'AWS key: AKIAIOSFODNN7EXAMPLE';
      const result = redactSecrets(input);
      expect(result).toBe('AWS key: [REDACTED]');
      expect(result).not.toContain('AKIA');
    });

    it('should redact OpenAI API keys', () => {
      const input = 'Using sk-abcdef1234567890abcdef1234567890abcd';
      const result = redactSecrets(input);
      expect(result).toBe('Using [REDACTED]');
    });

    it('should redact OpenAI project keys', () => {
      const input = 'OPENAI_KEY=sk-proj-abcDEF0123456789_xyzABCDEFGHIJKLMNOP';
      const result = redactSecrets(input);
      expect(result).toBe('OPENAI_KEY=[REDACTED]');
    });

    it('should redact Anthropic API keys', () => {
      const input = 'Key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
      const result = redactSecrets(input);
      expect(result).toBe('Key: [REDACTED]');
    });

    it('should redact Anthropic API keys with -ant-v2 suffix', () => {
      const input = 'Key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890-ant-v2';
      const result = redactSecrets(input);
      expect(result).toBe('Key: [REDACTED]');
    });

    it('should redact GitHub personal access tokens', () => {
      const input = 'export GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
      const result = redactSecrets(input);
      expect(result).toBe('export GITHUB_TOKEN=[REDACTED]');
    });

    it('should redact GitHub OAuth tokens', () => {
      const input = 'Token: gho_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
      const result = redactSecrets(input);
      expect(result).toBe('Token: [REDACTED]');
    });

    it('should redact Google API keys', () => {
      const input = 'google: AIzaSyB-abcdefghijklmnopqrstuvwxyz123';
      const result = redactSecrets(input);
      expect(result).toBe('google: [REDACTED]');
    });

    it('should redact Slack tokens', () => {
      const input = 'slack_token=xoxb-1234567890-abcdefghij';
      const result = redactSecrets(input);
      expect(result).toBe('slack_token=[REDACTED]');
    });

    it('should redact NPM tokens', () => {
      const input = 'NPM_TOKEN=npm_abcdefghijklmnopqrstuvwxyz123456';
      const result = redactSecrets(input);
      expect(result).toBe('NPM_TOKEN=[REDACTED]');
    });

    it('should redact Databricks tokens', () => {
      const input = 'DATABRICKS_TOKEN=dapi1234567890abcdefghijklmnopqrstuv';
      const result = redactSecrets(input);
      expect(result).toBe('DATABRICKS_TOKEN=[REDACTED]');
    });

    it('should redact Supabase secret keys', () => {
      const input = 'SUPABASE_SECRET=sb_secret_abcdefghijklmnopqrstuvwxyz0123456789';
      const result = redactSecrets(input);
      expect(result).toBe('SUPABASE_SECRET=[REDACTED]');
    });

    it('should redact Supabase service role key assignments', () => {
      const input = 'SUPABASE_SERVICE_ROLE_KEY=supabase_service_role_abcdefghijklmnopqrstuvwxyz123456';
      const result = redactSecrets(input);
      expect(result).toBe('SUPABASE_SERVICE_ROLE_KEY=[REDACTED]');
    });
  });

  describe('JWT tokens', () => {
    it('should redact JWT tokens', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const input = `Bearer ${jwt}`;
      const result = redactSecrets(input);
      expect(result).not.toContain('eyJ');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact inline JWT tokens', () => {
      const input =
        'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = redactSecrets(input);
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiI');
    });
  });

  describe('Authorization headers', () => {
    it('should redact Bearer tokens while preserving prefix', () => {
      const input = 'Authorization: Bearer abc123def456ghi789jkl012mno';
      const result = redactSecrets(input);
      expect(result).toBe('Authorization: Bearer [REDACTED]');
    });

    it('should redact Basic auth while preserving prefix', () => {
      const input = 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=';
      const result = redactSecrets(input);
      expect(result).toBe('Authorization: Basic [REDACTED]');
    });
  });

  describe('Key-value assignments', () => {
    it('should redact api_key assignments', () => {
      const input = 'api_key=abcdef1234567890abcdef12';
      const result = redactSecrets(input);
      expect(result).toBe('api_key=[REDACTED]');
    });

    it('should redact apiKey assignments with colon', () => {
      const input = 'apiKey: "abcdef1234567890abcdef12"';
      const result = redactSecrets(input);
      expect(result).toBe('apiKey: [REDACTED]');
    });

    it('should redact secret assignments', () => {
      const input = 'client_secret=abcdefghijklmnopqrstuvwx';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact token assignments', () => {
      const input = 'access_token: abcdefghijklmnopqrstuvwx';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('Password patterns', () => {
    it('should redact password= assignments', () => {
      const input = 'password=MySecretPass123!';
      const result = redactSecrets(input);
      expect(result).toBe('password=[REDACTED]');
      expect(result).not.toContain('MySecretPass');
    });

    it('should redact pwd= assignments', () => {
      const input = 'pwd=secretPassword';
      const result = redactSecrets(input);
      expect(result).toBe('pwd=[REDACTED]');
    });

    it('should redact passwd: assignments', () => {
      const input = 'passwd: "my_password_123"';
      const result = redactSecrets(input);
      expect(result).toBe('passwd: [REDACTED]');
    });

    it('should redact quoted passwords', () => {
      const input = "password='MySecretPassword'";
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('MySecretPassword');
    });
  });

  describe('Private keys', () => {
    it('should redact private key headers', () => {
      const input = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact RSA private key headers', () => {
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCA...\n-----END RSA PRIVATE KEY-----';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact full private key blocks including body and footer', () => {
      const input = [
        '-----BEGIN PRIVATE KEY-----',
        'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...',
        '-----END PRIVATE KEY-----',
      ].join('\n');
      const result = redactSecrets(input);
      expect(result).toBe('[REDACTED]');
      expect(result).not.toContain('MIIEvQIB');
      expect(result).not.toContain('END PRIVATE KEY');
    });
  });

  describe('Database URLs', () => {
    it('should redact postgres connection string passwords', () => {
      const input = 'DATABASE_URL=postgres://user:secretpassword@localhost:5432/db';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('secretpassword');
      expect(result).toContain('postgres://user:');
      expect(result).toContain('@localhost:5432/db');
    });

    it('should redact mysql connection string passwords', () => {
      const input = 'mysql://admin:hunter2@db.example.com/mydb';
      const result = redactSecrets(input);
      expect(result).not.toContain('hunter2');
    });

    it('should redact mongodb connection string passwords', () => {
      const input = 'mongodb://dbuser:dbpassword123@cluster.mongodb.net/test';
      const result = redactSecrets(input);
      expect(result).not.toContain('dbpassword123');
    });

    it('should redact redis connection string passwords', () => {
      const input = 'redis://default:myredispassword@redis.io:6379';
      const result = redactSecrets(input);
      expect(result).not.toContain('myredispassword');
    });
  });

  describe('Hex secrets', () => {
    it('should redact 32-character hex strings', () => {
      const input = 'secret=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact 64-character hex strings', () => {
      const input =
        'key=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should not redact short hex strings', () => {
      const input = 'commit=abc123f';
      const result = redactSecrets(input);
      expect(result).toBe(input);
    });
  });

  describe('Edge cases', () => {
    it('should handle null input', () => {
      expect(redactSecrets(null as unknown as string)).toBe(null);
    });

    it('should handle undefined input', () => {
      expect(redactSecrets(undefined as unknown as string)).toBe(undefined);
    });

    it('should handle empty string', () => {
      expect(redactSecrets('')).toBe('');
    });

    it('should handle string without secrets', () => {
      const input = 'This is a normal log message without any secrets';
      expect(redactSecrets(input)).toBe(input);
    });

    it('should handle multiple secrets in one string', () => {
      const input =
        'Using sk_live_51ABC123def456ghij789klmno with password=secret123 and token=abcdefghijklmnopqrstuvwx';
      const result = redactSecrets(input);
      expect(result).not.toContain('sk_live_');
      expect(result).not.toContain('secret123');
      expect(result.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle non-string input', () => {
      expect(redactSecrets(123 as unknown as string)).toBe(123);
      expect(redactSecrets({} as unknown as string)).toEqual({});
    });

    it('should not over-redact normal text', () => {
      const input = 'The password field is required. Please enter your API key.';
      const result = redactSecrets(input);
      // Should not redact these phrases as they are not actual secrets
      expect(result).toContain('password field is required');
      expect(result).toContain('API key');
    });
  });
});

describe('containsSecrets', () => {
  it('should return true for strings with API keys', () => {
    expect(containsSecrets('key=sk_live_51ABC123def456ghij789klmno')).toBe(true);
  });

  it('should return true for strings with passwords', () => {
    expect(containsSecrets('password=supersecret123')).toBe(true);
  });

  it('should return true for strings with JWT tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(containsSecrets(jwt)).toBe(true);
  });

  it('should return false for normal strings', () => {
    expect(containsSecrets('This is a normal log message')).toBe(false);
  });

  it('should return false for null', () => {
    expect(containsSecrets(null as unknown as string)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(containsSecrets(undefined as unknown as string)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(containsSecrets('')).toBe(false);
  });
});

describe('redactSecretsFromObject', () => {
  it('should redact secrets from string values in objects', () => {
    const input = {
      message: 'Using password=secret123',
      config: 'api_key=abcdefghijklmnopqrstuvwx',
    };
    const result = redactSecretsFromObject(input);
    expect(result.message).toContain('[REDACTED]');
    expect(result.message).not.toContain('secret123');
    expect(result.config).toContain('[REDACTED]');
  });

  it('should handle nested objects', () => {
    const input = {
      level1: {
        level2: {
          secret: 'password=nestedSecret',
        },
      },
    };
    const result = redactSecretsFromObject(input);
    expect(result.level1.level2.secret).toContain('[REDACTED]');
    expect(result.level1.level2.secret).not.toContain('nestedSecret');
  });

  it('should handle arrays', () => {
    const input = ['password=secretvalue1', 'password=secretvalue2'];
    const result = redactSecretsFromObject(input);
    expect(result[0]).toContain('[REDACTED]');
    expect(result[1]).toContain('[REDACTED]');
  });

  it('should handle mixed arrays with objects', () => {
    const input = [
      { key: 'api_key=abcdefghijklmnopqrstuvwx' },
      'password=arraySecret',
    ];
    const result = redactSecretsFromObject(input);
    expect((result[0] as { key: string }).key).toContain('[REDACTED]');
    expect(result[1]).toContain('[REDACTED]');
  });

  it('should preserve non-string values', () => {
    const input = {
      count: 42,
      active: true,
      data: null,
      items: [1, 2, 3],
    };
    const result = redactSecretsFromObject(input);
    expect(result).toEqual(input);
  });

  it('should return primitives unchanged', () => {
    expect(redactSecretsFromObject(42)).toBe(42);
    expect(redactSecretsFromObject(true)).toBe(true);
    expect(redactSecretsFromObject(null)).toBe(null);
  });

  it('should redact plain string input', () => {
    const result = redactSecretsFromObject('password=mySecret');
    expect(result).toContain('[REDACTED]');
  });
});

describe('ReDoS protection', () => {
  it('should complete redaction within 100ms for pathological input', () => {
    // Create pathological input that would cause backtracking in unbounded patterns
    // Pattern: api_key="aaa...aaa" followed by non-matching suffix
    const attack = 'api_key="' + 'a'.repeat(200) + '"' + ' '.repeat(1000);
    const start = performance.now();
    redactSecrets(attack);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100); // Should complete fast with bounded quantifiers
  });

  it('should complete redaction within 100ms for password-like pathological input', () => {
    // Pathological password pattern input
    const attack = 'password=' + 'x'.repeat(300) + ' ' + 'y'.repeat(500);
    const start = performance.now();
    redactSecrets(attack);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('should complete redaction within 100ms for database URL pathological input', () => {
    // Pathological database URL pattern
    const attack = 'postgres://user:' + 'p'.repeat(200) + 'invalid' + '@'.repeat(100);
    const start = performance.now();
    redactSecrets(attack);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('should complete redaction within 100ms for Bearer token pathological input', () => {
    // Pathological Bearer token input
    const attack = 'Bearer ' + 'a'.repeat(300) + ' '.repeat(500);
    const start = performance.now();
    redactSecrets(attack);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('should truncate very large input to prevent ReDoS', () => {
    // Input larger than MAX_REDACTION_LENGTH (50KB)
    const largeInput = 'api_key=valid123456789012345 ' + 'x'.repeat(60000);
    const result = redactSecrets(largeInput);
    expect(result).toContain('[... content truncated for security scanning ...]');
  });
});

describe('Legitimate secrets still detected with bounded quantifiers', () => {
  it('should detect 32-character API key', () => {
    const input = 'api_key=abcdefghijklmnopqrstuvwxyz123456';
    const result = redactSecrets(input);
    expect(result).toBe('api_key=[REDACTED]');
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('should detect 64-character API key', () => {
    const input = 'api_key=abcdefghijklmnopqrstuvwxyz123456abcdefghijklmnopqrstuvwxyz12';
    const result = redactSecrets(input);
    expect(result).toBe('api_key=[REDACTED]');
  });

  it('should detect 80-character API key (upper bound)', () => {
    const input = 'api_key=' + 'a'.repeat(80);
    const result = redactSecrets(input);
    expect(result).toBe('api_key=[REDACTED]');
  });

  it('should detect 20-character Bearer token', () => {
    const input = 'Authorization: Bearer abcdefghij1234567890';
    const result = redactSecrets(input);
    expect(result).toBe('Authorization: Bearer [REDACTED]');
  });

  it('should detect 128-character Bearer token (upper bound)', () => {
    const input = 'Bearer ' + 'x'.repeat(128);
    const result = redactSecrets(input);
    expect(result).toBe('Bearer [REDACTED]');
  });

  it('should detect database URL with password', () => {
    const input = 'postgres://admin:mysupersecretpassword@db.example.com:5432/mydb';
    const result = redactSecrets(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('mysupersecretpassword');
    expect(result).toContain('postgres://admin:');
    expect(result).toContain('@db.example.com:5432/mydb');
  });

  it('should detect database URL with 80-character password (upper bound)', () => {
    const password = 'p'.repeat(80);
    const input = `mysql://user:${password}@host/db`;
    const result = redactSecrets(input);
    expect(result).not.toContain(password);
    expect(result).toContain('[REDACTED]');
  });
});

describe('Boundary behavior with bounded quantifiers', () => {
  it('should redact first 80 chars of API key when longer than 80 characters', () => {
    // With bounded quantifiers, regex matches up to the bound
    // API key pattern doesn't require trailing anchor, so partial match occurs
    const longKey = 'a'.repeat(81);
    const input = `api_key=${longKey}`;
    const result = redactSecrets(input);
    // Greedy match: first 80 chars are redacted, 81st char remains
    expect(result).toBe('api_key=[REDACTED]a');
  });

  it('should NOT redact database password longer than 80 characters', () => {
    // Database URL pattern requires @ immediately after password
    // With {1,80} bound, patterns over 80 chars don't match at all
    const longPassword = 'p'.repeat(81);
    const input = `postgres://user:${longPassword}@host/db`;
    const result = redactSecrets(input);
    // Pattern fails to match - @ is at position 81, not within bound
    expect(result).toBe(input);
  });

  it('should detect Bearer token up to 128 characters', () => {
    const token = 'x'.repeat(128);
    const input = `Bearer ${token}`;
    const result = redactSecrets(input);
    expect(result).toBe('Bearer [REDACTED]');
  });

  it('should NOT redact Bearer token over 128 characters', () => {
    // Bearer pattern uses word boundary \b after token
    // With {20,128} bound, patterns over 128 chars don't match at all
    const longToken = 'x'.repeat(129);
    const input = `Bearer ${longToken}`;
    const result = redactSecrets(input);
    // Pattern fails to match entirely
    expect(result).toBe(input);
  });
});
