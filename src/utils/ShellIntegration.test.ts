/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShellIntegration } from './ShellIntegration.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('ShellIntegration', () => {
  let integration: ShellIntegration;
  const home = '/Users/testuser';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '');
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'readFileSync').mockReturnValue('');
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
    integration = new ShellIntegration();
  });

  describe('getProfilePaths', () => {
    it('should return correct paths for zsh', () => {
      const paths = integration.getProfilePaths('zsh');
      expect(paths).toContain(path.join(home, '.zshrc'));
    });

    it('should include .zprofile if it exists', () => {
      const zprofile = path.join(home, '.zprofile');
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => p === zprofile);
      const paths = integration.getProfilePaths('zsh');
      expect(paths).toContain(path.join(home, '.zshrc'));
      expect(paths).toContain(zprofile);
    });

    it('should return correct paths for bash on Darwin', () => {
      vi.spyOn(os, 'platform').mockReturnValue('darwin');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const paths = integration.getProfilePaths('bash');
      expect(paths).toContain(path.join(home, '.bash_profile'));
      expect(paths).toContain(path.join(home, '.bashrc'));
      expect(paths).toContain(path.join(home, '.profile'));
    });

    it('should return correct paths for bash on Linux', () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const paths = integration.getProfilePaths('bash');
      expect(paths).toContain(path.join(home, '.bashrc'));
      expect(paths).toContain(path.join(home, '.bash_profile'));
      expect(paths).toContain(path.join(home, '.profile'));
    });
  });

  describe('install', () => {
    it('should install to multiple profiles if they exist', () => {
      const bashrc = path.join(home, '.bashrc');
      const bashProfile = path.join(home, '.bash_profile');
      
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => 
        p === bashrc || p === bashProfile || p === home
      );
      
      const success = integration.install('/path/to/shim', 'bash');
      
      expect(success).toBe(true);
      expect(fs.appendFileSync).toHaveBeenCalledTimes(2);
    });

    it('should create standard profiles if they do not exist', () => {
      const bashrc = path.join(home, '.bashrc');
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => p === home);
      
      const success = integration.install('/path/to/shim', 'bash');
      
      expect(success).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(bashrc, '', expect.any(Object));
      expect(fs.appendFileSync).toHaveBeenCalledWith(bashrc, expect.any(String));
    });
  });
});
