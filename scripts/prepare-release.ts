/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const EXTENSION_JSON_PATH = path.join(REPO_ROOT, 'gemini-extension.json');

function main() {
  const bumpType = process.argv[2] || 'patch';
  if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('❌ Usage: npm run version:release <patch|minor|major>');
    process.exit(1);
  }

  console.log(`🚀 Bumping version (${bumpType})...`);

  // 1. Bump version using npm (updates package.json and package-lock.json)
  // We use --no-git-tag-version because we want to sync with gemini-extension.json first
  try {
    execSync(`npm version ${bumpType} --no-git-tag-version`, { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ Failed to bump npm version:', err);
    process.exit(1);
  }

  // 2. Read the new version from package.json
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const newVersion = pkg.version;

  // 3. Update gemini-extension.json
  console.log(`   - Syncing gemini-extension.json to version ${newVersion}...`);
  const extensionJson = JSON.parse(fs.readFileSync(EXTENSION_JSON_PATH, 'utf8'));
  extensionJson.version = newVersion;
  fs.writeFileSync(EXTENSION_JSON_PATH, JSON.stringify(extensionJson, null, 2) + '\n');

  console.log(`✅ Version synchronized to ${newVersion}.`);
  console.log(`\nNext steps:`);
  console.log(`1. git add package.json package-lock.json gemini-extension.json`);
  console.log(`2. git commit -m "chore: release v${newVersion}"`);
  console.log(`3. Create a PR, merge to main.`);
  console.log(`4. git tag v${newVersion} && git push origin v${newVersion}`);
}

main();
