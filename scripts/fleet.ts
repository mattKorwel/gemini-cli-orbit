/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadSettings, saveSettings } from './ConfigManager.js';
import { DesignManager } from './DesignManager.js';
import { logger } from './Logger.js';

/**
 * Design: Manage and switch between infrastructure designs (profiles).
 */
export async function runDesign(args: string[]) {
  const manager = new DesignManager();
  const settings = loadSettings();
  const designs = manager.listDesigns();

  const subCommand = args[0]; // e.g., 'station'
  const action = args[1]; // e.g., 'list', 'create', 'edit'
  const name = args[2]; // e.g., 'corp'

  if (subCommand !== 'station') {
    console.log(
      '\nUsage: orbit design station <list|create|edit|switch> [name]\n',
    );
    return 0;
  }

  if (!action || action === 'list') {
    console.log('\n📐 ORBIT INFRASTRUCTURE DESIGNS');
    console.log('--------------------------------------------------');
    designs.forEach((d) => {
      const isActive = d === settings.activeProfile;
      console.log(`${isActive ? '➡️ ' : '  '} ${d}`);
    });
    console.log('--------------------------------------------------');
    console.log(
      'Use "orbit design station switch <name>" to change active profile.',
    );
    console.log(
      'Use "orbit design station create <name>" to run the wizard.\n',
    );
    return 0;
  }

  if (action === 'create' || action === 'edit') {
    if (!name) {
      console.error(
        '❌ Please specify a design name (e.g., orbit design station create corp)',
      );
      return 1;
    }
    await manager.runWizard(name);
    return 0;
  }

  if (action === 'switch') {
    if (!name) {
      console.error('❌ Please specify a design name to switch to.');
      return 1;
    }
    if (!designs.includes(name)) {
      console.error(`❌ Design "${name}" not found.`);
      return 1;
    }
    settings.activeProfile = name;
    saveSettings(settings);
    logger.info('CONFIG', `✨ Switched active design to: ${name}`);
    return 0;
  }

  return 0;
}
