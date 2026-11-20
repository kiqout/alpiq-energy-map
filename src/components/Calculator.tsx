import { useMemo, useState } from 'react';
import { ASSUMPTIONS, YEARS } from '../data/alpiq';
import * as c from '../lib/calc';
import { Info, nf } from './ui';

const y25 = YEARS.find(y => y.year === 2025)!;
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const fmtE = (wh: number) => { const u = c.bestEnergyUnit(wh); return `${nf(c.fromWh(wh, u), 3)} ${u}`; };
const fmtT = (t: number) => (Math.abs(t) >= 1e6 ? `${nf(t / 1e6, 3)} Mt` : Math.abs(t) >= 1e3 ? `${nf(t / 1e3, 2)} kt` : `${nf(t, 2)} t`);

export default function Calculator() {
  const [mode, setMode] = useState<'A' | 'B'>('A');
  const [p, setP] = useState('100');
  const [pu, setPu] = useState<c.PowerUnit>('MW');
  const [dur, setDur] = useState('1');
  const [du, setDu] = useState<c.DurationUnit>('y');
  const [cf, setCf] = useState('');
  const [e, setE] = useState('1');
  const [eu, setEu] = useState<c.EnergyUnit>('GWh');
  const [gen, setGen] = useState<'alpiq' | 'custom'>('alpiq');
  const [genC, setGenC] = useState('83.9');
  const [ref, setRef] = useState<'gas' | 'custom'>('gas');
  const [refC, setRefC] = useState('414');

  const genG = gen === 'alpiq' ? y25.intensityG! : num(genC);
  const refG = ref === 'gas' ? y25.gasIntensityG! : num(refC);

  type Result = { err: string[]; wh: number; em: number; diff: number; red: number; trees: number };
  const res = useMemo<Result>(() => {
    const err: string[] = [];
    let wh = NaN;
    if (mode === 'A') {
      const P = num(p), D = num(dur), CF = cf === '' ? 100 : num(cf);
      if (!Number.isFinite(P) || P < 0) err.push('Enter a valid power value of 0 or more.');
      if (!Number.isFinite(D) || D < 0) err.push('Enter a valid duration of 0 or more.');
      if (!Number.isFinite(CF) || CF < 0 || CF > 100) err.push('Capacity factor must be between 0 and 100 %.');
      if (!err.length) wh = c.powerToEnergyWh(P, pu, D, du, CF / 100);
    } else {
      const E = num(e);
      if (!Number.isFinite(E) || E < 0) err.push('Enter a valid energy quantity of 0 or more.');
      else wh = c.toWh(E, eu);
      if (!Number.isFinite(genG) || genG < 0) err.push('Generation intensity must be a valid number of 0 or more g/kWh.');
      if (!Number.isFinite(refG) || refG < 0) err.push('Reference intensity must be a valid number of 0 or more g/kWh.');
    }
    if (!err.length && !Number.isFinite(wh)) err.push('The result is too large to calculate. Try a smaller input.');
    if (err.length) return { err, wh: NaN, em: NaN, diff: NaN, red: NaN, trees: NaN };
    const hasImpact = mode === 'B';
    const em = hasImpact ? c.emissionsTonnes(wh, genG) : NaN;
    const diff = hasImpact ? c.avoidedTonnes(wh, refG, genG) : NaN;
    if (hasImpact && (!Number.isFinite(em) || !Number.isFinite(diff))) {
      return { err: ['The impact estimate is too large to calculate. Try a smaller input.'], wh: NaN, em: NaN, diff: NaN, red: NaN, trees: NaN };
    }
    return {
      err,
      wh,
      em,
      diff,
      red: hasImpact ? c.reductionPct(refG, genG) : NaN,
      trees: hasImpact ? c.treeEquivalents(diff, ASSUMPTIONS.kgCo2PerTreePerYear) : NaN,
    };
  }, [mode, p, pu, dur, du, cf, e, eu, genG, refG]);

  const unitSel = <T extends string>(v: T, set: (x: T) => void, opts: readonly string[]) =>
    <select value={v} onChange={ev => set(ev.target.value as T)}>{opts.map(o => <option key={o}>{o}</option>)}</select>;

  return (
    <div className="calc card">
      <div className="calc-head">
        <div className="tabs" role="tablist" aria-label="Calculator mode">
          <button role="tab" aria-selected={mode === 'A'} className={mode === 'A' ? 'on' : ''} onClick={() => setMode('A')}>Power → Energy</button>
          <button role="tab" aria-selected={mode === 'B'} className={mode === 'B' ? 'on' : ''} onClick={() => setMode('B')}>Energy impact</button>
        </div>
        <span className="calc-kicker">Live conversion</span>
      </div>
      <div className="calc-grid">
        <div className="calc-in">
          {mode === 'A' ? <>
            <label>Power capacity<div className="row"><input type="number" min="0" step="any" inputMode="decimal" value={p} onChange={x => setP(x.target.value)} aria-label="Power capacity" />{unitSel(pu, setPu, Object.keys(c.POWER_UNITS))}</div></label>
            <label>Operating duration<div className="row"><input type="number" min="0" step="any" inputMode="decimal" value={dur} onChange={x => setDur(x.target.value)} aria-label="Operating duration" />{unitSel(du, setDu, ['h', 'd', 'y'])}</div></label>
            <label>Capacity factor (optional, %)<div className="row"><input type="number" min="0" max="100" step="any" inputMode="decimal" placeholder="100" value={cf} onChange={x => setCf(x.target.value)} aria-label="Capacity factor percent" /></div></label>
            <p className="hint">Energy = Power × Time × Capacity factor. A year is 365 days (8,760 h). Leave capacity factor empty to assume 100%.</p>
          </> : <>
            <label>Energy quantity<div className="row"><input type="number" min="0" step="any" inputMode="decimal" value={e} onChange={x => setE(x.target.value)} aria-label="Energy quantity" />{unitSel(eu, setEu, Object.keys(c.ENERGY_UNITS))}</div></label>
            <label>Generation intensity
              <div className="row"><select value={gen} onChange={x => setGen(x.target.value as 'alpiq' | 'custom')} aria-label="Generation intensity source"><option value="alpiq">Alpiq 2025 detailed table ({y25.intensityG} g/kWh)</option><option value="custom">Custom value</option></select>
                {gen === 'custom' && <input type="number" min="0" step="any" inputMode="decimal" value={genC} onChange={x => setGenC(x.target.value)} aria-label="Generation g CO2e per kWh" />}</div></label>
            <label>Reference scenario
              <div className="row"><select value={ref} onChange={x => setRef(x.target.value as 'gas' | 'custom')} aria-label="Reference scenario"><option value="gas">Alpiq gas fleet 2025 ({y25.gasIntensityG} g/kWh)</option><option value="custom">Custom value</option></select>
                {ref === 'custom' && <input type="number" min="0" step="any" inputMode="decimal" value={refC} onChange={x => setRefC(x.target.value)} aria-label="Reference g CO2e per kWh" />}</div></label>
            <p className="hint">Comparison: energy × (reference intensity − generation intensity). A positive difference is lower emissions than the selected reference, not proof of emissions physically avoided.</p>
          </>}
        </div>
        <div className="calc-out" aria-live="polite">
          {res.err.length ? res.err.map(m => <p className="err" key={m}>{m}</p>) : <>
            <Out k="Calculated energy" v={fmtE(res.wh)} sub={`${nf(c.fromWh(res.wh, 'GWh'), 6)} GWh · ${nf(c.fromWh(res.wh, 'TWh'), 9)} TWh`} />
            {mode === 'B' && <>
              <Out k="Estimated CO₂e at selected generation intensity" v={fmtT(res.em)} />
              <Out k="Difference vs selected reference" v={res.diff >= 0 ? fmtT(res.diff) : `${fmtT(-res.diff)} above reference`} sub={isFinite(res.red) ? `${nf(res.red, 1)} % lower intensity` : 'Reference intensity is zero; percentage is undefined'} />
              <Out k={<>Tree absorption equivalent <Info>Positive CO₂ difference ÷ {ASSUMPTIONS.kgCo2PerTreePerYear} kg CO₂ per tree per year. A calculated one-year absorption equivalent, not trees saved or planted.</Info></>} v={res.diff > 0 ? nf(res.trees, 0) : '—'} sub="trees absorbing an equivalent amount over one year" />
            </>}
          </>}
        </div>
      </div>
      <div className="calc-foot"><span>1 MW × 1 hour = 1 MWh</span><span>1 GWh = 1,000 MWh</span><span>1 TWh = 1,000 GWh</span></div>
    </div>
  );
}

const Out = ({ k, v, sub }: { k: React.ReactNode; v: string; sub?: string }) => <div className="out"><span>{k}</span><b>{v}</b>{sub && <small>{sub}</small>}</div>;
