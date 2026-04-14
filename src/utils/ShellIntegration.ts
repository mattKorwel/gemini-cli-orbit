/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../core/Logger.js';
import { type IShellIntegration } from '../core/interfaces.js';

/**
 * Manages shell profile integration for Gemini Orbit.
 */
export class ShellIntegration implements IShellIntegration {
  private readonly home: string;

  constructor() {
    this.home = os.homedir();
  }

  /**
   * Detects the current shell based on environment variables and OS.
   */
  detectShell(): string {
    // Explicit override via environment
    if (process.env.GCLI_ORBIT_SHELL) return process.env.GCLI_ORBIT_SHELL;

    const shellPath = process.env.SHELL || '';
    if (shellPath.includes('zsh')) return 'zsh';
    if (shellPath.includes('bash')) return 'bash';
    if (shellPath.includes('fish')) return 'fish';

    // Windows/PowerShell detection
    if (os.platform() === 'win32' || process.env.PSModulePath) {
      return 'powershell';
    }

    return 'unknown';
  }

  /**
   * Returns all shells that are available and have a profile on the system.
   */
  getAvailableShells(): string[] {
    const shells = ['zsh', 'bash', 'fish', 'powershell'];
    const available: string[] = [];

    for (const shell of shells) {
      const profilePaths = this.getProfilePaths(shell);
      if (profilePaths.some((p) => fs.existsSync(p))) {
        available.push(shell);
      }
    }

    // Always include the detected current shell even if profile doesn't exist yet
    const current = this.detectShell();
    if (current !== 'unknown' && !available.includes(current)) {
      available.push(current);
    }

    return available;
  }

  /**
   * Returns the primary profile path for the detected shell.
   */
  getProfilePath(shell: string): string | null {
    const paths = this.getProfilePaths(shell);
    return (paths.length > 0 ? paths[0] : null) as string | null;
  }

  /**
   * Returns all possible profile paths for a given shell.
   */
  getProfilePaths(shell: string): string[] {
    const paths: string[] = [];
    switch (shell) {
      case 'zsh': {
        paths.push(path.join(this.home, '.zshrc'));
        const zprofile = path.join(this.home, '.zprofile');
        if (fs.existsSync(zprofile)) paths.push(zprofile);
        break;
      }
      case 'bash': {
        const bashrc = path.join(this.home, '.bashrc');
        const bashProfile = path.join(this.home, '.bash_profile');
        const profile = path.join(this.home, '.profile');

        // On Darwin, .bash_profile is the primary login shell profile
        if (os.platform() === 'darwin') {
          paths.push(bashProfile);
          if (fs.existsSync(bashrc)) paths.push(bashrc);
          if (fs.existsSync(profile)) paths.push(profile);
        } else {
          // On Linux, .bashrc is the primary interactive profile
          paths.push(bashrc);
          if (fs.existsSync(bashProfile)) paths.push(bashProfile);
          if (fs.existsSync(profile)) paths.push(profile);
        }
        break;
      }
      case 'fish':
        paths.push(path.join(this.home, '.config', 'fish', 'config.fish'));
        break;
      case 'powershell': {
        const psDirName =
          os.platform() === 'win32' ? 'PowerShell' : 'powershell';
        const psDocsPath = path.join(this.home, 'Documents', psDirName);
        const psConfigPath = path.join(this.home, '.config', psDirName);
        const targetDir = fs.existsSync(psDocsPath)
          ? psDocsPath
          : fs.existsSync(psConfigPath)
            ? psConfigPath
            : psDocsPath;
        paths.push(path.join(targetDir, 'Microsoft.PowerShell_profile.ps1'));
        break;
      }
    }
    return [...new Set(paths)]; // Deduplicate
  }

