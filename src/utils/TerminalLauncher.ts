/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import os from 'node:os';

export type TerminalTarget = 'foreground' | 'background' | 'new-window' | 'new-tab';

/**
 * Spawns a new terminal window or tab and executes the given command.
 */
export function spawnTerminal(
  command: string,
  target: 'new-window' | 'new-tab' = 'new-window',
): void {
  const platform = os.platform();

  if (platform === 'darwin') {
    // macOS Terminal / iTerm2 support
    // We use AppleScript to ensure it works across different terminal apps
    const script = target === 'new-window' 
      ? `tell application "Terminal" to do script "${command}"`
      : `tell application "Terminal" to activate
         tell application "System Events" to keystroke "t" using command down
         delay 0.5
         tell application "Terminal" to do script "${command}" in front window`;
    
    // Attempt iTerm2 first if available, fall back to Terminal
    const itermScript = target === 'new-window'
      ? `tell application "iTerm"
           create window with default profile
           tell current session of current window
             write text "${command}"
           end tell
         end tell`
      : `tell application "iTerm"
           tell current window
             create tab with default profile
             tell current session
               write text "${command}"
             end tell
           end tell
         end tell`;

    // Try iTerm2 first
    const iterm = spawn('osascript', ['-e', itermScript]);
    iterm.on('error', () => {
      // Fallback to standard Terminal
      spawn('osascript', ['-e', script]);
    });
  } else if (platform === 'win32') {
    // Windows support (cmd / start)
    // 'start' opens a new window by default
    spawn('cmd', ['/c', 'start', 'cmd', '/k', command], { detached: true, stdio: 'ignore' });
  } else {
    // Linux support (best effort - try common terminals)
    const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
    for (const term of terminals) {
      try {
        if (target === 'new-tab' && term === 'gnome-terminal') {
          spawn(term, ['--tab', '--', 'bash', '-c', `${command}; exec bash`], { detached: true, stdio: 'ignore' });
          break;
        }
        spawn(term, ['-e', `bash -c "${command}; exec bash"`], { detached: true, stdio: 'ignore' });
        break;
      } catch (_e) {
        continue;
      }
    }
  }
}
