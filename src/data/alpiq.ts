// Alpiq data model: reported figures, derived values and explicitly labelled assumptions.
export type Status = 'actual' | 'provisional' | 'forecast' | 'unavailable';
export type TechKey = 'hydro' | 'nuclear' | 'thermal' | 'windpv';
export type CountryKey = 'CH' | 'FR' | 'IT' | 'ES' | 'HU';

export const TECH: Record<TechKey, { label: string; color: string }> = {
  hydro: { label: 'Hydropower', color: '#38bdf8' },
  nuclear: { label: 'Nuclear power', color: '#a78bfa' },
  thermal: { label: 'Conventional thermal', color: '#fb923c' },
  windpv: { label: 'Wind & photovoltaics', color: '#4ade80' },
};
export const COUNTRIES: Record<CountryKey, { name: string }> = {
  CH: { name: 'Switzerland' },
  FR: { name: 'France' },
  IT: { name: 'Italy' },
  ES: { name: 'Spain' },
  HU: { name: 'Hungary' },
};

export interface TechFigure { gwh: number; mw: number | null; mwNote?: string }
export interface YearData {
  year: number;
  status: Status;
  period: string;
  statusNote: string;
  source: { label: string; url: string };
  totalGwh: number | null;
  /** Number of calendar days covered by the reported production period. */
  periodDays: number;
  totalMw: number | null;
  tech: Record<TechKey, TechFigure> | null;
  /** GWh by country, summed from the report's technology × country table. */
  countries: Partial<Record<CountryKey, number>> | null;
  /** Technology-level production by country, where published. */
  countryTech?: Partial<Record<CountryKey, Partial<Record<TechKey, number>>>>;
  /** Override where the report's technology category differs by year. */
  techLabelOverrides?: Partial<Record<TechKey, string>>;
  /** Electricity-production denominator used by Alpiq in the Scope 1+2 intensity table. */
  envProductionGwh: number | null;
  /** Equity-share Scope 1+2 intensity of Alpiq's group production, g CO2e/kWh. */
  intensityG: number | null;
  scope12T: number | null;
  /** 2025 headline KPI shown on the report landing page; differs from the table value. */
  headlineIntensityG?: number | null;
  /** Equity-share Scope 1+2 intensity of Alpiq's gas fleet (reference), g CO2e/kWh. */
  gasIntensityG: number | null;
  /** Previous comparable production denominator as stated in the current year's report. */
  yoyPreviousGwh?: number;
  /** Comparison basis for YoY: previous year's figure as the same report states it. */
  yoyNote?: string;
}

const AR25 = 'https://reports.alpiq.com/25/about-us';
const AR24 = 'https://reports.alpiq.com/24/about-us';

