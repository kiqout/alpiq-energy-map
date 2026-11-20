# Alpiq Energy Atlas

An independent React + TypeScript + Three.js visualization of Alpiq's publicly reported electricity production. The interactive globe is oriented towards Europe and displays a satellite-style night-light texture that fades in smoothly when the scene loads or the selected region changes. A lighting-demand comparison can switch between percentage coverage for the same reporting period and equivalent days of regional building and outdoor lighting. The app also includes year selection, technology and country breakdowns, expanded climate data context and a methodology section.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm ci
npm run dev
```

Open the local URL printed by the development server (normally `http://localhost:5173`).

```bash
npm run build       # production build in dist/
npm run typecheck   # TypeScript check
npm test            # calculation and dataset consistency tests
```

## What's included

- 3D Earth with a satellite-style night-light texture, a subtle atmospheric rim, orbit controls and zoom. No plant or country pins are shown on the globe.
- The globe's city lights remain a fixed geographic night-light image, but they reveal gradually on initial load and on region changes. Switzerland instead uses a separate 3D terrain scene with orthophoto and VIIRS night-light layers, with a softer fade when switching surface modes. Alpiq's generation is shown separately as an equivalent share of regional lighting demand; it is not mapped to specific electricity deliveries.
- Annual / interim production selector for 2024, 2025 and H1 2026.
- Interface translations in English, German, French, Italian and Romansh; the selected language is saved locally in the browser.
- Lighting comparison toggle: percentage of estimated demand in the same reporting period or equivalent days at the selected region’s normal lighting load.
- Country production remains available as a bar breakdown. Technology production uses real open-license photo cards with a subtle slow zoom; the original chart and table remain available in a details panel.
- Installed capacity where a verified full-year value is available.
- A climate comparison based on Alpiq's equity-share Scope 1+2 detail table, with six distinct real-photo backgrounds specific to the environmental metrics.
- Lighting-demand equivalent: the day display expresses Alpiq production as days of lighting at the selected region’s normal annual load; the percentage display compares production with estimated lighting demand over the exact same reporting period.
- Source links and in-app notes for reporting-period and methodology caveats.


## Separate Swiss 3D terrain mode

When Switzerland is selected, the Earth globe is replaced with a dedicated tilted 3D terrain model of the country. Europe and World continue to use the interactive globe. The Swiss scene has two views:

- **Satellite:** current SWISSIMAGE orthophoto (orthorectified aerial photography) with real elevation-derived surface geometry and swissALTI3D multidirectional hillshade.
- **Night lights:** the same terrain and geography, color-graded into a dark atlas, with annual VIIRS 2024 satellite radiance and restrained GLSL city glow. The glow is a visualization effect; it does not map Alpiq's physical electricity deliveries. The 2,110 point layer is an even illustrative distribution matched to the Federal Statistical Office municipality count on 01.01.2026, not a set of official municipality centroids.

The model includes a cut-out national outline, restrained canton boundaries, lakes, rivers, labels for major Swiss cities and an evenly distributed 2,110-point municipality light layer. Drag to rotate the model and use the wheel to zoom. The height mesh uses public Copernicus DEM GLO-30 tiles where available and automatically falls back per tile to GLO-90 when a 30 m tile is not publicly released. The height source is a digital surface model and can include buildings and vegetation; it is resampled for a manageable WebGL mesh and vertically exaggerated 6.5× for readability. swissALTI3D hillshade adds a finer visual relief cue.

### Build the local terrain assets (one-time setup)

The ZIP includes the generated terrain rasters and vectors, so the map works without rebuilding them. To refresh the terrain assets from public sources, double-click `BUILD_SWISS_3D_SCENE.bat` on Windows. It creates an isolated `.venv-swiss-terrain`, installs `scripts/requirements-swiss-terrain.txt`, rebuilds the map assets, and then regenerates the 2,110 municipality-count light markers:

