import { describe, expect, it } from 'vitest';
import { canGrant, CONSENT_COPY, retentionFacts, retentionState } from '../../app/utils/cloudSync/consentView';
import type { ConsentViewDto } from '../../app/utils/cloudSync/types';

const baseConfiguration: Record<string, string | number> = {
   noticeVersion: '2026-09-20',
   sessionCurrentCopyRetentionDays: 90,
   templateRetentionDays: 90,
   profileRetentionDays: 90,
   checkpointRetentionDays: 30,
   retentionExtensionDays: 7,
};

function makeConsent(partial: Partial<ConsentViewDto> = {}): ConsentViewDto {
   return {
      policyVersion: '2026-09-20',
      retentionConfiguration: { ...baseConfiguration },
      retentionConfigurationMissing: [],
      retentionAcknowledgement: { acknowledgedVersion: '2026-09-20', acknowledgedAt: '2026-11-20T00:00:00.000Z' },
      cloudSessions: { granted: false, changedAt: null },
      cloudTemplates: { granted: false, changedAt: null },
      cloudProfiles: { granted: false, changedAt: null },
      ...partial,
   };
}

describe('retentionState', () => {
   it('is unconfigured when the retention configuration is null', () => {
      expect(retentionState(makeConsent({ retentionConfiguration: null }))).toBe('unconfigured');
   });
   it('is unconfigured when any retention value is missing', () => {
      expect(retentionState(makeConsent({ retentionConfigurationMissing: ['templateRetentionDays'] }))).toBe('unconfigured');
   });
   it('needs acknowledgement when the shown notice version is not confirmed', () => {
      const consent = makeConsent({ retentionAcknowledgement: { acknowledgedVersion: null, acknowledgedAt: null } });
      expect(retentionState(consent)).toBe('needs-acknowledgement');
   });
   it('is acknowledged when the confirmed version matches the notice version', () => {
      expect(retentionState(makeConsent())).toBe('acknowledged');
   });
});

describe('canGrant', () => {
   it('allows granting every category once acknowledged', () => {
      for (const category of ['cloudSessions', 'cloudTemplates', 'cloudProfiles'] as const) {
         expect(canGrant(makeConsent(), category)).toEqual({ allowed: true, reason: null });
      }
   });
   it('blocks granting while the notice needs acknowledgement and names the category', () => {
      const consent = makeConsent({ retentionAcknowledgement: { acknowledgedVersion: null, acknowledgedAt: null } });
      const result = canGrant(consent, 'cloudSessions');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('CV sessions');
   });
   it('blocks granting while retention is unconfigured', () => {
      const result = canGrant(makeConsent({ retentionConfiguration: null }), 'cloudProfiles');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not configured');
   });
});

describe('retentionFacts', () => {
   it('lists the five durations as N days plus the notice version', () => {
      expect(retentionFacts(makeConsent())).toEqual([
         { label: 'Current CV sessions kept', value: '90 days' },
         { label: 'CV templates kept', value: '90 days' },
         { label: 'Profiles kept', value: '90 days' },
         { label: 'Earlier versions kept', value: '30 days' },
         { label: 'Retention extension', value: '7 days' },
         { label: 'Notice version', value: '2026-09-20' },
      ]);
   });
   it('is empty while unconfigured', () => {
      expect(retentionFacts(makeConsent({ retentionConfiguration: null }))).toEqual([]);
   });
});

describe('CONSENT_COPY', () => {
   it('covers all three categories with title, body and detail', () => {
      for (const category of ['cloudSessions', 'cloudTemplates', 'cloudProfiles'] as const) {
         expect(CONSENT_COPY[category].title.length).toBeGreaterThan(0);
         expect(CONSENT_COPY[category].body.length).toBeGreaterThan(0);
         expect(CONSENT_COPY[category].detail.length).toBeGreaterThan(0);
      }
   });
});
