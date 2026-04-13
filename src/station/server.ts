/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createDefaultStationDependencies,
  createStationServer,
} from './StationApi.js';

const dependencies = createDefaultStationDependencies();
const { config, debugLog = () => {} } = dependencies;

debugLog(`🚀 Station Supervisor starting on port ${config.port}...`);
debugLog(`🚩 SEMAPHORE: Supervisor Logic Version - v7`);
debugLog(`🚀 Docker Host: ${process.env.DOCKER_HOST || 'default'}`);
debugLog(`🧭 Static Station Config: ${JSON.stringify(config, null, 2)}`);
debugLog(
  `🧱 Static Mount Map: ${JSON.stringify(
    {
      mounts: config.mounts,
      areas: config.areas || {},
    },
    null,
    2,
  )}`,
);

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  debugLog(`💥 Uncaught Exception: ${err.stack || err.message}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
  debugLog(`💥 Unhandled Rejection: ${reason}`);
});

const server = createStationServer(dependencies);

server.listen(config.port, '0.0.0.0', () => {
  // TODO: Implement dynamic port mapping and service discovery for multiple instances
  console.log(
    `🚀 Station Supervisor (Starfleet API) on 0.0.0.0:${config.port}`,
  );
  console.log(
    `🔒 Security Status: ${config.isUnlocked ? 'UNRESTRAINED (Dev Mode)' : 'ENFORCED (Production Mode)'}`,
  );
});
