/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

async function main() {
  console.log('🚀 Starfleet Image Factory: Preparing for local push...');

  // 1. Get current Git SHA
  const sha = execSync('git rev-parse --short HEAD').toString().trim();
  const imageBase = 'ghcr.io/mattkorwel/gemini-cli-orbit';
  const tagSha = `${imageBase}:${sha}`;
  const tagLatest = `${imageBase}:latest`;

  console.log(`📌 Target SHA: ${sha}`);

  // 2. Build Image (Multi-Arch support for GCE amd64)
  console.log('🏗️  Building Starfleet Image (linux/amd64)...');
  execSync(
    `docker buildx build --platform linux/amd64 -t ${tagSha} -t ${tagLatest} -f orbit-capsule.Dockerfile --push .`,
    { stdio: 'inherit' },
  );

  // Note: --push is handled by buildx above, so we don't need a separate docker push command
  // but we still need the login.

  console.log('\n✅ Local push complete.');
  console.log(`   Image: ${tagSha}`);
  console.log(
    '   Note: "latest" was built but not pushed. Use CI for production latest.',
  );
}

main().catch((err) => {
  console.error('\n❌ Image push failed:');
  console.error(err.message);
  process.exit(1);
});
