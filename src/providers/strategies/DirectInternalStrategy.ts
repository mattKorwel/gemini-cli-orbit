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

    // Construction: nic0.<name>.<zone>.c.<project>.<suffix>
    // Suffix defaults to 'internal' if not specified.
    const customSuffix = this.infra.dnsSuffix || '';
    const baseSuffix = `.c.${this.projectId}`;
    if (!this.projectId) {
      console.warn('⚠️ WARNING: DirectInternalStrategy: projectId is missing!');
    }

    let fullSuffix = baseSuffix;
    if (customSuffix) {
      fullSuffix += customSuffix.startsWith('.')
        ? customSuffix
        : `.${customSuffix}`;
    } else {
      fullSuffix += '.internal';
    }

    return `${user}@nic0.${this.instanceName}.${this.zone}${fullSuffix}`;
  }
}
