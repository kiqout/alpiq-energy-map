import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TECH, type TechKey, type Status } from '../data/alpiq';
import { intlLocale, t, type Locale } from '../i18n';

export const nf = (n: number, d = 0, locale: Locale = 'en') => n.toLocaleString(intlLocale(locale), { maximumFractionDigits: d, minimumFractionDigits: d });

export function useCounter(target: number | null, ms = 800) {
  const [v, setV] = useState(target ?? 0); const from = useRef(v);
  useEffect(() => {
    if (target == null) return; const a = from.current, t0 = performance.now(); let r = 0;
    const step = (time: number) => { const p = Math.min(1, (time - t0) / ms); const e = 1 - Math.pow(1 - p, 3); const x = a + (target - a) * e; setV(x); from.current = x; if (p < 1) r = requestAnimationFrame(step); };
    r = requestAnimationFrame(step); return () => cancelAnimationFrame(r);
  }, [target, ms]);
  return v;
}

export const Counter = ({ value, d = 0, suffix = '', locale = 'en' }: { value: number | null; d?: number; suffix?: string; locale?: Locale }) => {
  const v = useCounter(value);
  return value == null ? <span className="na">{t(locale, 'label.unavailable')}</span> : <>{nf(v, d, locale)}{suffix}</>;
};

export const StatusBadge = ({ s, locale = 'en' }: { s: Status; locale?: Locale }) => <span className={`badge ${s}`}>{t(locale, `status.${s}`)}</span>;

export const Info = ({ children, ariaLabel = 'Methodology' }: { children: ReactNode; ariaLabel?: string }) => (
  <span className="info" tabIndex={0} aria-label={ariaLabel}>ⓘ<span className="info-pop">{children}</span></span>
);

export const Delta = ({ pct, locale = 'en' }: { pct: number | null; locale?: Locale }) =>
  pct == null || !isFinite(pct) ? <span className="na">{t(locale, 'label.naShort')}</span> : <span className={pct >= 0 ? 'up' : 'down'}>{pct >= 0 ? '▲' : '▼'} {nf(Math.abs(pct), 1, locale)} %</span>;

export function Bars({ rows, total, labelIcon, locale = 'en' }: { rows: { key: string; label: string; value: number; color: string }[]; total: number; labelIcon?: (key: string) => ReactNode; locale?: Locale }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return <div className="bars">{rows.map(r => (
    <div className="bar-row" key={r.key}>
      <div className="bar-head"><span>{labelIcon ? <span className="bar-label-icon">{labelIcon(r.key)}</span> : <i style={{ background: r.color }} />}{r.label}</span><b>{nf(r.value, 0, locale)} GWh <small>{nf((r.value / total) * 100, 1, locale)} %</small></b></div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></div>
    </div>))}</div>;
}

export const techRows = (tech: Record<TechKey, { gwh: number }>, labels: Partial<Record<TechKey, string>> = {}) => (Object.keys(TECH) as TechKey[]).map(k => ({ key: k, label: labels[k] ?? TECH[k].label, value: tech[k].gwh, color: TECH[k].color }));
