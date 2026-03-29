/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages unique session identifiers for Gemini Orbit missions.
 */
export class SessionManager {
  /**
   * Generates a new session ID based on PR number and action.
   * Format: orbit-<pr>-<action>-<timestamp>
   */
  static generateSessionId(pr: string, action: string): string {
    const timestamp = Date.now();
    const cleanPr = pr.replace(/[^a-zA-Z0-9]/g, '');
    const cleanAction = action.replace(/[^a-zA-Z0-9]/g, '');
    return `orbit-${cleanPr}-${cleanAction}-${timestamp}`;
  }

  /**
   * Retrieves the current session ID from environment variables.
   */
  static getSessionIdFromEnv(): string | undefined {
    return process.env.GCLI_SESSION_ID || process.env.GEMINI_SESSION_ID;
  }
}
