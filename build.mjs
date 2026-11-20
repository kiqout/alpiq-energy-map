// Bundles the app with esbuild. `node build.mjs` -> dist/, `node build.mjs --serve` -> dev server.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';

const serve = process.argv.includes('--serve');
const out = 'dist';

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/assets`, { recursive: true });
if (existsSync('public')) cpSync('public', out, { recursive: true });
writeFileSync(`${out}/index.html`, readFileSync('index.html', 'utf8'));

const options = {
  entryPoints: { app: 'src/main.tsx' },
  outdir: `${out}/assets`,
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  target: 'es2022',
  sourcemap: true,
  minify: !serve,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': serve ? '"development"' : '"production"' },
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 5173 });
  console.log(`Dev server: http://localhost:${port}`);
} else {
  const res = await esbuild.build({ ...options, metafile: true });
  const bytes = Object.values(res.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
  console.log(`Built ${(bytes / 1024).toFixed(0)} KB -> ${out}/`);
}
