import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Globe from './components/Globe';
import SwissTerrain from './components/SwissTerrain';
import MetricIcon, { type MetricIconName } from './components/MetricIcon';
import { EnvironmentMedia, MEDIA_CREDITS, TechnologyMedia, type EnvironmentScene } from './components/MediaTiles';
import { Bars, Counter, Delta, Info, StatusBadge, nf, techRows } from './components/ui';
import { ASSUMPTIONS, COUNTRIES, SOURCES, YEARS, type CountryKey, type TechKey } from './data/alpiq';
import { lightingForYear, REGIONS, type Region } from './lib/lighting';
import { LOCALES, t, type Locale } from './i18n';
import * as c from './lib/calc';

const localeIsValid = (value: string | null): value is Locale => LOCALES.some(item => item.id === value);

type CoverageMetric = 'percent' | 'days';

export default function App() {
  const [year, setYear] = useState(2025);
  const [region, setRegion] = useState<Region>('world');
  const [coverageMetric, setCoverageMetric] = useState<CoverageMetric>('percent');
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem('alpiq-locale');
      return localeIsValid(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    try { localStorage.setItem('alpiq-locale', locale); } catch { /* Storage can be disabled. */ }
  }, [locale]);

  const y = YEARS.find(v => v.year === year)!;
  const prev = YEARS.find(v => v.year === year - 1);
  const yoy = y.totalGwh != null && y.yoyPreviousGwh != null
    ? c.yoyPct(y.totalGwh, y.yoyPreviousGwh)
    : y.totalGwh != null && prev?.totalGwh != null
      ? c.yoyPct(y.totalGwh, prev.totalGwh)
      : null;
  const values = useMemo(() => y.countries ?? {}, [y]);
  const lighting = lightingForYear(y, region);
  const regionPhrase = t(locale, `regionPhrase.${region}`);
  const period = t(locale, `period.${year}`);
  const hasEnv = y.envProductionGwh != null && y.intensityG != null && y.gasIntensityG != null && y.scope12T != null;
  const avoided = hasEnv ? c.avoidedTonnes(c.toWh(y.envProductionGwh!, 'GWh'), y.gasIntensityG!, y.intensityG!) : null;
  const redPct = hasEnv ? c.reductionPct(y.gasIntensityG!, y.intensityG!) : null;
  const trees = avoided != null ? c.treeEquivalents(avoided, ASSUMPTIONS.kgCo2PerTreePerYear) : null;
  const countryRows = (Object.keys(COUNTRIES) as CountryKey[])
    .filter(k => values[k] != null)
    .map(k => ({ key: k, label: t(locale, `country.${k}`), value: values[k]!, color: k === 'CH' ? '#4ade80' : '#38bdf8' }))
    .sort((a, b) => b.value - a.value);
  const trendRows = YEARS.map(v => ({ ...v, trendGwh: v.year === 2024 ? 18898 : v.totalGwh }));
  const maxTrend = Math.max(...trendRows.map(v => v.trendGwh ?? 0));
  const techData = y.tech ? techRows(y.tech, y.techLabelOverrides).map(row => ({
    ...row,
    label: y.year === 2024 && row.key === 'windpv' ? t(locale, 'tech.windpv2024') : t(locale, `tech.${row.key}`),
  })) : [];

  const coveragePercent = lighting ? lighting.demandCoveredRatio * 100 : null;
  const coverageDays = lighting ? lighting.equivalentLightingDays : null;
  const displayedCoverage = coverageMetric === 'percent' ? coveragePercent : coverageDays;
  const coverageDecimals = coverageMetric === 'percent'
    ? (coveragePercent != null && coveragePercent >= 10 ? 1 : 2)
    : (coverageDays != null && coverageDays >= 100 ? 0 : 1);
  const coverageValueText = displayedCoverage == null ? '' : nf(displayedCoverage, coverageDecimals, locale);

  return (
    <>
      <header className={`hero ${region === 'switzerland' ? 'hero-swiss' : ''}`}>
        {region === 'switzerland' ? <SwissTerrain locale={locale} /> : <Globe mode={region} locale={locale} />}
        <div className="topbar">
          <div className="logo">Alpiq <span>Energy Atlas</span></div>
          <div className="nav-controls">
            <div className="years regions" role="group" aria-label={t(locale, 'nav.region')}>
              {REGIONS.map(r => <button key={r.id} type="button" aria-pressed={r.id === region} className={r.id === region ? 'on' : ''} onClick={() => setRegion(r.id)}>{t(locale, `region.${r.id}`)}</button>)}
            </div>
            <div className="years" role="group" aria-label={t(locale, 'nav.year')}>
              {YEARS.map(v => <button key={v.year} type="button" className={v.year === year ? 'on' : ''} aria-pressed={v.year === year} onClick={() => setYear(v.year)}>{v.year === 2026 ? '2026 H1' : v.year}</button>)}
            </div>
            <label className="language-picker">
              <span className="sr-only">{t(locale, 'nav.language')}</span>
              <select className="language-select" value={locale} aria-label={t(locale, 'nav.language')} onChange={event => setLocale(event.target.value as Locale)}>
                {LOCALES.map(item => <option key={item.id} value={item.id}>{item.label} · {item.native}</option>)}
              </select>
            </label>
          </div>
        </div>

        <aside className="panel left">
          <div className="row-between"><span className="eyebrow">{period}</span><StatusBadge s={y.status} locale={locale} /></div>
          <div className="big"><Counter value={y.totalGwh != null ? y.totalGwh / 1000 : null} d={2} locale={locale} /> <small>TWh {t(locale, year === 2026 ? 'label.producedH1' : 'label.produced')}</small></div>
          <div className="kv"><span>{t(locale, year === 2026 ? 'label.vsH1' : year === 2025 ? 'label.vs2024' : 'label.yoy')}</span><b><Delta pct={yoy} locale={locale} /></b></div>
          <div className="kv"><span>{t(locale, 'label.installedCapacity')}</span><b>{y.totalMw != null ? <><Counter value={y.totalMw / 1000} d={2} locale={locale} /> GW</> : <span className="na">{t(locale, 'label.unavailable')}</span>}</b></div>
          <p className="note">{t(locale, `year.${year}.statusNote`)}</p>
          {year === 2025 && <p className="note">{t(locale, 'year.2025.yoyNote')}</p>}
          {year === 2026 && <p className="note">{t(locale, 'year.2026.yoyNote')}</p>}
          <div className="trend" aria-label={t(locale, 'nav.year')}>
            {trendRows.map(v => <button key={v.year} type="button" className={`tb ${v.status} ${v.year === year ? 'on' : ''}`} onClick={() => setYear(v.year)} title={`${v.year}: ${v.trendGwh != null ? nf(v.trendGwh, 0, locale) + ' GWh' : t(locale, 'label.unavailable')} (${t(locale, `status.${v.status}`)}${v.year === 2026 ? `, ${t(locale, 'label.h1Only')}` : ''})`}>
              <i style={{ height: `${((v.trendGwh ?? 0) / maxTrend) * 100}%` }} /><span>{v.year === 2024 ? '2024*' : v.status === 'provisional' ? `${v.year} H1` : v.year}</span>
            </button>)}
          </div>
          <p className="note">{t(locale, 'note.trend2024')}</p>
          <a className="source-inline" href={y.source.url} target="_blank" rel="noreferrer">{t(locale, 'source.open')}</a>
        </aside>

        <aside className="panel right light-panel">
          <div className="row-between coverage-heading-row">
            <span className="eyebrow">{t(locale, coverageMetric === 'percent' ? 'coverage.heading.percent' : 'coverage.heading.days', { region: regionPhrase })}</span>
            <span className="light-indicator" />
          </div>
          {lighting ? <>
            <div className="coverage-toggle" role="group" aria-label={t(locale, 'coverage.toggleLabel')}>
              <button type="button" className={coverageMetric === 'days' ? 'on' : ''} aria-pressed={coverageMetric === 'days'} onClick={() => setCoverageMetric('days')}>{t(locale, 'coverage.toggleDays')}</button>
              <button type="button" className={coverageMetric === 'percent' ? 'on' : ''} aria-pressed={coverageMetric === 'percent'} onClick={() => setCoverageMetric('percent')}>{t(locale, 'coverage.togglePercent')}</button>
            </div>
            <div className="coverage-value" key={`${year}-${region}-${coverageMetric}`}>
              <Counter value={displayedCoverage} d={coverageDecimals} locale={locale} />
              <small>{t(locale, coverageMetric === 'percent' ? 'coverage.unitPercent' : 'coverage.unitDays')}</small>
            </div>
            <div className="coverage-caption">{t(locale, coverageMetric === 'percent' ? 'coverage.captionPercent' : 'coverage.captionDays')}</div>
            <p className="earth-description">{coverageMetric === 'percent'
              ? t(locale, 'coverage.descriptionPercent', { value: coverageValueText, region: regionPhrase })
              : t(locale, 'coverage.descriptionDays', { value: coverageValueText, region: regionPhrase })}</p>
            <div className="earth-equivalent">
              <div><span>{t(locale, 'coverage.rowProduction')}</span><b>{nf(lighting.energyTwh, 2, locale)} TWh</b></div>
              <div><span>{t(locale, 'coverage.rowPeriodDemand')}</span><b>{nf(lighting.demandTwhForPeriod, lighting.demandTwhForPeriod < 10 ? 2 : 1, locale)} TWh</b></div>
              <div><span>{t(locale, 'coverage.rowAnnualDemand')}</span><b>{nf(lighting.annualDemandTwh, lighting.annualDemandTwh < 10 ? 1 : 0, locale)} TWh</b></div>
            </div>
            <div className="earth-progress" role="img" aria-label={`${nf(coveragePercent ?? 0, 2, locale)}%`}>
              <i style={{ width: `${Math.max(0, Math.min(100, coveragePercent ?? 0))}%` }} />
            </div>
            <p className="note">{t(locale, coverageMetric === 'percent' ? 'coverage.note' : 'coverage.noteDays')}</p>
          </> : <p className="na">{t(locale, 'coverage.unavailable')}</p>}
          <p className="panel-footnote">{t(locale, 'coverage.footnote')}</p>
        </aside>
        <a className="scroll" href="#mix">{t(locale, 'section.explore')}</a>
      </header>

      <main>
        <section id="mix">
          <div className="section-heading"><div><span className="eyebrow">{t(locale, 'section.generation')}</span><h2>{t(locale, 'section.technology')}</h2></div><span className="section-meta">{period}</span></div>
          {y.tech ? <>
            <div className="technology-gallery">
              {techData.map(r => {
                const key = r.key as TechKey;
                const figure = y.tech![key];
                const share = y.totalGwh ? (figure.gwh / y.totalGwh) * 100 : 0;
                return <article className={`media-tile technology-tile technology-${key}`} key={key} style={{ '--tile-accent': r.color } as CSSProperties & { '--tile-accent': string }} aria-label={`${r.label}: ${nf(figure.gwh, 0, locale)} GWh`}>
                  <div className="tile-art"><TechnologyMedia type={key} windLabel={t(locale, 'media.wind')} solarLabel={t(locale, 'media.solar')} /></div>
                  <div className="tile-topline"><span className="tile-kicker">{t(locale, `media.detail.${key}`)}</span><span className="tile-share">{nf(share, 1, locale)}% <small>{t(locale, 'media.ofTotal')}</small></span></div>
                  <div className="tile-content">
                    <h3>{r.label}</h3>
                    <div className="tile-output"><strong>{nf(figure.gwh, 0, locale)}</strong><span>GWh</span></div>
                    <div className="tile-meta"><span>{figure.mw != null ? `${nf(figure.mw, 0, locale)} MW` : '— MW'}</span><span>{t(locale, 'media.installedCapacity')}</span></div>
                    <div className="tile-share-track" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, share))}%` }} /></div>
                  </div>
                </article>;
              })}
            </div>
            <details className="data-details">
              <summary>{t(locale, 'section.detailFigures')}</summary>
              <div className="grid2 details-grid">
                <div className="card"><Bars rows={techData} total={y.totalGwh!} locale={locale} /></div>
                <div className="card table-card"><table><thead><tr><th>{t(locale, 'table.technology')}</th><th>{t(locale, 'table.gwh')}</th><th>{t(locale, 'table.mw')}</th></tr></thead><tbody>
                  {techData.map(r => {
                    const figure = y.tech![r.key as TechKey];
                    return <tr key={r.key}><td><MetricIcon name={TECH_ICON[r.key as TechKey]} className="tech-row-icon" />{r.label}</td><td>{nf(r.value, 0, locale)}</td><td title={figure.mwNote}>{figure.mw != null ? nf(figure.mw, 0, locale) + (figure.mwNote ? '*' : '') : '—'}</td></tr>;
                  })}
                  <tr className="tot"><td>{t(locale, 'table.total')}</td><td>{nf(y.totalGwh!, 0, locale)}</td><td>{nf(y.totalMw!, 0, locale)}</td></tr>
                </tbody></table><p className="note">{t(locale, 'note.productionShare')}</p></div>
              </div>
            </details>
          </> : <div className="card unavailable-card"><p className="na">{t(locale, 'unavailable.technology', { period })}</p></div>}
        </section>

        <section>
          <div className="section-heading"><div><span className="eyebrow">{t(locale, 'section.regional')}</span><h2>{t(locale, 'section.country')}</h2></div><span className="section-meta">{period}</span></div>
          {countryRows.length ? <div className="card country-production-card"><Bars rows={countryRows} total={y.totalGwh ?? countryRows.reduce((sum, r) => sum + r.value, 0)} locale={locale} labelIcon={(key) => <CountryFlag code={key as CountryKey} locale={locale} />} /><p className="note">{t(locale, 'note.countryAllocation')}</p></div> : <div className="card unavailable-card"><p className="na">{t(locale, 'unavailable.countries')}</p></div>}
        </section>

        <section>
          <div className="section-heading"><div><span className="eyebrow">{t(locale, 'section.climate')}</span><h2>{t(locale, 'section.environment')} <Info ariaLabel={t(locale, 'section.sources')}>
            {t(locale, 'info.environment', { tree: ASSUMPTIONS.kgCo2PerTreePerYear })}
          </Info></h2></div><span className="section-meta">{t(locale, 'scope.equity')}</span></div>
          {hasEnv ? <>
            <div className="stats">
              <Stat icon="gauge" scene="intensity" locale={locale} k={t(locale, 'stat.intensity')} detail={t(locale, 'stat.intensityHint')} v={<><Counter value={y.intensityG} d={1} locale={locale} /> <small>g CO₂e/kWh</small></>} />
              <Stat icon="factory" scene="scope" locale={locale} k={t(locale, 'stat.scope')} detail={t(locale, 'stat.scopeHint')} v={<><Counter value={y.scope12T! / 1e6} d={2} locale={locale} /> <small>Mt CO₂e</small></>} />
              <Stat icon="flame" scene="gas" locale={locale} k={t(locale, 'stat.gas')} detail={t(locale, 'stat.gasHint')} v={<>{nf(y.gasIntensityG!, 1, locale)} <small>g CO₂e/kWh</small></>} />
              <Stat icon="leaf" scene="difference" locale={locale} k={t(locale, 'stat.difference')} detail={t(locale, 'stat.differenceHint')} v={<><Counter value={avoided! / 1e6} d={2} locale={locale} /> <small>Mt CO₂e · illustrative</small></>} />
              <Stat icon="trend" scene="reduction" locale={locale} k={t(locale, 'stat.reduction')} detail={t(locale, 'stat.reductionHint')} v={<Counter value={redPct} d={1} suffix=" %" locale={locale} />} />
              <Stat icon="tree" scene="trees" locale={locale} k={t(locale, 'stat.trees')} detail={t(locale, 'stat.treesHint')} v={<><Counter value={trees! / 1e6} d={1} locale={locale} /> <small>{t(locale, 'unit.millionTreesYear')}</small></>} />
            </div>
            <div className="method-strip">
              <span>{t(locale, 'method.basis', { gwh: nf(y.envProductionGwh!, 0, locale) })}</span>
              {y.headlineIntensityG != null && <span>{t(locale, 'method.headline', { headline: nf(y.headlineIntensityG, 1, locale), detail: nf(y.intensityG!, 1, locale) })}</span>}
            </div>
          </> : <div className="card unavailable-card"><p className="na">{t(locale, 'unavailable.environment', { period })}</p></div>}
        </section>

        <section>
          <div className="section-heading"><div><span className="eyebrow">{t(locale, 'section.transparency')}</span><h2>{t(locale, 'section.sources')}</h2></div><span className="section-meta">{t(locale, 'section.independent')}</span></div>
          <div className="card sources-card">
            <ul className="src">{SOURCES.map((s, index) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{t(locale, `source.${index}`)} <span>↗</span></a></li>)}</ul>
            <div className="method-columns"><ul className="meth">
              {[1, 2, 3, 4].map(index => <li key={index}>{t(locale, `method.${index}`)}</li>)}
            </ul><ul className="meth">
              {[5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(index => <li key={index}>{t(locale, `method.${index}`, { tree: ASSUMPTIONS.kgCo2PerTreePerYear })}</li>)}
            </ul></div>
            <details className="media-credits">
              <summary>{t(locale, 'section.mediaCredits')}</summary>
              <ul>
                {MEDIA_CREDITS.map((credit) => <li key={credit.source}>
                  <a href={credit.source} target="_blank" rel="noreferrer">{credit.title} ↗</a>
                  <span>{credit.author} · {credit.license} · <a href={credit.licenseUrl} target="_blank" rel="noreferrer">license</a></span>
                </li>)}
              </ul>
            </details>
          </div>
        </section>
      </main>
      <footer className="footer">ALPIQ ENERGY ATLAS <span>{t(locale, 'footer.note')}</span></footer>
    </>
  );
}

const TECH_ICON: Record<TechKey, MetricIconName> = {
  hydro: 'hydro', nuclear: 'nuclear', thermal: 'thermal', windpv: 'wind',
};

const Stat = ({ k, v, icon, detail, scene, locale }: { k: string; v: React.ReactNode; icon?: MetricIconName; detail: string; scene: EnvironmentScene; locale: Locale }) => (
  <div className={`card stat stat-${scene}`}>
    <div className="stat-art"><EnvironmentMedia scene={scene} gasLabel={t(locale, 'media.compareGas')} mixLabel={t(locale, 'media.compareMix')} /></div>
    <div className="stat-head"><span>{k}</span>{icon && <MetricIcon name={icon} />}</div>
    <div className="stat-body"><b>{v}</b><p className="stat-detail">{detail}</p></div>
  </div>
);

function CountryFlag({ code, locale }: { code: CountryKey; locale: Locale }) {
  const common = { viewBox: '0 0 36 24', className: `country-flag flag-${code.toLowerCase()}`, role: 'img' as const, 'aria-label': `${t(locale, `country.${code}`)} flag` };
  return <svg {...common} xmlns="http://www.w3.org/2000/svg">
    {code === 'CH' && <><rect x=".5" y=".5" width="35" height="23" rx="3" fill="#e32636"/><path d="M15 5h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="#fff"/></>}
    {code === 'FR' && <><rect x=".5" y=".5" width="35" height="23" rx="3" fill="#fff"/><path d="M.5 3.5a3 3 0 0 1 3-3h9v23h-9a3 3 0 0 1-3-3z" fill="#1b3f95"/><path d="M24 .5h9a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3h-9z" fill="#ed2939"/></>}
    {code === 'IT' && <><rect x=".5" y=".5" width="35" height="23" rx="3" fill="#fff"/><path d="M.5 3.5a3 3 0 0 1 3-3h9v23h-9a3 3 0 0 1-3-3z" fill="#009246"/><path d="M24 .5h9a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3h-9z" fill="#ce2b37"/></>}
    {code === 'ES' && <><rect x=".5" y=".5" width="35" height="23" rx="3" fill="#aa151b"/><path d="M.5 6.5h35v11H.5z" fill="#f1bf00"/></>}
    {code === 'HU' && <><rect x=".5" y=".5" width="35" height="23" rx="3" fill="#fff"/><path d="M3.5.5h29a3 3 0 0 1 3 3v5H.5v-5a3 3 0 0 1 3-3" fill="#ce2939"/><path d="M.5 16.5h35v4a3 3 0 0 1-3 3h-29a3 3 0 0 1-3-3z" fill="#477050"/></>}
    <rect x=".5" y=".5" width="35" height="23" rx="3" fill="none" stroke="rgba(255,255,255,.42)"/>
  </svg>;
}
