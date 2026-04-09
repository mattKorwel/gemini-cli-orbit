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
  status: string;
  receipt: StarfleetReceipt;
}

/**
 * StarfleetClient: The thin client that talks to the Station Supervisor API.
 */
export class StarfleetClient {
  constructor(private readonly baseUrl: string = 'http://localhost:8080') {}

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
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
      const res = await this.request<{ status: string }>('/health', 'GET');
      return res.status === 'OK';
    } catch {
      return false;
    }
  }

  async launchMission(manifest: MissionManifest): Promise<LaunchResponse> {
    MissionManifestSchema.parse(manifest);
    return this.request<LaunchResponse>('/missions', 'POST', manifest);
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
}
