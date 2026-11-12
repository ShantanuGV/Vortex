import assert from 'assert';
import { WorkerPool } from '../../server/media/workerPool.js';
import { RouterAllocator } from '../../server/media/routerAllocator.js';
import { RoomManager } from '../../server/state/roomManager.js';
import { DistributedState } from '../../server/state/distributedState.js';
import { SessionManager } from '../../server/state/sessionManager.js';
import { MetricsCollector } from '../../server/monitoring/metrics.js';
import { Supervisor } from '../../server/monitoring/supervisor.js';

async function runFailureInjectionTests() {
  console.log(`\n=============================================================`);
  console.log(`💥 Starting Failure-Injection & Self-Healing Reliability Tests`);
  console.log(`=============================================================\n`);

  // 1. Worker Failure & Automated Router Recovery
  console.log('[1/3] Testing C++ Mediasoup Worker Death & Automated Failover...');
  const pool = new WorkerPool({ numWorkers: 2, rtcMinPort: 43000, rtcMaxPort: 43999 });
  await pool.init();

  const allocator = new RouterAllocator(pool);
  const state = new DistributedState();
  const roomManager = new RoomManager(state, allocator);
  const metrics = new MetricsCollector();

  let reconnectBroadcastReceived = false;
  const mockIo = {
    to: (roomId) => ({
      emit: (event, payload) => {
        if (event === 'sfu-reconnect-needed') {
          reconnectBroadcastReceived = true;
          console.log(`✅ [Simulated Client Broadcast] Received ${event} for room "${roomId}": ${payload.reason}`);
        }
      }
    })
  };

  const supervisor = new Supervisor({ workerPool: pool, roomManager, metrics, io: mockIo });

  // Create room on worker 0
  const room = await roomManager.getOrCreateRoom('room-failover-1');
  const initialWorkerPid = room.workerPid;
  const initialRouterId = room.router.id;
  console.log(`Room allocated on Worker (PID: ${initialWorkerPid}, Router: ${initialRouterId})`);

  // Inject worker failure: terminate worker process
  console.log(`... Injecting failure: Terminating worker process PID ${initialWorkerPid} ...`);
  const workerEntry = pool.workers.find((w) => w.pid === initialWorkerPid);
  assert.ok(workerEntry, 'Worker entry must exist');

  // Trigger worker died handler directly
  await pool.handleWorkerDeath(workerEntry);

  // Verify supervisor recovered room
  const recoveredRoom = roomManager.getRoom('room-failover-1');
  assert.ok(recoveredRoom.router, 'Recovered room must have active router');
  assert.notStrictEqual(recoveredRoom.router.id, initialRouterId, 'Recovered router must have new ID');
  assert.strictEqual(reconnectBroadcastReceived, true, 'Supervisor must broadcast sfu-reconnect-needed to clients');
  assert.strictEqual(metrics.counters.workerFailuresTotal, 1, 'Metrics must record 1 worker failure');
  console.log('✅ Automated worker death recovery and router re-binding verified.');

  // 2. Participant Session Grace Period Reconnection
  console.log('\n[2/3] Testing Participant Unexpected Disconnect & Grace Period Recovery...');
  const sessionManager = new SessionManager(state, { gracePeriodMs: 500 }); // Fast 500ms grace window for test

  const session = await sessionManager.createSession({
    peerId: 'peer-drop-1',
    roomId: 'room-grace-1',
    userName: 'David',
    role: 'speaker',
    isHost: false,
    signalingNodeId: process.pid
  });

  const reconnectToken = session.reconnectToken;
  assert.ok(reconnectToken, 'Session must generate reconnectToken');
  console.log(`✅ Participant joined with reconnectToken: ${reconnectToken.slice(0, 8)}...`);

  // Simulate unexpected socket disconnect
  let graceExpiredCalled = false;
  await sessionManager.handleDisconnect('peer-drop-1', () => {
    graceExpiredCalled = true;
  });

  // Reconnect within grace period with new socket id
  const restoredSession = await sessionManager.restoreSession(reconnectToken, 'peer-drop-1-reconnected');
  assert.ok(restoredSession, 'Session must be restored');
  assert.strictEqual(restoredSession.peerId, 'peer-drop-1-reconnected');
  assert.strictEqual(restoredSession.userName, 'David');
  assert.strictEqual(restoredSession.connectionState, 'connected');
  console.log(`✅ Participant session successfully restored without demotion or data loss.`);

  // Verify grace timer was cancelled and did not expire
  await new Promise((r) => setTimeout(r, 600));
  assert.strictEqual(graceExpiredCalled, false, 'Grace timer should have been cancelled by reconnection');

  // 3. Redis Disconnect Fallback
  console.log('\n[3/3] Testing State Coordinator Resilience (Fallback to Memory)...');
  const resilientState = new DistributedState({
    redisClient: {
      set: () => Promise.reject(new Error('ECONNREFUSED')),
      get: () => Promise.reject(new Error('ECONNREFUSED'))
    }
  });

  // Lock acquisition must fallback to memory gracefully without throwing
  const lock = await resilientState.acquireLock('fallback-key', 1000);
  assert.ok(lock, 'Lock should be acquired in memory fallback');
  await resilientState.releaseLock('fallback-key', lock);
  console.log('✅ Resilient fallback to memory coordinator on Redis connection failure verified.');

  // Cleanup
  pool.close();
  console.log('\n🎉 ALL FAILURE-INJECTION & SELF-HEALING TESTS PASSED!\n');
  process.exit(0);
}

runFailureInjectionTests().catch((err) => {
  console.error('\n❌ FAILURE INJECTION TEST FAILED:', err);
  process.exit(1);
});
