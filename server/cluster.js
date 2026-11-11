import cluster from 'cluster';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Number of CPU cores to utilize (capped at 8 or available cores)
const numCPUs = Math.min(os.cpus().length, 8);

if (cluster.isPrimary) {
  console.log(`=============================================================`);
  console.log(`🌐 Google Meet Primary Cluster Manager started`);
  console.log(`   Host CPU Cores:   ${os.cpus().length}`);
  console.log(`   Spawning Workers: ${numCPUs}`);
  console.log(`   Capacity:         10+ concurrent rooms × 500+ users`);
  console.log(`=============================================================`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Cluster] Worker ${worker.process.pid} exited (signal: ${signal || code}). Respawning...`);
    cluster.fork();
  });
} else {
  // Worker process runs the server
  import('./index.js');
}

