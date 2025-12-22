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

    it('should redact Anthropic API keys', () => {
      const input = 'Key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
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
      const input = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact RSA private key headers', () => {
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCA...';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
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
