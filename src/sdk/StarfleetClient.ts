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

      const options: http.RequestOptions = {
        method,
        headers: {
          Accept: 'application/json',
        },
      };

      if (data) {
        options.headers!['Content-Type'] = 'application/json';
        options.headers!['Content-Length'] = Buffer.byteLength(data);
      }

      const req = http.request(url, options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => (responseBody += chunk.toString()));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseBody) as T);
            } catch (e) {
              resolve(responseBody as unknown as T);
            }
          } else {
            reject(
              new Error(`Request failed (${res.statusCode}): ${responseBody}`),
            );
          }
        });
      });

      req.on('error', reject);
      if (data) req.write(data);
      req.end();
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

  async launchMission(
    manifest: MissionManifest,
  ): Promise<{ status: string; container: string }> {
    MissionManifestSchema.parse(manifest);
    return this.request('/missions', 'POST', manifest);
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
