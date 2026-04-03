/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseStrategy } from './BaseStrategy.js';

export class DirectInternalStrategy extends BaseStrategy {
  getBackendType(): string {
    return 'direct-internal';
  }

  getMagicRemote(): string {
    const user = this.getStandardUser();
    if (this.overrideHost) {
      return `${user}@${this.overrideHost}`;
    }

    // nic0.<name>.<zone>.c.<project>.internal[.<custom-suffix>]
    const customSuffix = this.infra.dnsSuffix || '';
    const baseSuffix = `.c.${this.projectId}.internal`;
    if (!this.projectId) {
      console.warn('⚠️ WARNING: DirectInternalStrategy: projectId is missing!');
    }
    const fullSuffix =
      baseSuffix +
      (customSuffix.startsWith('.')
        ? customSuffix
        : customSuffix
          ? '.' + customSuffix
          : '');

    return `${user}@nic0.${this.instanceName}.${this.zone}${fullSuffix}`;
  }
}