  /**
   * Installs the orbit alias/function and autocompletion into the shell profile.
   */
  install(shimPath: string, targetShell?: string): boolean {
    const shell = targetShell || this.detectShell();
    const profilePaths = this.getProfilePaths(shell);

    if (profilePaths.length === 0) {
      logger.error(
        'SHELL',
        `Could not determine profile paths for shell: ${shell}`,
      );
      return false;
    }

    const integration = this.generateIntegration(shell, shimPath);
    let anySuccess = false;

    for (const profilePath of profilePaths) {
      if (this.isInstalled(profilePath)) {
        logger.info(
          'SHELL',
          `Orbit integration already present in ${profilePath}. Updating...`,
        );
        this.uninstall(profilePath);
      }

      try {
        const dir = path.dirname(profilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Create a backup before modifying if it exists
        if (fs.existsSync(profilePath)) {
          const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-')
            .slice(0, 19);
          const backupPath = `${profilePath}.bak.${timestamp}`;
          fs.copyFileSync(profilePath, backupPath);
          logger.info('SHELL', `Created backup of your profile: ${backupPath}`);
        } else {
          // Only create files that are "standard" for the shell if they don't exist
          const isStandard =
            (shell === 'zsh' && profilePath.endsWith('.zshrc')) ||
            (shell === 'bash' &&
              (profilePath.endsWith('.bashrc') ||
                profilePath.endsWith('.bash_profile'))) ||
            shell === 'fish' ||
            shell === 'powershell';

          if (!isStandard) continue;

          fs.writeFileSync(profilePath, '', { mode: 0o644 });
        }

        fs.appendFileSync(profilePath, `\n${integration}\n`);
        logger.info(
          'SHELL',
          `✅ Added orbit CLI and autocompletion to ${profilePath}`,
        );
        anySuccess = true;
      } catch (e) {
        logger.error('SHELL', `Failed to write to ${profilePath}: ${e}`);
      }
    }

    if (anySuccess) {
      const sourceCmd =
        shell === 'powershell'
          ? `. $PROFILE`
          : shell === 'fish'
            ? `source ${profilePaths[0]}`
            : `source ${profilePaths[0]}`;

      logger.info('SHELL', `👉 Restart your shell or run: ${sourceCmd}`);
    }

    return anySuccess;
  }


  /**
   * Removes the integration block from a profile.
   */
  private uninstall(profilePath: string): void {
    if (!fs.existsSync(profilePath)) return;
    const content = fs.readFileSync(profilePath, 'utf8');
    const header = '# Gemini Orbit Shell Integration';
    const footer = '# End Gemini Orbit Shell Integration';

    if (content.includes(header)) {
      const startIndex = content.indexOf(header);
      const endIndex = content.indexOf(footer, startIndex);

      if (endIndex !== -1) {
        const fullBlock = content.substring(
          startIndex,
          endIndex + footer.length,
        );
        // Also remove leading/trailing newlines to keep profile clean
        const newContent = content
          .replace(new RegExp(`\\n?${this.escapeRegExp(fullBlock)}\\n?`), '\n')
          .trim();
        fs.writeFileSync(profilePath, newContent + '\n');
      }
    }
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Checks if the shell integration is already present in the given profile.
   */
  isInstalled(profilePath: string): boolean {
    if (!fs.existsSync(profilePath)) return false;
    const content = fs.readFileSync(profilePath, 'utf8');
    return content.includes('# Gemini Orbit Shell Integration');
  }

  private generateIntegration(shell: string, shimPath: string): string {
    const header = '# Gemini Orbit Shell Integration';
    const footer = '# End Gemini Orbit Shell Integration';
    const commands =
      'ci install-shell jettison liftoff mission pulse schematic splashdown station uplink';
    const quotedShim = `"${shimPath}"`;

    // Determine if we should use node or tsx
    const exec = shimPath.endsWith('.js') ? 'node' : 'node --import tsx';

    if (shell === 'powershell') {
      return `${header}
function orbit { ${exec} ${quotedShim} @args }
$orbit_completions = @('ci', 'install-shell', 'jettison', 'liftoff', 'mission', 'pulse', 'schematic', 'splashdown', 'station', 'uplink')
Register-ArgumentCompleter -CommandName orbit -ParameterName args -ScriptBlock {
    param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
    $orbit_completions | Where-Object { $_ -like "$wordToComplete*" }
}
${footer}`;
    }

    if (shell === 'zsh') {
      return `${header}
alias orbit='${exec} ${quotedShim}'
_orbit() {
  local -a commands
  commands=(
    'ci:Monitor CI status for a branch with noise filtering.'
    'install-shell:Install Orbit shell aliases and tab-completion.'
    'jettison:Decommission a specific mission and its worktree.'
    'liftoff:Build or wake infrastructure (use --with-new-station).'
    'mission:Start, resume, or perform maneuvers on a PR mission.'
    'pulse:Check station health and active mission status.'
    'schematic:Manage infrastructure blueprints: <list|create|edit|import>'
    'splashdown:Emergency shutdown of all active remote capsules.'
    'station:Hardware control: <activate|list|liftoff|delete>'
    'uplink:Inspect local or remote mission telemetry.'
  )
  _describe 'orbit' commands
}
compdef _orbit orbit
${footer}`;
    }

    if (shell === 'fish') {
      return `${header}
alias orbit='${exec} ${quotedShim}'
complete -c orbit -f
complete -c orbit -a 'ci install-shell jettison liftoff mission pulse schematic splashdown station uplink'
${footer}`;
    }

    // bash fallback
    return `${header}
alias orbit='${exec} ${quotedShim}'
_orbit_completions() {
  COMPREPLY=($(compgen -W "${commands}" -- "\${COMP_WORDS[1]}"))
}
complete -F _orbit_completions orbit
${footer}`;
  }
}
