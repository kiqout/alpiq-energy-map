import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const assets = [
  ['public/media/hydro-grimsel.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Grimsel-Dam.jpg/1280px-Grimsel-Dam.jpg'],
  ['public/media/nuclear-goesgen-aerial.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Centrale_nucl%C3%A9aire_de_G%C3%B6sgen.jpg/1280px-Centrale_nucl%C3%A9aire_de_G%C3%B6sgen.jpg'],
  ['public/media/thermal-gas-combined-cycle.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/A_view_from_a_natural_gas_combined_cycle_power_plant.jpg/1280px-A_view_from_a_natural_gas_combined_cycle_power_plant.jpg'],
  ['public/media/wind-mont-crosin.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Windr%C3%A4der_Mont_Crosin.jpg/1280px-Windr%C3%A4der_Mont_Crosin.jpg'],
  ['public/media/solar-lac-des-toules.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Lac_des_Toules_-_Centrale_photovolta%C3%AFque.jpg/1280px-Lac_des_Toules_-_Centrale_photovolta%C3%AFque.jpg'],
  ['public/media/env-alpine-landscape.jpg', 'https://commons.wikimedia.org/wiki/Special:FilePath/Summer_Alpine_landscape.jpg?width=1600'],
  ['public/media/env-industrial-emissions.jpg', 'https://commons.wikimedia.org/wiki/Special:FilePath/Coal-Fired_Power_Plant_Emissions_Obscuring_Solar_Radiation.jpg?width=1600'],
  ['public/media/env-gas-turbine.jpg', 'https://commons.wikimedia.org/wiki/Special:FilePath/Gas_Turbine_Power_Plant.JPG?width=1600'],
  ['public/media/env-carbon-capture.jpg', 'https://commons.wikimedia.org/wiki/Special:FilePath/Boundary_Dam_Unit_3_capture_unit.jpg?width=1600'],
  ['public/media/env-alpine-grid.jpg', 'https://commons.wikimedia.org/wiki/Special:FilePath/Mittelplatten_-_Val_Mil%C3%A0.jpg?width=1600'],
  ['public/media/env-tree-seedlings.jpg', 'https://commons.wikimedia.org/wiki/Special:FilePath/Fig_tree_seedlings_in_a_nursery.jpg?width=1600'],
  ['public/media/env-forest-canopy.jpg', 'https://commons.wikimedia.org/wiki/Special:FilePath/Sunlight_in_forest.jpg?width=1600'],
];

const failures = [];
for (const [relativePath, url] of assets) {
  const destination = resolve(relativePath);
  try {
    await mkdir(dirname(destination), { recursive: true });
    try {
      const existing = await stat(destination);
      if (existing.size > 10_000) {
        console.log(`Already present: ${relativePath}`);
        continue;
      }
    } catch { /* File will be downloaded below. */ }

    console.log(`Downloading ${relativePath} ...`);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Alpiq-Energy-Atlas/1.0 (open photo media)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`Unexpected content type: ${contentType || 'missing'}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length < 10_000) throw new Error(`Downloaded file is unexpectedly small (${data.length} bytes)`);
    await writeFile(destination, data);
    console.log(`Saved ${relativePath} (${(data.length / 1024).toFixed(0)} KB)`);
  } catch (error) {
    failures.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`Could not download ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} media file(s) could not be downloaded. The website will use its online fallback URLs where available.`);
  process.exitCode = 1;
} else {
  console.log('\nAll open photo assets are ready in public/media/.');
}
