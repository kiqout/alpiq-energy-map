import type { YearData } from '../data/alpiq';

export const LIGHTING_ASSUMPTIONS = {
  globalLightingTwhPerYear: 2200,
  globalLightingSource: 'https://www.iea.org/commentaries/the-next-wave-of-led-deployment-smarter-circular-and-more-efficient',
} as const;

export type Region = 'switzerland' | 'europe' | 'world';
export const REGIONS: { id: Region; label: string; scope: string }[] = [
  { id: 'switzerland', label: 'Switzerland', scope: 'Switzerland' },
  { id: 'europe', label: 'Europe', scope: 'Europe (EU-27)' },
  { id: 'world', label: 'World', scope: 'the world' },
];

// Estimated annual building + outdoor lighting demand (TWh/year).
// Switzerland and EU-27 are planning estimates; World uses the IEA reference.
export const REGIONAL_LIGHTING_TWH_PER_YEAR: Record<Region, number> = {
  switzerland: 4.2,
  europe: 195,
  world: LIGHTING_ASSUMPTIONS.globalLightingTwhPerYear,
};

export interface LightingEquivalent {
  days: number;
  energyTwh: number;
  /** Estimated lighting demand over the exact reporting period. */
  demandTwhForPeriod: number;
  /** Production divided by lighting demand over the same reporting period. */
  demandCoveredRatio: number;
  /** Backwards-compatible alias used by the existing headline display. */
  globalLightingShare: number;
  /** Backwards-compatible alias; this is for the selected region, not only the world. */
  worldLightingDays: number;
  /** Clear name for equivalent days in the selected region. */
  equivalentLightingDays: number;
  /** Backwards-compatible legacy field. */
  globalLightingTwhForPeriod: number;
  earthEquivalents: number;
  region: Region;
  annualDemandTwh: number;
}

export function getLightingEquivalent(totalGwh: number, days: number, region: Region = 'world'): LightingEquivalent | null {
  if (!Number.isFinite(totalGwh) || totalGwh < 0 || !Number.isFinite(days) || days <= 0) return null;

  const energyTwh = totalGwh / 1000;
  const annualDemandTwh = REGIONAL_LIGHTING_TWH_PER_YEAR[region];
  const demandTwhForPeriod = annualDemandTwh * days / 365;
  const demandCoveredRatio = energyTwh / demandTwhForPeriod;
  const equivalentLightingDays = energyTwh / annualDemandTwh * 365;

  return {
    days,
    energyTwh,
    demandTwhForPeriod,
    demandCoveredRatio,
    globalLightingShare: demandCoveredRatio,
    worldLightingDays: equivalentLightingDays,
    equivalentLightingDays,
    globalLightingTwhForPeriod: demandTwhForPeriod,
    earthEquivalents: energyTwh / annualDemandTwh,
    region,
    annualDemandTwh,
  };
}

export function lightingForYear(year: YearData, region: Region = 'world') {
  if (year.totalGwh == null) return null;
  return getLightingEquivalent(year.totalGwh, year.periodDays, region);
}
