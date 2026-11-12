import { io } from '../../client/node_modules/socket.io-client/build/esm/index.js';
import http from 'http';

const SERVER_URL = 'http://localhost:5000';
const CONCURRENT_ROOMS = 4;
const PARTICIPANTS_PER_ROOM = 8; // 32 total concurrent client sockets
const TOTAL_CLIENTS = CONCURRENT_ROOMS * PARTICIPANTS_PER_ROOM;

async function fetchMetrics() {
  return new Promise((resolve) => {
    http.get(`${SERVER_URL}/api/metrics`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({});
        }
      });
    }).on('error', () => resolve({}));
  });
}

function connectClient(roomId, userName, isHost) {
  return new Promise((resolve) => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      forceNew: true
    });

    socket.on('connect', () => {
      socket.emit('join-room', {
        roomId,
        userName,
        isAudioMuted: false,
        isVideoOff: false
      });
    });

    socket.on('room-snapshot', (snapshot) => {
      if (isHost) {
        socket.emit('update-room-settings', {
          settings: { hostAdmission: false, mode: 'conference' }
        });
      }

      // Create WebRTC transport
      socket.emit('createWebRtcTransport', { direction: 'send' }, (tRes) => {
        if (tRes?.id) {
          socket.emit('connectWebRtcTransport', {
            transportId: tRes.id,
            dtlsParameters: {
              role: 'client',
              fingerprints: [{ algorithm: 'sha-256', value: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77' }]
            }
          }, () => {
            if (isHost) {
              socket.emit('produce', {
                transportId: tRes.id,
                kind: 'audio',
                rtpParameters: {
                  mid: '0',
                  codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000, channels: 2 }],
                  encodings: [{ ssrc: 10000000 + Math.floor(Math.random() * 8999999) }]
                },
                appData: { mediaType: 'mic' }
              }, (pRes) => {
                resolve({ socket, transportId: tRes.id, producerId: pRes?.id, isHost: true });
              });
            } else {
              resolve({ socket, transportId: tRes.id, isHost: false });
            }
          });
        } else {
          resolve({ socket, error: tRes?.error });
        }
      });
    });

    socket.on('connect_error', (err) => {
      resolve({ socket, error: err.message });
    });
  });
}

async function runLoadTest() {
  console.log('=============================================================');
  console.log('⚡ VORTEX Distributed Media Fabric Load & Concurrency Benchmark');
  console.log(`   Target: ${TOTAL_CLIENTS} participants across ${CONCURRENT_ROOMS} rooms (${PARTICIPANTS_PER_ROOM}/room)`);
  console.log('=============================================================\n');

  const startCpu = process.cpuUsage();
  const startTime = Date.now();
  const allSockets = [];
  let connectedCount = 0;
  let transportCount = 0;
  let producerCount = 0;

  console.log(`[LoadTest] Initializing ${CONCURRENT_ROOMS} rooms and ramping up ${TOTAL_CLIENTS} participants...`);

  // Ramp up room by room
  for (let r = 0; r < CONCURRENT_ROOMS; r++) {
    const roomId = `bench-room-${r}-${Math.random().toString(36).substr(2, 4)}`;

    // 1. Host joins first and sets conference mode
    const hostResult = await connectClient(roomId, `Host-R${r}`, true);
    if (hostResult.socket) {
      allSockets.push(hostResult.socket);
      connectedCount++;
      if (hostResult.transportId) transportCount++;
      if (hostResult.producerId) producerCount++;
    }

    // 2. Concurrently join remaining (PARTICIPANTS_PER_ROOM - 1) participants
    const guestPromises = [];
    for (let p = 1; p < PARTICIPANTS_PER_ROOM; p++) {
      guestPromises.push(connectClient(roomId, `Guest-R${r}-P${p}`, false));
    }

    const guestResults = await Promise.all(guestPromises);
    guestResults.forEach((res) => {
      if (res.socket) {
        allSockets.push(res.socket);
        connectedCount++;
        if (res.transportId) transportCount++;
      }
    });
  }

  const elapsedSec = (Date.now() - startTime) / 1000;
  const cpuUsage = process.cpuUsage(startCpu);
  const totalCpuMs = (cpuUsage.user + cpuUsage.system) / 1000;
  const memUsage = process.memoryUsage();

  console.log('\n[LoadTest] Gathering server-side telemetry from /api/metrics...');
  const serverMetrics = await fetchMetrics();

  console.log('\n=============================================================');
  console.log('📊 MEASURED BENCHMARK RESULTS');
  console.log('=============================================================');
  console.log(`• Total Concurrent Clients:   ${connectedCount} / ${TOTAL_CLIENTS}`);
  console.log(`• Total Rooms Created:         ${CONCURRENT_ROOMS}`);
  console.log(`• Total WebRtc Transports:     ${transportCount}`);
  console.log(`• Total Producers Active:      ${producerCount}`);
  console.log(`• Ramp-up Elapsed Time:        ${elapsedSec.toFixed(2)} seconds`);
  console.log(`• Client Join Throughput:      ${(connectedCount / elapsedSec).toFixed(1)} joins/second`);
  console.log(`• Client CPU Time Consumed:    ${totalCpuMs.toFixed(1)} ms`);
  console.log(`• Benchmark RSS Memory:        ${Math.round(memUsage.rss / 1024 / 1024)} MB`);
  console.log(`• Benchmark Heap Used:         ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
  
  if (serverMetrics?.fabric) {
    console.log(`\n--- Server Fabric Telemetry ---`);
    console.log(`• Server Active Rooms:         ${serverMetrics.fabric.activeRooms}`);
    console.log(`• Server Total Participants:   ${serverMetrics.fabric.totalParticipants}`);
    console.log(`• Server Active Workers:       ${serverMetrics.fabric.activeWorkers}`);
    console.log(`• Server Heap Memory:          ${serverMetrics.system.processMemoryMB.heapUsed} MB`);
    if (serverMetrics.node?.workers) {
      console.log(`• Worker Router Distribution:  ${serverMetrics.node.workers.map((w) => `[W${w.index} PID ${w.pid}: ${w.activeRouters} routers]`).join(', ')}`);
    }
  }
  console.log('=============================================================\n');

  // Tear down connections
  allSockets.forEach((s) => s.disconnect());
  console.log('✅ Load test harness completed cleanly.');
  process.exit(0);
}

runLoadTest().catch((err) => {
  console.error('❌ Load test failed:', err);
  process.exit(1);
});
