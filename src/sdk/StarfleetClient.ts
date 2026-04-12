/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import { type MissionManifest, MissionManifestSchema } from '../core/types.js';
import { type Command } from '../core/executors/types.js';

export interface ExecResponse {
  status: number;
  stdout: string;
  stderr: string;
}

export interface StarfleetReceipt {
  missionId: string;
  containerName: string;
  workspacePath: string;
  ignitedAt: string;
}

export interface LaunchResponse {
  status: 'READY';
  receipt: StarfleetReceipt;
}

export interface GeminiSettingsHashResponse {
  hash: string | null;
}

export interface GeminiSettingsSyncResponse {
  status: 'UPDATED' | 'UNCHANGED';
  hash: string;
}

/**
 * StarfleetClient: The thin client that talks to the Station Supervisor API.
 */
export class StarfleetClient {
  constructor(private baseUrl: string = 'http://localhost:8080') {}

  /**
   * Updates the base URL (useful for dynamic port mapping).
   */
  public setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: any,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${path}`;
      const data = body ? JSON.stringify(body) : undefined;

      const headers: Record<string, string | number> = {
        Accept: 'application/json',
      };
      if (data) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(data);
      }

      const options: http.RequestOptions = {
        method,
        headers,
      };

      const req = http.request(url, options, (res) => {
        let responseBody = '';
        console.log(
          `[DEBUG] StarfleetClient.request response received: status=${res.statusCode}`,
        );
        res.on('data', (chunk) => (responseBody += chunk.toString()));
        res.on('end', () => {
          console.log(
            `[DEBUG] StarfleetClient.request response body: ${responseBody}`,
          );
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseBody) as T);
            } catch (_e) {
              resolve(responseBody as unknown as T);
            }
          } else {
            const errorMsg = `Request failed (${res.statusCode}): ${responseBody}`;
            console.error(`[DEBUG] StarfleetClient.request Error: ${errorMsg}`);
            reject(new Error(errorMsg));
          }
        });
      });

      req.on('error', (err) => {
        console.error(
          `[DEBUG] StarfleetClient.request Error Event: ${err.message}`,
        );
        reject(err);
      });
      if (data) req.write(data);
      req.end();
      console.log(`[DEBUG] StarfleetClient.request sent: ${method} ${url}`);
    });
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.request<{ status: string; semaphore?: string }>(
        '/health',
        'GET',
      );
      if (res.semaphore) {
        console.log(`[CLIENT] 🚩 Semaphore: ${res.semaphore}`);
      }
      return res.status === 'OK';
    } catch (_e) {
      return false;
    }
  }

  async launchMission(manifest: MissionManifest): Promise<LaunchResponse> {
    MissionManifestSchema.parse(manifest);
    return this.request<LaunchResponse>('/missions', 'POST', manifest);
  }

  async getGeminiSettingsHash(): Promise<string | null> {
    const res = await this.request<GeminiSettingsHashResponse>(
      '/settings/gemini/hash',
      'GET',
    );
    return res.hash;
  }

  async syncGeminiSettings(payload: {
    hash: string;
    content: string;
  }): Promise<GeminiSettingsSyncResponse> {
    return this.request<GeminiSettingsSyncResponse>(
      '/settings/gemini',
      'PUT',
      payload,
    );
  }

  async exec(command: string | Command, options?: any): Promise<ExecResponse> {
    return this.request('/exec', 'POST', { command, options });
  }

  async capturePane(capsuleName: string): Promise<string> {
    const res = await this.request<{ logs: string }>(
      `/missions/${capsuleName}/logs`,
      'GET',
    );
    return res.logs;
  }

  async listCapsules(): Promise<string[]> {
    const res = await this.request<{ capsules: string[] }>('/missions', 'GET');
    return res.capsules;
  }

  async jettisonMission(identifier: string, action?: string): Promise<number> {
    const query = action ? `?action=${action}` : '';
    await this.request(`/missions/${identifier}${query}`, 'DELETE');
    return 0;
  }
}
