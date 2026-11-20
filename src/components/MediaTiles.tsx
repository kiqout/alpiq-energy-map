import type { TechKey } from '../data/alpiq';

export type EnvironmentScene = 'intensity' | 'scope' | 'gas' | 'difference' | 'reduction' | 'trees';

type PhotoAsset = {
  local: string;
  remote: string;
  alt: string;
};

// Real photographs from Wikimedia Commons.
// Full author, source-page and license details are listed in MEDIA-CREDITS.md
// and in the in-app Photo credits & licenses disclosure.
const photos: Record<string, PhotoAsset> = {
  hydro: {
    local: '/media/hydro-grimsel.jpg',
    remote: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Grimsel-Dam.jpg/1280px-Grimsel-Dam.jpg',
    alt: 'Grimsel hydroelectric dam in the Swiss Alps',
  },
  nuclear: {
    local: '/media/nuclear-goesgen-aerial.jpg',
    remote: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Centrale_nucl%C3%A9aire_de_G%C3%B6sgen.jpg/1280px-Centrale_nucl%C3%A9aire_de_G%C3%B6sgen.jpg',
    alt: 'Aerial view of Gösgen Nuclear Power Plant in Switzerland',
  },
  thermal: {
    local: '/media/thermal-gas-combined-cycle.jpg',
    remote: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/A_view_from_a_natural_gas_combined_cycle_power_plant.jpg/1280px-A_view_from_a_natural_gas_combined_cycle_power_plant.jpg',
    alt: 'Gas-fired combined-cycle power station at Gebze, Türkiye',
  },
  wind: {
    local: '/media/wind-mont-crosin.jpg',
    remote: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Windr%C3%A4der_Mont_Crosin.jpg/1280px-Windr%C3%A4der_Mont_Crosin.jpg',
    alt: 'Wind turbines on Mont-Crosin in Switzerland',
  },
  solar: {
    local: '/media/solar-lac-des-toules.jpg',
    remote: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Lac_des_Toules_-_Centrale_photovolta%C3%AFque.jpg/1280px-Lac_des_Toules_-_Centrale_photovolta%C3%AFque.jpg',
    alt: 'Floating photovoltaic solar power plant on Lac des Toules in Switzerland',
  },
  envIntensity: {
    local: '/media/hydro-spillway.jpg',
    remote: 'https://www.usbr.gov/pn/grandcoulee/news/gallery/contemporary/4.jpg',
    alt: 'Hydroelectric dam spillway releasing water at Grand Coulee Dam',
  },
  envScope: {
    local: '/media/env-industrial-emissions.jpg',
    remote: 'https://commons.wikimedia.org/wiki/Special:FilePath/Coal-Fired_Power_Plant_Emissions_Obscuring_Solar_Radiation.jpg?width=1600',
    alt: 'Industrial emissions from a coal-fired power station',
  },
  envGas: {
    local: '/media/env-gas-turbine.jpg',
    remote: 'https://commons.wikimedia.org/wiki/Special:FilePath/Gas_Turbine_Power_Plant.JPG?width=1600',
    alt: 'Gas turbine power plant',
  },
  envReduction: {
    local: '/media/solar-roof-switzerland.jpg',
    remote: 'https://commons.wikimedia.org/wiki/Special:FilePath/SolarPanelsFarmRoof.jpg?width=1600',
    alt: 'Swiss farm buildings with photovoltaic solar panels on their roofs',
  },
  envTrees: {
    local: '/media/env-forest-canopy.jpg',
    remote: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sunlight_in_forest.jpg?width=1600',
    alt: 'Mature forest canopy with sunlight filtering through the trees',
  },
};

function Photo({ asset, className = '' }: { asset: PhotoAsset; className?: string }) {
  return <img
    className={className}
    src={asset.local}
    data-fallback={asset.remote}
    alt={asset.alt}
    aria-hidden="true"
    loading="lazy"
    decoding="async"
    referrerPolicy="no-referrer"
    onError={(event) => {
      const image = event.currentTarget;
      const fallback = image.dataset.fallback;
      if (fallback && image.dataset.fallbackTried !== 'true') {
        image.dataset.fallbackTried = 'true';
        image.src = fallback;
      }
    }}
  />;
}

