import type { ReactNode } from 'react';

export type MetricIconName = 'gauge' | 'factory' | 'flame' | 'leaf' | 'trend' | 'tree' | 'zap' | 'hydro' | 'nuclear' | 'thermal' | 'wind';

const drawings: Record<MetricIconName, ReactNode> = {
  gauge: <><path d="M4.2 18.2a9 9 0 1 1 15.6 0"/><path d="m12 13 4-4"/><path d="M7.2 18.2h9.6"/><path d="M12 4.2v1.4"/></>,
  factory: <><path d="M3.5 20V9.4l6 3.6V9.4l6 3.6V5h5v15Z"/><path d="M17 8h.01"/><path d="M17 11h.01"/><path d="M7 16h.01"/><path d="M11 16h.01"/><path d="M15 16h.01"/></>,
  flame: <><path d="M13.2 3.2c.7 3.1-.8 4.4-2.4 6.1-1.3 1.3-2.2 2.6-2.2 4.8a3.4 3.4 0 0 0 6.8 0c0-1.2-.5-2.2-1.2-3.1 3 .9 4.8 3.6 4.8 6.2a7 7 0 0 1-14 0c0-3.3 1.8-5.8 4.4-8.5 1.5-1.6 2.9-3.1 3.8-5.5Z"/><path d="M10.5 17.2a2 2 0 0 0 3.9 0"/></>,
  leaf: <><path d="M20 4c-8.2 0-14.5 3-14.5 9.1A6.1 6.1 0 0 0 11.6 19C17.5 19 20 11.8 20 4Z"/><path d="M4 21c2.8-5.1 6.5-8.4 11.2-11.2"/></>,
  trend: <><path d="M4 6v12h16"/><path d="m6.5 9 4.1 4.1 3.1-2.7 4.8 4.8"/><path d="M14.8 15.2h3.7v-3.7"/></>,
  tree: <><path d="m12 3-6.2 7.5h3.1L4.8 16h5.1v5h4.2v-5h5.1l-4.1-5.5h3.1L12 3Z"/><path d="M12 15v6"/></>,
  zap: <><path d="m13.2 2.8-8 10.1h6l-.4 8.3 8-10.1h-6l.4-8.3Z"/></>,
  hydro: <><path d="M12 3.2c-2.2 3.3-6.3 7.4-6.3 11.3a6.3 6.3 0 0 0 12.6 0C18.3 10.6 14.2 6.5 12 3.2Z"/><path d="M8.7 15.1a3.3 3.3 0 0 0 3.3 3.2"/></>,
  nuclear: <><circle cx="12" cy="12" r="2.1"/><path d="M12 9.9c-2.7-4.6-5.1-5.4-6.3-4.7-1.9 1.1-.6 5.1 2.1 6.8M14.1 12c5.3-.1 7.2 1.6 7.2 3 0 2.2-4 3.6-7.2 2.5M10.1 13.8c-2.7 4.5-2.3 7-.9 7.7 1.9 1.1 4.7-1.7 5.1-4.9"/></>,
  thermal: <><path d="M4 20V9l6 3.5V9l6 3.5V4h4v16Z"/><path d="M17 7h.01M7 16h.01M12 16h.01M17 16h.01"/></>,
  wind: <><path d="M12 12V3.5"/><path d="m12 12 7.3 4.2"/><path d="m12 12-7.3 4.2"/><circle cx="12" cy="12" r="1.7"/><path d="M12 3.5c2.5 0 3.5 3.3 2 5.4M19.3 16.2c1.2 2.2-1.1 4.8-3.6 3.7M4.7 16.2c-1.2 2.2 1.1 4.8 3.6 3.7"/></>,
};

export default function MetricIcon({ name, className = '' }: { name: MetricIconName; className?: string }) {
  return (
    <span className={`metric-icon ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
        {drawings[name]}
      </svg>
    </span>
  );
}
