/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ORBIT_BIN_DIR } from '../core/Constants.js';
import { logger } from '../core/Logger.js';
import {
  type IDependencyManager,
  type IProcessManager,
} from '../core/interfaces.js';

const PULUMI_VERSION = '3.229.0';

/**
 * Manages external binary dependencies for Orbit.
 */
export class DependencyManager implements IDependencyManager {
  constructor(private readonly processManager: IProcessManager) {}

  /**
   * Ensures Pulumi CLI is available, downloading it if necessary.
   */
  async ensurePulumi(): Promise<string> {
    const systemPath = this.findInPath('pulumi');
    const localPath = path.join(ORBIT_BIN_DIR, 'pulumi', 'pulumi');
    let binPath = systemPath;

    if (!binPath && fs.existsSync(localPath)) {
      binPath = localPath;
      this.updateProcessPath();
    }

    if (!binPath) {
      logger.info(
        'SETUP',
        '☁️  Pulumi CLI is required for cloud provisioning.',
      );

      let confirmed = process.env.GCLI_ORBIT_AUTO_APPROVE === '1';
      if (!confirmed) {
        confirmed = await this.confirmInstallation();
      } else {
        logger.info('SETUP', '👉 Auto-approving installation...');
      }

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
  private async initializePulumi(): Promise<void> {
    const orbitDir = path.join(ORBIT_BIN_DIR, '..');
    const passphrasePath = path.join(orbitDir, 'pulumi.passphrase');
    const stateDir = path.join(orbitDir, 'state');
    const pulumiHome = path.join(orbitDir, 'pulumi-home');

    // Create directories if they don't exist
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
    if (!fs.existsSync(pulumiHome))
      fs.mkdirSync(pulumiHome, { recursive: true });

    let passphrase = '';
    if (fs.existsSync(passphrasePath)) {
      passphrase = fs.readFileSync(passphrasePath, 'utf8').trim();
    } else {
      passphrase = Math.random().toString(36).slice(-16);
      fs.writeFileSync(passphrasePath, passphrase);
    }

    // Set environment variables for isolation
    process.env.PULUMI_CONFIG_PASSPHRASE = passphrase;
    process.env.PULUMI_HOME = pulumiHome;

    logger.info('SETUP', '   - Initializing local state backend...');
    // Log in to the local filesystem backend inside the Orbit directory
    const res = this.processManager.runSync(
      'pulumi',
      ['login', `file://${stateDir}`],
      {
        stdio: 'inherit',
        env: process.env,
      } as any,
    );

    if (res.status !== 0) {
      throw new Error('Failed to initialize local Pulumi state.');
    }
  }

  private findInPath(bin: string): string | null {
    const res = this.processManager.runSync('which', [bin], { quiet: true });
    if (res.status === 0 && res.stdout.trim()) {
      return res.stdout.trim();
    }
    return null;
  }

  private async confirmInstallation(): Promise<boolean> {
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
          const confirmed =
            answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
          resolve(confirmed);
        },
      );
    });
  }

  private async installPulumi(): Promise<void> {
    const platform = process.platform; // darwin, linux
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const ext = 'tar.gz';
    const url = `https://get.pulumi.com/releases/sdk/pulumi-v${PULUMI_VERSION}-${platform}-${arch}.${ext}`;

    if (!fs.existsSync(ORBIT_BIN_DIR)) {
      fs.mkdirSync(ORBIT_BIN_DIR, { recursive: true });
    }

    const tempArchive = path.join(ORBIT_BIN_DIR, `pulumi.${ext}`);

    logger.info('SETUP', `   - Downloading Pulumi v${PULUMI_VERSION}...`);
    const downloadRes = this.processManager.runSync(
      'curl',
      ['-L', url, '-o', tempArchive],
      {
        stdio: 'inherit',
      } as any,
    );

    if (downloadRes.status !== 0) {
      throw new Error('Failed to download Pulumi.');
    }

    logger.info('SETUP', '   - Extracting binary...');
    const extractRes = this.processManager.runSync(
      'tar',
      ['-xzf', tempArchive, '-C', ORBIT_BIN_DIR],
      {
        stdio: 'inherit',
      } as any,
    );

    if (extractRes.status !== 0) {
      throw new Error('Failed to extract Pulumi.');
    }

    fs.unlinkSync(tempArchive);
    logger.info('SETUP', '✅ Pulumi installed successfully.');
  }

  private updateProcessPath(): void {
    const localBin = path.join(ORBIT_BIN_DIR, 'pulumi');
    if (!process.env.PATH?.includes(localBin)) {
      process.env.PATH = `${localBin}${path.delimiter}${process.env.PATH}`;
    }
  }

  /**
   * Static helper for direct usage (Legacy)
   */
  public static async ensurePulumi(): Promise<string> {
    const { ProcessManager } = await import('../core/ProcessManager.js');
    return new DependencyManager(new ProcessManager()).ensurePulumi();
  }
}
