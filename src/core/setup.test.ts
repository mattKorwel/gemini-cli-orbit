/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSetup } from './setup.js';
import * as ConfigManager from './ConfigManager.js';

const mockProvisionStation = vi.fn().mockResolvedValue(0);

vi.mock('./OrbitSDK.js', () => ({
  OrbitSDK: vi.fn().mockImplementation(() => ({
    provisionStation: mockProvisionStation,
  })),
}));

vi.mock('./ConfigManager.js');

describe('runSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ConfigManager.detectRepoName as any).mockReturnValue('repo');
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      instanceName: 'test-i',
      projectId: 'p',
    });
  });

  it('should run setup flow and wake up station', async () => {
    const res = await runSetup([]);
    expect(res).toBe(0);
    expect(mockProvisionStation).toHaveBeenCalled();
  });

  it('should decommission infrastructure when --destroy is provided', async () => {
    // Note: runSetup implementation handles destroy via cliFlags.destroy
    // but the test calls it with args.
    // My new runSetup uses cliFlags.destroy.
    const res = await runSetup([], { destroy: true } as any);
    expect(res).toBe(0);
    expect(mockProvisionStation).toHaveBeenCalledWith(
      expect.objectContaining({ destroy: true }),
    );
  });

  it('should ignore "liftoff" when passed as the first argument', async () => {
    const res = await runSetup(['liftoff', 'default']);
    expect(res).toBe(0);
    expect(mockProvisionStation).toHaveBeenCalledWith(
      expect.objectContaining({ schematicName: 'default' }),
    );
  });
});
