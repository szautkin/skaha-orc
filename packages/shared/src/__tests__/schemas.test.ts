import { deployAllRequestSchema, serviceIdSchema } from '../validation/schemas';

describe('serviceIdSchema', () => {
  it('accepts valid service IDs', () => {
    expect(serviceIdSchema.safeParse('base').success).toBe(true);
    expect(serviceIdSchema.safeParse('skaha').success).toBe(true);
    expect(serviceIdSchema.safeParse('mock-ac').success).toBe(true);
    expect(serviceIdSchema.safeParse('posix-mapper-db').success).toBe(true);
  });

  it('rejects invalid service IDs', () => {
    expect(serviceIdSchema.safeParse('invalid-service').success).toBe(false);
    expect(serviceIdSchema.safeParse('').success).toBe(false);
    expect(serviceIdSchema.safeParse('BASE').success).toBe(false);
  });
});

describe('deployAllRequestSchema', () => {
  it('accepts valid request with known service IDs', () => {
    const result = deployAllRequestSchema.safeParse({
      serviceIds: ['base', 'volumes', 'skaha'],
      dryRun: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects request with unknown service ID', () => {
    const result = deployAllRequestSchema.safeParse({
      serviceIds: ['base', 'unknown-service'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty serviceIds', () => {
    const result = deployAllRequestSchema.safeParse({
      serviceIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('defaults dryRun to false', () => {
    const result = deployAllRequestSchema.safeParse({
      serviceIds: ['base'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dryRun).toBe(false);
    }
  });

  it('accepts all 14 service IDs', () => {
    const result = deployAllRequestSchema.safeParse({
      serviceIds: [
        'base', 'haproxy', 'reg', 'volumes', 'posix-mapper-db',
        'posix-mapper', 'mock-ac', 'skaha', 'cavern', 'science-portal',
        'storage-ui', 'doi', 'dex', 'keycloak',
      ],
    });
    expect(result.success).toBe(true);
  });
});