export function TechnologyMedia({ type, windLabel, solarLabel }: { type: TechKey; windLabel: string; solarLabel: string }) {
  if (type === 'windpv') {
    return (
      <div className="photo-scene photo-scene-composite" aria-hidden="true">
        <div className="photo-split-panel photo-split-wind">
          <Photo asset={photos.wind} className="photo-main" />
          <span className="photo-panel-label">{windLabel}</span>
        </div>
        <div className="photo-split-panel photo-split-solar">
          <Photo asset={photos.solar} className="photo-secondary" />
          <span className="photo-panel-label">{solarLabel}</span>
        </div>
      </div>
    );
  }

  const asset = type === 'hydro' ? photos.hydro : type === 'nuclear' ? photos.nuclear : photos.thermal;
  return <div className={`photo-scene photo-${type}`}><Photo asset={asset} className="photo-main" /></div>;
}

export function EnvironmentMedia({ scene, gasLabel, mixLabel }: { scene: EnvironmentScene; gasLabel: string; mixLabel: string }) {
  // Environmental cards use a separate photo set. The benchmark card uses a clear, side-by-side comparison.
  if (scene === 'difference') {
    return (
      <div className="photo-scene photo-scene-composite photo-environment photo-environment-difference" aria-hidden="true">
        <div className="photo-split-panel photo-env-gas">
          <Photo asset={photos.envGas} className="photo-main" />
          <span className="photo-panel-label">{gasLabel}</span>
        </div>
        <div className="photo-split-panel photo-env-mix">
          <Photo asset={photos.envIntensity} className="photo-secondary" />
          <span className="photo-panel-label">{mixLabel}</span>
        </div>
      </div>
    );
  }
  const asset = scene === 'intensity' ? photos.envIntensity
    : scene === 'scope' ? photos.envScope
      : scene === 'gas' ? photos.envGas
        : scene === 'reduction' ? photos.envReduction
          : photos.envTrees;
  return <div className={`photo-scene photo-environment photo-environment-${scene}`} aria-hidden="true"><Photo asset={asset} className="photo-main" /></div>;
}

export const MEDIA_CREDITS = [
  {
    title: 'Grimsel Dam — hydroelectricity in the Swiss Alps',
    author: 'GabrielleMerk',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Grimsel-Dam.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    title: 'Aerial view of Gösgen Nuclear Power Plant',
    author: 'Jérémy Toma',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Centrale_nucléaire_de_Gösgen.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    title: 'Gebze natural-gas combined-cycle power plant',
    author: 'Harald the Bard',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:A_view_from_a_natural_gas_combined_cycle_power_plant.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    title: 'Wind turbines on Mont-Crosin',
    author: 'Userhelp.ch',
    license: 'CC BY-SA 2.0 Germany',
    source: 'https://commons.wikimedia.org/wiki/File:Windräder_Mont_Crosin.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/de/deed.en',
  },
  {
    title: 'Floating photovoltaic solar plant on Lac des Toules',
    author: 'Christian David',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Lac_des_Toules_-_Centrale_photovoltaïque.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    title: 'Grand Coulee Dam spillway — hydroelectric generation',
    author: 'U.S. Bureau of Reclamation',
    license: 'Public domain (U.S. federal work)',
    source: 'https://www.usbr.gov/pn/grandcoulee/news/gallery/contemporary/4.html',
    licenseUrl: 'https://www.usa.gov/government-works',
  },
  {
    title: 'Coal-fired power plant emissions obscuring solar radiation',
    author: 'PlainVector',
    license: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Coal-Fired_Power_Plant_Emissions_Obscuring_Solar_Radiation.jpg',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    title: 'Gas Turbine Power Plant',
    author: 'Pro-Per Energy Services',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Gas_Turbine_Power_Plant.JPG',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    title: 'Solar panels on farm buildings in Central Switzerland',
    author: 'GabrielleMerk',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:SolarPanelsFarmRoof.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    title: 'Sunlight in a mature forest',
    author: 'Smilla Heckel',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Sunlight_in_forest.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
] as const;
