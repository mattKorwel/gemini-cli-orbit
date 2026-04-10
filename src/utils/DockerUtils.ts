/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import net from 'node:net';

/**
 * findDockerSocket: Returns the standard Docker socket path.
 * In DooD (Docker-outside-of-Docker) scenarios, this is always /var/run/docker.sock
 * regardless of host OS, as Docker Desktop/WSL2 abstracts the daemon.
 */
export function findDockerSocket(): string {
  return '/var/run/docker.sock';
}

/**
 * findAvailablePort: Finds an open TCP port starting from the given port.
 */
export async function findAvailablePort(startPort: number): Promise<number> {
  const isAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '0.0.0.0');
    });
  };

  let port = startPort;
  while (!(await isAvailable(port))) {
    port++;
    if (port > startPort + 100) {
      throw new Error(`Could not find an available port near ${startPort}`);
    }
  }
  return port;
}
