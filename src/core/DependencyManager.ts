/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';
import { ORBIT_BIN_DIR } from './Constants.js';
import { logger } from './Logger.js';

const PULUMI_VERSION = '3.109.0';

/**
 * Manages external binary dependencies for Orbit.
 */
export class DependencyManager {
  /**
   * Ensures Pulumi CLI is available, downloading it if necessary.
   */
  static async ensurePulumi(): Promise<string> {
    const systemPath = this.findInPath('pulumi');
    const localPath = path.join(ORBIT_BIN_DIR, 'pulumi', 'pulumi');
    let binPath = systemPath;

    if (!binPath && fs.existsSync(localPath)) {
      binPath = localPath;
      this.updateProcessPath();
    }

    if (!binPath) {
      logger.info('SETUP', '☁️  Pulumi CLI is required for cloud provisioning.');
      const confirmed = await this.confirmInstallation();

      if (!confirmed) {
        throw new Error(
          'Pulumi CLI is required for this operation. Please install it manually or allow Orbit to manage it.',
        );
      }

      await this.installPulumi();
      this.updateProcessPath();
      binPath = localPath;
    }

    await this.initializePulumi();
    return binPath;
  }

  /**
   * Initializes Pulumi for local state management (ADR 16).
   */
  private static async initializePulumi(): Promise<void> {
    const passphrasePath = path.join(ORBIT_BIN_DIR, '..', 'pulumi.passphrase');
    let passphrase = '';

    if (fs.existsSync(passphrasePath)) {
      passphrase = fs.readFileSync(passphrasePath, 'utf8').trim();
    } else {
      passphrase = Math.random().toString(36).slice(-16);
      fs.writeFileSync(passphrasePath, passphrase);
    }

    process.env.PULUMI_CONFIG_PASSPHRASE = passphrase;

    logger.info('SETUP', '   - Initializing local state backend...');
    const res = spawnSync('pulumi', ['login', '--local'], {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });

    if (res.status !== 0) {
      throw new Error('Failed to initialize local Pulumi state.');
    }
  }

  private static findInPath(bin: string): string | null {
    const res = spawnSync('which', [bin], { stdio: 'pipe', encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) {
      return res.stdout.trim();
    }
    return null;
  }

  private static async confirmInstallation(): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n----------------------------------------------------------');
    console.log('DEPENDENCY REQUIRED: Pulumi CLI');
    console.log('Orbit uses Pulumi for declarative cloud provisioning.');
    console.log(`Location: ${ORBIT_BIN_DIR}`);
    console.log('----------------------------------------------------------\n');

    return new Promise((resolve) => {
      rl.question(
        `👉 Do you want Orbit to automatically download and install Pulumi v${PULUMI_VERSION} locally? (yes/no): `,
        (answer) => {
          rl.close();
          const confirmed = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
          resolve(confirmed);
        },
      );
    });
  }

  private static async installPulumi(): Promise<void> {
    const platform = process.platform; // darwin, linux
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const ext = 'tar.gz';
    const url = `https://get.pulumi.com/releases/sdk/pulumi-v${PULUMI_VERSION}-${platform}-${arch}.${ext}`;

    if (!fs.existsSync(ORBIT_BIN_DIR)) {
      fs.mkdirSync(ORBIT_BIN_DIR, { recursive: true });
    }

    const tempArchive = path.join(ORBIT_BIN_DIR, `pulumi.${ext}`);

    logger.info('SETUP', `   - Downloading Pulumi v${PULUMI_VERSION}...`);
    const downloadRes = spawnSync('curl', ['-L', url, '-o', tempArchive], {
      stdio: 'inherit',
    });

    if (downloadRes.status !== 0) {
      throw new Error('Failed to download Pulumi.');
    }

    logger.info('SETUP', '   - Extracting binary...');
    const extractRes = spawnSync('tar', ['-xzf', tempArchive, '-C', ORBIT_BIN_DIR], {
      stdio: 'inherit',
    });

    if (extractRes.status !== 0) {
      throw new Error('Failed to extract Pulumi.');
    }

    fs.unlinkSync(tempArchive);
    logger.info('SETUP', '✅ Pulumi installed successfully.');
  }

  private static updateProcessPath(): void {
    const localBin = path.join(ORBIT_BIN_DIR, 'pulumi');
    if (!process.env.PATH?.includes(localBin)) {
      process.env.PATH = `${localBin}${path.delimiter}${process.env.PATH}`;
    }
  }
}
