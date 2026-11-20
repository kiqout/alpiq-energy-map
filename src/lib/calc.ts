// Pure calculation helpers (no UI). Units are converted via SI base: W and Wh.
export const ENERGY_UNITS = { Wh: 1, kWh: 1e3, MWh: 1e6, GWh: 1e9, TWh: 1e12 } as const;
export const POWER_UNITS = { W: 1, kW: 1e3, MW: 1e6, GW: 1e9 } as const;
export const DURATION_UNITS = { h: 1, d: 24, y: 8760 } as const; // hours; y = 365 d
export type EnergyUnit = keyof typeof ENERGY_UNITS;
export type PowerUnit = keyof typeof POWER_UNITS;
export type DurationUnit = keyof typeof DURATION_UNITS;

export const toWh = (v: number, u: EnergyUnit) => v * ENERGY_UNITS[u];
export const fromWh = (wh: number, u: EnergyUnit) => wh / ENERGY_UNITS[u];
export const convertEnergy = (v: number, from: EnergyUnit, to: EnergyUnit) => fromWh(toWh(v, from), to);

/** Energy = Power × Time × Capacity Factor (capacityFactor in 0..1). Returns Wh. */
export function powerToEnergyWh(p: number, pu: PowerUnit, dur: number, du: DurationUnit, capacityFactor = 1): number {
  return p * POWER_UNITS[pu] * dur * DURATION_UNITS[du] * capacityFactor;
}

/** Pick the most readable energy unit for a Wh value. */
export function bestEnergyUnit(wh: number): EnergyUnit {
  const a = Math.abs(wh);
  for (const u of ['TWh', 'GWh', 'MWh', 'kWh'] as EnergyUnit[]) if (a >= ENERGY_UNITS[u]) return u;
  return a >= 1 ? 'Wh' : 'Wh';
}

/** Emissions in tonnes CO2e for energy (Wh) at an intensity in g CO2e/kWh. */
export const emissionsTonnes = (wh: number, gPerKwh: number) => (wh / 1e3) * gPerKwh / 1e6;

/** Avoided CO2 = Energy × (Reference − Generation). Never negative-clamped: negative means higher than reference. */
export const avoidedTonnes = (wh: number, refG: number, genG: number) => emissionsTonnes(wh, refG - genG);

export const reductionPct = (refG: number, genG: number) => (refG > 0 ? ((refG - genG) / refG) * 100 : NaN);

/** Equivalent number of trees absorbing the given tonnes CO2 over one year. */
export const treeEquivalents = (tonnes: number, kgPerTreePerYear: number) => (tonnes * 1000) / kgPerTreePerYear;

export const yoyPct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : NaN);
