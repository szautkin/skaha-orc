import {
  platformOidcSettingsSchema,
  deployRequestSchema,
  deployAllRequestSchema,
  extraHostSchema,
} from '../validation/schemas';

describe('platformOidcSettingsSchema', () => {
  const validSettings = {
    issuerUri: 'https://dex.example.com',
    sciencePortal: {
      clientID: 'sp-client',
      clientSecret: 'sp-secret',
      redirectURI: 'https://example.com/redirect',
      callbackURI: 'https://example.com/callback',
      scope: 'openid profile',
    },
    storageUi: {
      clientID: 'su-client',
      clientSecret: 'su-secret',
      redirectURI: 'https://example.com/su-redirect',
      callbackURI: 'https://example.com/su-callback',
      scope: 'openid',
    },
    skaha: {
      clientID: 'skaha-client',
      clientSecret: 'skaha-secret',
      redirectURI: 'https://example.com/skaha-redirect',
      callbackURI: 'https://example.com/skaha-callback',
      scope: 'openid profile offline_access',
    },
  };

  it('accepts valid settings', () => {
    const result = platformOidcSettingsSchema.safeParse(validSettings);
    expect(result.success).toBe(true);
  });

  it('rejects when skaha field is missing', () => {
    const { skaha: _, ...withoutSkaha } = validSettings;
    const result = platformOidcSettingsSchema.safeParse(withoutSkaha);
    expect(result.success).toBe(false);
  });

  it('rejects non-URL issuerUri', () => {
    const result = platformOidcSettingsSchema.safeParse({
      ...validSettings,
      issuerUri: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty clientID', () => {
    const result = platformOidcSettingsSchema.safeParse({
      ...validSettings,
      sciencePortal: { ...validSettings.sciencePortal, clientID: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing sections', () => {
    const result = platformOidcSettingsSchema.safeParse({
      issuerUri: 'https://dex.example.com',
    });
    expect(result.success).toBe(false);
  });
});

describe('deployRequestSchema', () => {
  it('accepts empty object (dryRun defaults to false)', () => {
    const result = deployRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dryRun).toBe(false);
    }
  });

  it('accepts { dryRun: true }', () => {
    const result = deployRequestSchema.safeParse({ dryRun: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dryRun).toBe(true);
    }
  });
});

describe('deployAllRequestSchema', () => {
  it('accepts valid request', () => {
    const result = deployAllRequestSchema.safeParse({
      serviceIds: ['base', 'skaha'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty serviceIds', () => {
    const result = deployAllRequestSchema.safeParse({
      serviceIds: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('extraHostSchema', () => {
  it('accepts valid host', () => {
    const result = extraHostSchema.safeParse({ ip: '10.0.0.1', hostname: 'example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects empty ip', () => {
    const result = extraHostSchema.safeParse({ ip: '', hostname: 'example.com' });
    expect(result.success).toBe(false);
  });

  it('rejects empty hostname', () => {
    const result = extraHostSchema.safeParse({ ip: '10.0.0.1', hostname: '' });
    expect(result.success).toBe(false);
  });
});
