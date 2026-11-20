import test from 'node:test';
import assert from 'node:assert/strict';
import { LIGHTING_ASSUMPTIONS, getLightingEquivalent, lightingForYear } from '../src/lib/lighting.ts';
import { YEARS } from '../src/data/alpiq.ts';

test('2025 production equals about 2.465 equivalent regional lighting days worldwide', () => {
  const value = lightingForYear(YEARS.find(y => y.year === 2025)!);
  assert.ok(value);
  assert.ok(Math.abs(value.energyTwh - 14.86) < 1e-9);
  assert.ok(Math.abs(value.earthEquivalents - 0.0067545) < 0.000001);
  assert.ok(Math.abs(value.equivalentLightingDays - 2.4654) < 0.002);
  assert.ok(Math.abs(value.demandCoveredRatio * 100 - 0.675) < 0.002);
});

test('H1 2026 uses its own 181-day period for the lighting-demand percentage', () => {
  const value = lightingForYear(YEARS.find(y => y.year === 2026)!);
  assert.ok(value);
  assert.equal(value.days, 181);
  assert.ok(Math.abs(value.energyTwh - 7.758) < 1e-9);
  assert.ok(Math.abs(value.equivalentLightingDays - 1.2871) < 0.002);
  assert.ok(Math.abs(value.demandCoveredRatio * 100 - 0.7111) < 0.002);
});

test('2024 leap-year reporting period and invalid energy inputs are handled', () => {
  const value = lightingForYear(YEARS.find(y => y.year === 2024)!);
  assert.ok(value);
  assert.equal(value.days, 366);
  assert.ok(Math.abs(value.equivalentLightingDays - 2.8671) < 0.002);
  assert.equal(getLightingEquivalent(-1, 365), null);
  assert.equal(getLightingEquivalent(1, 0), null);
  assert.equal(getLightingEquivalent(Number.NaN, 365), null);
  assert.equal(LIGHTING_ASSUMPTIONS.globalLightingTwhPerYear, 2200);
});

test('percentage compares production with lighting demand over the same reporting period', () => {
  const year = YEARS.find(y => y.year === 2025)!;
  const ch = lightingForYear(year, 'switzerland');
  const eu = lightingForYear(year, 'europe');
  const world = lightingForYear(year, 'world');
  assert.ok(ch && eu && world);
  assert.ok(Math.abs(ch.demandTwhForPeriod - 4.2) < 1e-9);
  assert.ok(Math.abs(ch.demandCoveredRatio * 100 - 353.8095) < 0.01);
  assert.ok(Math.abs(eu.demandCoveredRatio * 100 - 7.6205) < 0.01);
  assert.ok(Math.abs(world.demandCoveredRatio * 100 - 0.67545) < 0.001);
});

test('H1 2026 uses 181 days of regional lighting demand for the percentage', () => {
  const year = YEARS.find(y => y.year === 2026)!;
  const ch = lightingForYear(year, 'switzerland');
  const eu = lightingForYear(year, 'europe');
  const world = lightingForYear(year, 'world');
  assert.ok(ch && eu && world);
  assert.ok(Math.abs(ch.demandTwhForPeriod - 4.2 * 181 / 365) < 1e-9);
  assert.ok(Math.abs(ch.demandCoveredRatio * 100 - 372.49) < 0.02);
  assert.ok(Math.abs(eu.demandCoveredRatio * 100 - 8.02) < 0.02);
  assert.ok(Math.abs(world.demandCoveredRatio * 100 - 0.7111) < 0.002);
});
