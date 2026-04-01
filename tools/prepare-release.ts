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

  // 0. Check for clean working directory
  try {
    const status = execSync('git status --porcelain').toString();
    if (status.trim().length > 0) {
      console.error(
        '❌ Working directory is not clean. Please commit or stash changes first.',
      );
      process.exit(1);
    }
  } catch (_err) {
    console.error('❌ Failed to check git status.');
    process.exit(1);
  }

  console.log(`🚀 Bumping version (${bumpType})...`);

  // 1. Bump version using npm (updates package.json and package-lock.json)
  try {
    execSync(`npm version ${bumpType} --no-git-tag-version`, {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('❌ Failed to bump npm version:', err);
    process.exit(1);
  }

  // 2. Read the new version from package.json
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const newVersion = pkg.version;
  const tag = `v${newVersion}`;

  // 3. Update gemini-extension.json
  console.log(`   - Syncing gemini-extension.json to version ${newVersion}...`);
  const extensionJson = JSON.parse(
    fs.readFileSync(EXTENSION_JSON_PATH, 'utf8'),
  );
  extensionJson.version = newVersion;
  fs.writeFileSync(
    EXTENSION_JSON_PATH,
    JSON.stringify(extensionJson, null, 2) + '\n',
  );

  // 4. Git Operations
  console.log(`   - Committing and tagging ${tag}...`);
  try {
    execSync(`git add package.json package-lock.json gemini-extension.json`, {
      stdio: 'inherit',
    });
    execSync(`git commit -m "chore: release ${tag}"`, { stdio: 'inherit' });
    execSync(`git tag -a ${tag} -m "Release ${tag}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ Git operations failed:', err);
    process.exit(1);
  }

  console.log(
    `\n✅ Version synchronized, committed, and tagged locally as ${tag}.`,
  );
  console.log(`\nNext steps:`);
  console.log(`1. Push with tags: git push origin HEAD --tags`);
  console.log(
    `2. Create a PR for the commit if on a branch, or merge directly.`,
  );
}

main();
