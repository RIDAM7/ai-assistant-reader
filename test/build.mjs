/**
 * Bundle the parser and the export builders to plain ESM so node:test can
 * import them — the same bundler the extension uses, no test-time TS loader.
 */
import { build } from 'esbuild';

for (const [entry, outfile] of [
  ['src/parser/index.ts', 'test/.parser.mjs'],
  ['src/storage/export.ts', 'test/.export.mjs'],
]) {
  await build({ entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'warning' });
}
