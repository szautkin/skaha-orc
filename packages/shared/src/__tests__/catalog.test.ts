import { SERVICE_CATALOG, getDeploymentOrder, getServicesByTier } from '../constants/catalog';
import { SERVICE_IDS } from '../types/services';
import type { ServiceId } from '../types/services';

describe('getDeploymentOrder', () => {
  it('returns all 14 services when called with no args', () => {
    const order = getDeploymentOrder();
    expect(order).toHaveLength(14);
    expect(new Set(order)).toEqual(new Set(SERVICE_IDS));
  });

  it('places base before posix-mapper', () => {
    const order = getDeploymentOrder();
    expect(order.indexOf('base')).toBeLessThan(order.indexOf('posix-mapper'));
  });

  it('places posix-mapper-db before posix-mapper', () => {
    const order = getDeploymentOrder();
    expect(order.indexOf('posix-mapper-db')).toBeLessThan(order.indexOf('posix-mapper'));
  });

  it('places skaha before science-portal', () => {
    const order = getDeploymentOrder();
    expect(order.indexOf('skaha')).toBeLessThan(order.indexOf('science-portal'));
  });

  it('places posix-mapper before cavern', () => {
    const order = getDeploymentOrder();
    expect(order.indexOf('posix-mapper')).toBeLessThan(order.indexOf('cavern'));
  });

  it('returns only selected services in valid order', () => {
    const subset: ServiceId[] = ['base', 'reg', 'posix-mapper-db', 'posix-mapper', 'volumes'];
    const order = getDeploymentOrder(subset);
    expect(order).toHaveLength(5);
    expect(new Set(order)).toEqual(new Set(subset));
    // reg depends on base
    expect(order.indexOf('base')).toBeLessThan(order.indexOf('reg'));
    // posix-mapper depends on reg and posix-mapper-db
    expect(order.indexOf('reg')).toBeLessThan(order.indexOf('posix-mapper'));
    expect(order.indexOf('posix-mapper-db')).toBeLessThan(order.indexOf('posix-mapper'));
  });

  it('returns empty array for empty input', () => {
    const order = getDeploymentOrder([] as ServiceId[]);
    expect(order).toEqual([]);
  });

  it('produces deterministic output', () => {
    const first = getDeploymentOrder();
    const second = getDeploymentOrder();
    expect(first).toEqual(second);
  });
});

describe('getServicesByTier', () => {
  it('returns all three tiers', () => {
    const tiers = getServicesByTier();
    expect(Object.keys(tiers).sort()).toEqual(['core', 'recommended', 'site']);
  });

  it('places every SERVICE_ID in exactly one tier', () => {
    const tiers = getServicesByTier();
    const allIds = [...tiers.core, ...tiers.recommended, ...tiers.site];
    expect(allIds).toHaveLength(SERVICE_IDS.length);
    expect(new Set(allIds)).toEqual(new Set(SERVICE_IDS));
  });

  it('assigns core tier correctly', () => {
    const tiers = getServicesByTier();
    const expectedCore: ServiceId[] = ['base', 'reg', 'volumes', 'posix-mapper-db', 'posix-mapper', 'cavern', 'skaha'];
    for (const id of expectedCore) {
      expect(tiers.core).toContain(id);
    }
  });

  it('assigns recommended tier correctly', () => {
    const tiers = getServicesByTier();
    const expectedRecommended: ServiceId[] = ['science-portal', 'storage-ui'];
    for (const id of expectedRecommended) {
      expect(tiers.recommended).toContain(id);
    }
  });

  it('assigns site tier correctly', () => {
    const tiers = getServicesByTier();
    const expectedSite: ServiceId[] = ['haproxy', 'mock-ac', 'doi', 'dex', 'keycloak'];
    for (const id of expectedSite) {
      expect(tiers.site).toContain(id);
    }
  });

  it('matches each service definition tier field', () => {
    const tiers = getServicesByTier();
    for (const [tier, ids] of Object.entries(tiers)) {
      for (const id of ids) {
        expect(SERVICE_CATALOG[id as ServiceId].tier).toBe(tier);
      }
    }
  });
});
