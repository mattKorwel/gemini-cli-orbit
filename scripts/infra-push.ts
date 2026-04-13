/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

async function main() {
  console.log('🚀 Starfleet Image Factory: Preparing for local push...');

  // 0. Safety Check: Build "inland"
  console.log('🧪 Running local verification (build)...');
  try {
    execSync('npm run build:bundle', { stdio: 'inherit' });
    console.log('✅ Build passed.');
  } catch (_err) {
    console.error('\n❌ Build failed. Aborting push.');
    process.exit(1);
  }

  // 1. Get current Git SHA
  const sha = execSync('git rev-parse --short HEAD').toString().trim();
  const base = 'ghcr.io/mattkorwel';

  const images = [
    {
      name: 'gemini-cli-orbit',
      file: 'orbit-capsule.Dockerfile',
    },
    {
      name: 'orbit-worker',
      file: 'orbit-worker.Dockerfile',
    },
  ];

  for (const img of images) {
    const tagSha = `${base}/${img.name}:${sha}`;
    const tagLatest = `${base}/${img.name}:latest`;

    console.log(`🏗️  Building and Pushing ${img.name} (linux/amd64)...`);

    // Build and push for linux/amd64 (GCE requirement)
    execSync(
      `docker buildx build --platform linux/amd64 -t ${tagSha} -t ${tagLatest} -f ${img.file} --push .`,
      { stdio: 'inherit' },
    );

    console.log(`✅ ${img.name} push complete.`);
  }
}

main().catch((err) => {
  console.error('\n❌ Image push failed:');
  console.error(err.message);
  process.exit(1);
});
