import cluster from 'cluster';
import http from 'http';
import os from 'os';
import { setupMaster } from '@socket.io/sticky';
import { setupPrimary } from '@socket.io/cluster-adapter/primary';

const numCPUs = Math.min(os.cpus().length, 4);

if (cluster.isPrimary) {
  console.log(`=============================================================`);
  console.log(`🌐 VORTEX Sticky Cluster Master started`);
  console.log(`   Host CPU Cores:   ${os.cpus().length}`);
  console.log(`   Spawning Workers: ${numCPUs}`);
  console.log(`   Multi-Core Sync:  @socket.io/cluster-adapter IPC active`);
  console.log(`=============================================================`);

  const httpServer = http.createServer();
  setupMaster(httpServer, {
    loadBalancingMethod: 'least-connection'
  });
  setupPrimary();

  cluster.setupPrimary({
    serialization: 'advanced'
  });

  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`[Cluster] Sticky Master listening on port ${PORT}`);
  });

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Cluster] Worker ${worker.process.pid} exited (${signal || code}). Respawning...`);
    cluster.fork();
  });
} else {
  // Worker process
  import('./index.js');
}