export const YEARS: YearData[] = [
  {
    year: 2024, status: 'actual', period: 'FY 2024 (1 Jan – 31 Dec)',
    statusNote: 'Full-year figures from the Annual Report 2024.',
    source: { label: 'Annual Report 2024 – About us', url: AR24 },
    totalGwh: 17281, periodDays: 366, totalMw: 5721,
    tech: {
      hydro: { gwh: 6774, mw: 3327 },
      nuclear: { gwh: 6705, mw: 831 },
      thermal: { gwh: 3375, mw: 1308 },
      windpv: { gwh: 427, mw: 255 },
    },
    techLabelOverrides: { windpv: 'Small-scale hydropower, wind & photovoltaics' },
    countries: { CH: 5692 + 70 + 5833, FR: 1082 + 38 + 873, IT: 319 + 2444, ES: 487, HU: 444 },
    countryTech: {
      CH: { hydro: 5692, windpv: 70, nuclear: 5833 },
      FR: { hydro: 1082, windpv: 38, nuclear: 873 },
      IT: { windpv: 319, thermal: 2444 },
      ES: { thermal: 487 },
      HU: { thermal: 444 },
    },
    envProductionGwh: 18950,
    intensityG: 76.0, scope12T: 1439441, gasIntensityG: 422.2,
  },
  {
    year: 2025, status: 'actual', period: 'FY 2025 (1 Jan – 31 Dec)',
    statusNote: 'Full-year figures from the Annual Report 2025.',
    source: { label: 'Annual Report 2025 – About us', url: AR25 },
    totalGwh: 14860, periodDays: 365, totalMw: 5616,
    tech: {
      hydro: { gwh: 7001, mw: 3199 },
      nuclear: { gwh: 4546, mw: 831 },
      thermal: { gwh: 2990, mw: 1343 },
      windpv: { gwh: 323, mw: 244 },
    },
    countries: { CH: 6016 + 13 + 3631, FR: 984 + 33 + 915, IT: 277 + 2401, ES: 327, HU: 262 },
    countryTech: {
      CH: { hydro: 6016, windpv: 13, nuclear: 3631 },
      FR: { hydro: 984, windpv: 33, nuclear: 915 },
      IT: { windpv: 277, thermal: 2401 },
      ES: { thermal: 327 },
      HU: { thermal: 262 },
    },
    envProductionGwh: 14918,
    intensityG: 83.9, headlineIntensityG: 99.4, scope12T: 1251771, gasIntensityG: 414.0,
    yoyPreviousGwh: 18898,
    yoyNote: 'The 2025 report compares against restated 2024 own production of 18,898 GWh (−21%). Its separate 2024 production-by-technology table reports 17,281 GWh; these published bases are not directly comparable.',
  },
  {
    year: 2026, status: 'provisional', period: 'H1 2026 (1 Jan – 30 Jun)',
    statusNote: 'Half-year only (Interim Report 2026). Not a full-year figure; no technology/country split or emissions data verified.',
    source: { label: 'Alpiq Interim Report 2026', url: 'https://www.alpiq.com/fileadmin/ALPIQ/newsroom/publications/interim_report/alpiq_interim_report_2026_en.pdf' },
    totalGwh: 7758, periodDays: 181, totalMw: null, tech: null, countries: null, envProductionGwh: null,
    intensityG: null, scope12T: null, gasIntensityG: null, yoyPreviousGwh: 7452,
    yoyNote: 'Compared with H1 2025 (7,452 GWh, same interim-report basis): +4%.',
  },
];

export const ASSUMPTIONS = {
  /** Commonly cited average CO2 uptake of a mature tree; an illustrative assumption, not an Alpiq figure. */
  kgCo2PerTreePerYear: 22,
  referenceLabel: 'Alpiq’s own gas-fired fleet (equity share), same year',
};

export const LIGHTING_SOURCES = [
  { label: 'IEA – global building and outdoor lighting demand (about 2,200 TWh in 2024)', url: 'https://www.iea.org/commentaries/the-next-wave-of-led-deployment-smarter-circular-and-more-efficient' },
];

export const SOURCES = [
  { label: 'Annual Report 2025 – About us (production, capacity)', url: AR25 },
  { label: 'Annual Report 2025 – Climate change (emissions, intensity)', url: 'https://reports.alpiq.com/25/climate-change' },
  { label: 'Annual Report 2025 – Key financial figures (restated own production comparison)', url: 'https://reports.alpiq.com/25/key-financial-figures' },
  { label: 'Annual Report 2024 – About us', url: AR24 },
  { label: 'Alpiq Interim Report 2026', url: 'https://www.alpiq.com/fileadmin/ALPIQ/newsroom/publications/interim_report/alpiq_interim_report_2026_en.pdf' },
  { label: 'Alpiq publications archive', url: 'https://www.alpiq.com/newsroom/publications' },
  { label: 'Swiss Federal Statistical Office – 2,110 municipalities (1 Jan 2026)', url: 'https://statistik.admin.ch/en/asset/36390081' },
  ...LIGHTING_SOURCES,
];
