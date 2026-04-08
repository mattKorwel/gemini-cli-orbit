/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const banner = {
  js: `import { createRequire as _createRequire } from 'module';
import { fileURLToPath as _fileURLToPath } from 'url';
import { dirname as _dirname } from 'path';
const require = _createRequire(import.meta.url);
const __filename = _fileURLToPath(import.meta.url);
const __dirname = _dirname(__filename);`,
};

const commonConfig: esbuild.BuildOptions = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  minify: true,
  sourcemap: true,
  target: 'node20',
  external: ['vitest', 'node:*'],
  banner,
};

async function build() {
  console.log('🚀 Bundling Orbit...');

  const entries = [
    { in: 'src/cli/cli.ts', out: 'bundle/orbit-cli.js' },
    { in: 'src/mcp/mcp.ts', out: 'bundle/mcp-server.js' },
    { in: 'src/station/server.ts', out: 'bundle/orbit-server.js' },
    { in: 'src/station/capsule/mission.ts', out: 'bundle/mission.js' },
    { in: 'src/station/station.ts', out: 'bundle/station.js' },
    { in: 'src/station/capsule/hooks.ts', out: 'bundle/hooks.js' },
  ];

  for (const entry of entries) {
    console.log(`   - Building ${entry.in} -> ${entry.out}`);
    await esbuild.build({
      ...commonConfig,
      entryPoints: [entry.in],
      outfile: entry.out,
    });
  }

  // Bundle playbooks
  console.log('   - Building Playbooks -> bundle/playbooks/');
  await esbuild.build({
    ...commonConfig,
    entryPoints: ['src/playbooks/*.ts'],
    outdir: 'bundle/playbooks',
  });

  // Bundle utils
  console.log('   - Building Utils -> bundle/utils/');
  await esbuild.build({
    ...commonConfig,
    entryPoints: ['src/utils/*.ts', 'src/utils/*.js', 'src/utils/*.mjs'],
    outdir: 'bundle/utils',
  });

  console.log('✨ Bundle complete!');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
