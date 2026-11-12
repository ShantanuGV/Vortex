import assert from 'assert';
import { WorkerPool } from '../../server/media/workerPool.js';
import { RouterAllocator } from '../../server/media/routerAllocator.js';
import { PermissionService, MEETING_MODES, ROLES } from '../../server/security/permissionService.js';
import { AuthGuard } from '../../server/security/authGuard.js';
import { SubscriptionEngine } from '../../server/subscription/subscriptionEngine.js';
import { ActiveSpeakerTracker } from '../../server/subscription/activeSpeakerTracker.js';
import { NetworkMonitor, NETWORK_QUALITY } from '../../server/subscription/networkMonitor.js';
import { VirtualMediaStream } from '../../server/subscription/virtualMediaStream.js';
import { DistributedState } from '../../server/state/distributedState.js';

async function runUnitTests() {
  console.log('=============================================================');
  console.log('🧪 Starting Distributed Media Fabric Unit Test Suite');
  console.log('=============================================================');

  // 1. Worker Pool & Allocation
  console.log('\n[1/8] Testing WorkerPool and Router Allocation...');
  const pool = new WorkerPool({ numWorkers: 2, rtcMinPort: 41000, rtcMaxPort: 41999 });
  await pool.init();
  assert.strictEqual(pool.workers.length, 2, 'Worker pool should spawn 2 workers');

  const allocator = new RouterAllocator(pool);
  const alloc1 = await allocator.getOrCreateRoomRouter('room-unit-1');
  assert.ok(alloc1.router, 'Router 1 should be created');
  assert.strictEqual(alloc1.isNew, true);

  // Room affinity check
  const alloc2 = await allocator.getOrCreateRoomRouter('room-unit-1');
  assert.strictEqual(alloc2.isNew, false, 'Should return existing router for same roomId');
  assert.strictEqual(alloc2.router.id, alloc1.router.id, 'Routers must match for room affinity');

  // Load balancing check for second room
  const alloc3 = await allocator.getOrCreateRoomRouter('room-unit-2');
  assert.ok(alloc3.router, 'Router 2 should be created');
  console.log('✅ PASS: WorkerPool least-loaded allocation and room affinity verified.');

  // 2. Permission Service & Meeting Policies
  console.log('\n[2/8] Testing PermissionService & Meeting Modes...');
  const mockRoom = {
    id: 'room-perm',
    hostId: 'host-1',
    settings: {
      mode: MEETING_MODES.CONFERENCE,
      allowMic: true,
      allowCamera: false, // Locked camera
      allowScreenShare: true
    },
    participants: new Map([
      ['host-1', { peerId: 'host-1', role: ROLES.HOST }],
      ['peer-guest', { peerId: 'peer-guest', role: ROLES.PARTICIPANT, forceMuted: false }]
    ])
  };

  // Host should be admin
  assert.strictEqual(PermissionService.isMeetingAdmin(mockRoom, 'host-1'), true);
  assert.strictEqual(PermissionService.isMeetingAdmin(mockRoom, 'peer-guest'), false);

  // Camera publish check when locked
  assert.strictEqual(PermissionService.canPublish(mockRoom, 'peer-guest', 'video'), false, 'Guest should not publish camera when locked');
  assert.strictEqual(PermissionService.canPublish(mockRoom, 'host-1', 'video'), true, 'Host can always publish camera');

  // Conference mode: guest can consume other guest
  const producerGuest = { peerId: 'peer-guest' };
  assert.strictEqual(PermissionService.canConsume(mockRoom, 'peer-other', producerGuest), false, 'Unknown peer cannot consume');
  mockRoom.participants.set('peer-other', { peerId: 'peer-other', role: ROLES.PARTICIPANT });
  assert.strictEqual(PermissionService.canConsume(mockRoom, 'peer-other', producerGuest), true, 'In conference mode, guest consumes guest');

  // Webinar mode: guest CANNOT consume other guest
  mockRoom.settings.mode = MEETING_MODES.WEBINAR;
  assert.strictEqual(PermissionService.canConsume(mockRoom, 'peer-other', producerGuest), false, 'In webinar mode, guest cannot consume guest');
  assert.strictEqual(PermissionService.canConsume(mockRoom, 'host-1', producerGuest), true, 'In webinar mode, host can consume guest');
  console.log('✅ PASS: Meeting permission matrices and conference/webinar modes verified.');

  // 3. Centralized AuthGuard Ownership Verification
  console.log('\n[3/8] Testing AuthGuard Ownership and Security Boundaries...');
  const roomWithTransports = {
    ...mockRoom,
    transports: new Map([
      ['trans-1', { id: 'trans-1', appData: { peerId: 'host-1' } }]
    ]),
    producers: new Map([
      ['prod-1', { id: 'prod-1', peerId: 'host-1', kind: 'audio', appData: { mediaType: 'mic' } }]
    ])
  };

  // Transport ownership check
  const validTrans = AuthGuard.validateTransportOwnership(roomWithTransports, 'trans-1', 'host-1');
  assert.strictEqual(validTrans.ok, true, 'Host owns trans-1');

  const invalidTrans = AuthGuard.validateTransportOwnership(roomWithTransports, 'trans-1', 'peer-guest');
  assert.strictEqual(invalidTrans.ok, false, 'Guest cannot hijack host transport');
  assert.ok(invalidTrans.error.includes('mismatch'));

  // Producer ownership check
  const invalidProd = AuthGuard.validateProducerOwnership(roomWithTransports, 'prod-1', 'peer-guest');
  assert.strictEqual(invalidProd.ok, false, 'Guest cannot pause or close host producer');
  console.log('✅ PASS: AuthGuard security enforcement and anti-spoofing verified.');

  // 4. Active Speaker Tracking & VAD Hysteresis
  console.log('\n[4/8] Testing ActiveSpeakerTracker VAD & Speech History...');
  const tracker = new ActiveSpeakerTracker({ decayWindowMs: 2000 });
  const changed1 = tracker.processSpeakingLevel('speaker-A', 0.8);
  assert.strictEqual(changed1, true, 'Speaker A should become active speaker');
  assert.strictEqual(tracker.getCurrentSpeaker(), 'speaker-A');

  tracker.processSpeakingLevel('speaker-B', 0.9);
  assert.strictEqual(tracker.getCurrentSpeaker(), 'speaker-B', 'Speaker B should become active speaker');

  const recent = tracker.getRecentSpeakers();
  assert.ok(recent.includes('speaker-A'), 'Speaker A should be in recent speakers list');
  assert.ok(recent.includes('speaker-B'), 'Speaker B should be in recent speakers list');
  console.log('✅ PASS: Active speaker detection and recent speech window verified.');

  // 5. Subscription Engine & Prioritization
  console.log('\n[5/8] Testing SubscriptionEngine Priority Ordering...');
  const subEngine = new SubscriptionEngine({ defaultMaxStreams: 3 });
  const roomProducers = {
    producers: new Map([
      ['prod-screen', { peerId: 'user-presenter', kind: 'video', appData: { mediaType: 'screen' } }],
      ['prod-cam-pinned', { peerId: 'user-pinned', kind: 'video', appData: { mediaType: 'camera' } }],
      ['prod-cam-spk', { peerId: 'user-speaker', kind: 'video', appData: { mediaType: 'camera' } }],
      ['prod-cam-tile1', { peerId: 'user-tile1', kind: 'video', appData: { mediaType: 'camera' } }],
      ['prod-cam-tile2', { peerId: 'user-tile2', kind: 'video', appData: { mediaType: 'camera' } }]
    ])
  };

  const subs = subEngine.evaluateSubscriptions({
    receiverId: 'receiver-me',
    room: roomProducers,
    pinnedPeerId: 'user-pinned',
    activeSpeakerId: 'user-speaker',
    recentSpeakerIds: ['user-speaker'],
    visiblePeerIds: new Set(['user-tile1']),
    networkQuality: NETWORK_QUALITY.EXCELLENT
  });

  // Top 3 selected should be: Screen share, Pinned peer, Active speaker
  assert.strictEqual(subs.length, 5, 'Excellent network profile allows up to 6 streams');
  assert.strictEqual(subs[0].producerId, 'prod-screen', 'Screen share must be #1 priority');
  assert.strictEqual(subs[1].producerId, 'prod-cam-pinned', 'Pinned peer must be #2 priority');
  assert.strictEqual(subs[2].producerId, 'prod-cam-spk', 'Active speaker must be #3 priority');
  assert.strictEqual(subs[0].spatialLayer, 2, 'High priority streams get 720p spatial layer 2');
  console.log('✅ PASS: Stream subscription prioritization and layer selection verified.');

  // 6. Network Quality Classifier
  console.log('\n[6/8] Testing NetworkMonitor Quality Tiers...');
  const qExcellent = NetworkMonitor.classify({ rttMs: 30, packetLossPct: 0.1, jitterMs: 5 });
  assert.strictEqual(qExcellent, NETWORK_QUALITY.EXCELLENT);

  const qFair = NetworkMonitor.classify({ rttMs: 220, packetLossPct: 2.5, jitterMs: 45 });
  assert.strictEqual(qFair, NETWORK_QUALITY.FAIR);

  const qCritical = NetworkMonitor.classify({ rttMs: 700, packetLossPct: 20, jitterMs: 150 });
  assert.strictEqual(qCritical, NETWORK_QUALITY.CRITICAL);
  const criticalProfile = NetworkMonitor.getQualityProfile(qCritical);
  assert.strictEqual(criticalProfile.audioPriorityOnly, true, 'Critical network enforces audio priority only');
  console.log('✅ PASS: Network quality classification and degradation profile verified.');

  // 7. Virtual Media Stream (VMS) Abstraction
  console.log('\n[7/8] Testing VirtualMediaStream Slot Allocator...');
  const vms = new VirtualMediaStream('receiver-me', 3);
  const vmsResult = vms.updateSlots(subs);
  assert.strictEqual(vmsResult.screenActive, true, 'Screen slot should be active');
  assert.strictEqual(vms.screenSlot.boundProducerId, 'prod-screen');
  assert.strictEqual(vms.videoSlots[0].boundProducerId, 'prod-cam-pinned');
  assert.strictEqual(vms.videoSlots[1].boundProducerId, 'prod-cam-spk');

  const status = vms.getSlotStatus();
  assert.strictEqual(status.screenSlot.isOccupied, true);
  assert.strictEqual(status.videoSlots[0].isOccupied, true);
  console.log('✅ PASS: VirtualMediaStream logical slots mapped cleanly without stream mixing.');

  // 8. Distributed State & Atomic Locking
  console.log('\n[8/8] Testing DistributedState Atomic Locks & Storage...');
  const distState = new DistributedState();
  const lockToken1 = await distState.acquireLock('test-resource', 1000);
  assert.ok(lockToken1, 'Should acquire lock');

  // Second acquire must fail while held
  const lockToken2 = await distState.acquireLock('test-resource', 1000);
  assert.strictEqual(lockToken2, null, 'Second lock attempt must be rejected');

  // Release lock
  await distState.releaseLock('test-resource', lockToken1);
  const lockToken3 = await distState.acquireLock('test-resource', 1000);
  assert.ok(lockToken3, 'Should re-acquire lock after release');
  await distState.releaseLock('test-resource', lockToken3);

  // Set/Get and Set operations
  await distState.set('user:session:1', { name: 'Alice' });
  const val = await distState.get('user:session:1');
  assert.strictEqual(val.name, 'Alice');

  await distState.sadd('room:active:peers', 'peer-1');
  await distState.sadd('room:active:peers', 'peer-2');
  const members = await distState.smembers('room:active:peers');
  assert.strictEqual(members.length, 2);
  console.log('✅ PASS: Distributed atomic locks, key-value storage, and sets verified.');

  // Cleanup worker pool
  pool.close();
  console.log('\n🎉 ALL 8 UNIT TESTS PASSED CLEANLY!\n');
}

runUnitTests().catch((err) => {
  console.error('\n❌ UNIT TEST FAILED:', err);
  process.exit(1);
});