- `public/terrain/ch_satellite.jpg` — SWISSIMAGE orthophoto from swisstopo.
- `public/terrain/ch_hillshade.png` — swissALTI3D multidirectional hillshade from swisstopo.
- `public/terrain/ch_height_u16.bin` — resampled Copernicus DEM GLO-30 height grid.
- `public/terrain/ch_night_radiance.png` — 2024 VIIRS radiance, contrast-normalized for display.
- `public/terrain/ch_mask.png`, `ch_vectors.json`, `ch_scene.json` — country mask, map overlays and scene metadata.
- `public/terrain/ch_municipality_lights.bin` — 2,110 normalized surface-light positions, generated with `python scripts/build-municipality-lights.py`.

After the build completes, restart the app with `npm run dev` and select **Switzerland**. The mode switch is local and does not change the annual Alpiq statistics.

If a WMS image request is not supported by the source layer, the builder automatically falls back to the official swisstopo WMTS tile service. The Copernicus DEM COG tiles are read from the public AWS open-data buckets; missing GLO-30 tiles are replaced by GLO-90 tiles to preserve full coverage. The VIIRS source is the 2024 annual VNL product distributed through the public OpenGeoHub Zenodo record.

Data references:
- [swisstopo SWISSIMAGE / official map services](https://docs.geo.admin.ch/visualize-data/wmts.html)
- [swisstopo swissALTI3D](https://www.swisstopo.admin.ch/en/height-model-swissalti3d)
- [Copernicus DEM GLO-30 open data](https://registry.opendata.aws/copernicus-dem/)
- [Annual VIIRS nighttime lights, 2012–2024](https://zenodo.org/records/17294744)

## Data and methodology notes

The application uses publicly accessible Alpiq reports. The municipality marker count is based on the Federal Statistical Office register: 2,110 municipalities on 1 January 2026. The locations are illustrative surface markers generated over the land mask, not official administrative centroids. Source: [FSO municipality register and 2026 map](https://statistik.admin.ch/en/asset/36390081). The displayed production values are Alpiq's share of power-plant production, not the total output of the countries where assets operate.

- **2024:** 17,281 GWh and 5,721 MW from the Annual Report 2024 production table.
- **2025:** 14,860 GWh and 5,616 MW from the Annual Report 2025 production table.
- **2026:** 7,758 GWh in H1 2026, provisional/interim data only. It is compared with 7,452 GWh in H1 2025; it is not annualized.
- Country and technology totals may differ from the group total by approximately 1 GWh or 1 MW because the source tables are rounded.
- The 2024 production table's 427 GWh category is small-scale hydropower, wind and photovoltaics; it is allocated to Switzerland, France and Italy using the country breakdown in that report.
- Alpiq's 2025 report compares own production with a restated 2024 figure of 18,898 GWh (−21%). The 2024 report's production-by-technology table reports 17,281 GWh. These published bases differ; the app discloses the restated comparison rather than silently calculating a non-like-for-like percentage.
- Climate intensities use Alpiq's equity-share Scope 1+2 table. The corresponding production denominator is 18,950 GWh for 2024 and 14,918 GWh for 2025; it differs from the production-overview values.
- The 2025 report landing page shows a headline group intensity of 99.4 g CO₂e/kWh, while its detailed equity-share table reports 83.9 g/kWh. This app uses 83.9 for calculations because the table provides the matching Scope 1+2 emissions and production denominator, and also discloses the headline value.
- The gas-fleet comparison is a hypothetical benchmark: it shows the difference between the reported group production intensity and the same year's gas-fleet intensity. It is **not** a measurement of CO₂ physically prevented.
- The tree-equivalent uses an illustrative assumption of 22 kg CO₂ absorbed per tree per year. It does not mean Alpiq physically saved or planted that number of trees.
- The globe's night-light texture is geographic visual context, not a map of Alpiq's electricity deliveries or ownership. Its city lights do not brighten or dim when the selected year changes.
- The global lighting benchmark is the IEA estimate of about 2,200 TWh in 2024 for building and outdoor lighting, excluding industrial and agricultural lighting. It is a lighting-only comparison, not total world electricity demand.
- For the percentage display, Alpiq's generation is compared with estimated regional lighting demand over the exact number of days in the reporting period. The day display expresses the same energy as equivalent lighting days at the selected region's normal annual lighting load. For H1 2026, the actual interim production and its 181-day period are used; production is not annualized.

## Main official sources

- [Alpiq Annual Report 2025 – production](https://reports.alpiq.com/25/about-us)
- [Alpiq Annual Report 2025 – climate change](https://reports.alpiq.com/25/climate-change)
- [Alpiq Annual Report 2025 – key financial figures](https://reports.alpiq.com/25/key-financial-figures)
- [Alpiq Annual Report 2024 – production](https://reports.alpiq.com/24/about-us)
- [Alpiq Interim Report 2026](https://www.alpiq.com/fileadmin/ALPIQ/newsroom/publications/interim_report/alpiq_interim_report_2026_en.pdf)
- [IEA – The next wave of LED deployment](https://www.iea.org/commentaries/the-next-wave-of-led-deployment-smarter-circular-and-more-efficient)

This is an independent project and is not an official Alpiq product.

## Globe resolution tiers
- Renderer uses a pixel budget (up to 3840×2160 on strong desktops, ~4 MP default, ~1.6 MP weak/mobile) instead of a fixed DPR cap.
- Night texture: `tex/night_2k.jpg` (weak devices), `tex/night.jpg` (4096×2048, default). Optional `tex/night_8k.jpg` (e.g. NASA Black Marble, 8192×4096+) is loaded progressively on strong desktops only when zoomed in; tune its look to match the 4K texture (the shader keys off warm/red light values).
- `public/geo/switzerland-detail.json` (Natural Earth 10m: border, cantons, lakes, rivers, cities) is loaded on first Swiss/near zoom. Rebuild with `python3 scripts/build-detail.py <dir with ne_10m_*.geojson>`.
- Optional real assets (not shipped): `public/tex/ch_night.jpg` — Swiss night-lights raster covering exactly lon 5.0–11.4, lat 45.3–48.3 (equirectangular, north up); `public/tex/night_8k.jpg` — global 8192×4096+. Both are existence-checked (HEAD, image content-type) and logged via `console.info`; `data-ch-night` / `data-night-tier` on `.globe` show what is active.


## Swiss night-light presentation

The Switzerland 3D scene layers generalized A1, A2, A3, A9, A12 and A13 transport corridors over the terrain as warm, three-layer light trails. These lines are intentionally illustrative: they are not surveyed road geometry, power lines, or a representation of electricity flow. The dense secondary glow points are detected from the included VIIRS 2024 radiance texture; the named city markers remain sourced from the local vector dataset.

Climate metrics and generation technologies use compact inline SVG symbols in a consistent style instead of emoji. Country allocation bars use locally rendered SVG flags. They are local project assets and do not require an icon CDN or an additional runtime dependency. See `src/components/ICON_ATTRIBUTION.txt` for the icon-resource reference.


## Real photo media

The **Production by technology** and **Environmental impact comparison** cards use separate sets of real photographs. The production cards now show the Grimsel Dam, an aerial view of the Gösgen nuclear plant, a gas-fired combined-cycle plant, Mont-Crosin wind turbines and the floating photovoltaic plant on Lac des Toules. Wind and floating solar occupy equal halves of one card, each with its own label. Photo-reference captions identify the depicted locations, the share badge states each technology’s share of production, and the capacity line is explicitly labeled as installed capacity. The six environmental cards keep their separate image set. All photos have a subtle slow-zoom treatment, while the original image files remain unchanged.

Photo assets can be downloaded into `public/media/` with `npm run media:download`. If the new local files are not present, the technology cards fall back to the corresponding public Wikimedia image URLs and therefore need an internet connection. Source links, authors and licenses are listed in `MEDIA-CREDITS.md` and in the in-app **Photo credits & licenses** disclosure. Retain that attribution when redistributing the project. All photo motion respects `prefers-reduced-motion`. The original technology chart and capacity table remain available under **View detailed figures**.
#   a l p i q - e n e r g y - m a p  
 #   a l p i q - e n e r g y - m a p  
 #   a l p i q - e n e r g y - m a p  
 