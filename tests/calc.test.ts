import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/lib/calc.ts';
import { YEARS } from '../src/data/alpiq.ts';

test('unit conversions', () => {
  assert.equal(c.convertEnergy(1, 'GWh', 'MWh'), 1000);
  assert.equal(c.convertEnergy(1, 'TWh', 'GWh'), 1000);
  assert.equal(c.convertEnergy(1, 'kWh', 'Wh'), 1000);
});

test('1 MW for 1 h = 1 MWh; capacity factor', () => {
  assert.equal(c.fromWh(c.powerToEnergyWh(1, 'MW', 1, 'h'), 'MWh'), 1);
  assert.equal(c.fromWh(c.powerToEnergyWh(1, 'GW', 1, 'y', 0.5), 'GWh'), 4380);
});

test('avoided CO2 and tree equivalents', () => {
  const wh = c.toWh(1, 'GWh');
  assert.equal(c.avoidedTonnes(wh, 400, 100), 300);
  assert.equal(c.treeEquivalents(1, 20), 50);
  assert.equal(c.reductionPct(400, 100), 75);
});

test('dataset technology totals match the reported production totals', () => {
  for (const y of YEARS) {
    if (y.status !== 'actual' || !y.tech) continue;
    const sum = Object.values(y.tech).reduce((s, t) => s + (t.gwh ?? 0), 0);
    assert.ok(Math.abs(sum - y.totalGwh!) <= 2, `${y.year} tech sum ${sum} vs ${y.totalGwh}`);
  }
});

test('country allocation includes all published production categories', () => {
  for (const y of YEARS) {
    if (y.status !== 'actual' || !y.countries) continue;
    const sum = Object.values(y.countries).reduce((n, v) => n + (v ?? 0), 0);
    assert.ok(Math.abs(sum - y.totalGwh!) <= 2, `${y.year} country sum ${sum} vs ${y.totalGwh}`);
  }
});

test('climate intensity is consistent with the emissions and production denominator', () => {
  for (const y of YEARS) {
    if (y.envProductionGwh == null || y.scope12T == null || y.intensityG == null) continue;
    const computed = y.scope12T / y.envProductionGwh;
    assert.ok(Math.abs(computed - y.intensityG) < 0.1, `${y.year}: ${computed} vs ${y.intensityG}`);
  }
});
