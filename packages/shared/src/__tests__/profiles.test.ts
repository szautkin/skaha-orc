import { DEPLOYMENT_PROFILES } from '../constants/catalog';
import { SERVICE_IDS } from '../types/services';
import type { ServiceId } from '../types/services';

describe('DEPLOYMENT_PROFILES', () => {
  it('has 4 profiles', () => {
    expect(DEPLOYMENT_PROFILES).toHaveLength(4);
  });

  it('includes standard, production, minimal, and full', () => {
    const ids = DEPLOYMENT_PROFILES.map((p) => p.id);
    expect(ids).toEqual(['standard', 'production', 'minimal', 'full']);
  });

  it('each profile contains only valid SERVICE_IDS with no duplicates', () => {
    const validIds = new Set<string>(SERVICE_IDS);
    for (const profile of DEPLOYMENT_PROFILES) {
      for (const svcId of profile.serviceIds) {
        expect(validIds.has(svcId)).toBe(true);
      }
      // no duplicates
      expect(new Set(profile.serviceIds).size).toBe(profile.serviceIds.length);
    }
  });

  it('standard includes core + recommended + haproxy + dex but not keycloak', () => {
    const standard = DEPLOYMENT_PROFILES.find((p) => p.id === 'standard')!;
    expect(standard.serviceIds).toContain('base');
    expect(standard.serviceIds).toContain('skaha');
    expect(standard.serviceIds).toContain('cavern');
    expect(standard.serviceIds).toContain('haproxy');
    expect(standard.serviceIds).toContain('dex');
    expect(standard.serviceIds).not.toContain('keycloak');
  });

  it('production includes core + recommended + haproxy + keycloak but not dex', () => {
    const production = DEPLOYMENT_PROFILES.find((p) => p.id === 'production')!;
    expect(production.serviceIds).toContain('base');
    expect(production.serviceIds).toContain('skaha');
    expect(production.serviceIds).toContain('cavern');
    expect(production.serviceIds).toContain('haproxy');
    expect(production.serviceIds).toContain('keycloak');
    expect(production.serviceIds).not.toContain('dex');
  });

  it('minimal includes only core tier services', () => {
    const minimal = DEPLOYMENT_PROFILES.find((p) => p.id === 'minimal')!;
    const coreTier: ServiceId[] = ['base', 'reg', 'volumes', 'posix-mapper-db', 'posix-mapper', 'skaha'];
    expect(new Set(minimal.serviceIds)).toEqual(new Set(coreTier));
  });

  it('full includes all 13 services', () => {
    const full = DEPLOYMENT_PROFILES.find((p) => p.id === 'full')!;
    expect(full.serviceIds).toHaveLength(13);
    expect(new Set(full.serviceIds)).toEqual(new Set(SERVICE_IDS));
  });
});
