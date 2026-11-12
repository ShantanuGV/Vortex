# VORTEX — Architecture Improvement Advisory
**Role:** Senior WebRTC Infrastructure Engineer  
**Date:** 2026-11-12  
**Current State:** Mediasoup SFU (single-node), Socket.IO cluster adapter, in-memory state

---

## Executive Summary

The core SFU pipeline is architecturally sound and production-ready for **single-node, single-process deployments**. The critical architectural problems are: (1) the cluster mode is functionally broken — it doesn't actually distribute rooms across workers, (2) the failover path exists server-side but has zero client-side handler, and (3) the subscription/simulcast engine is a complete dead code path that the client never triggers. Each of these is fixable without a full rewrite.

---

## CRITICAL ARCHITECTURAL ISSUES

---

### ARCH-001 · Cluster Mode Architecture is Broken by Design

**Impact:** 🔴 CRITICAL — Cluster mode (`npm run start:cluster`) cannot serve a real production deployment  
**Affects:** [`server/cluster.js`](file:///D:/Projects/REA Lab/G Meet/server/cluster.js), [`server/state/roomManager.js`](file:///D:/Projects/REA Lab/G Meet/server/state/roomManager.js)

**Current Architecture (Broken):**
```
                       ┌─── Node.js Worker Process 1 ───┐
Client A ──────────────►  RoomManager.localRooms (Map)  │
                       │  Mediasoup Workers 0,1          │
                       └────────────────────────────────┘
                       ┌─── Node.js Worker Process 2 ───┐
Client B ──────────────►  RoomManager.localRooms (Map)  │  ← Different Map!
                       │  Mediasoup Workers 0,1          │  ← Different Workers!
                       └────────────────────────────────┘
  Socket.IO cluster-adapter relays events between processes,
  but Mediasoup objects cannot cross process boundaries.
  Client A and B are in ISOLATED invisible rooms.
```

**Why it fails:**
- `RoomManager.localRooms` is a process-local `Map`
- `Router`, `Transport`, `Producer`, `Consumer` are native C++ Mediasoup objects → not serializable → cannot be sent over IPC
- Socket.IO cluster adapter only relays Socket.IO *events*, not Mediasoup state
- When Client B joins the same `roomId` on Worker Process 2, `roomManager.getRoom(roomId)` returns `null` → new room is created → isolated from Client A's room

**Advisory — Two valid approaches:**

**Option A (Recommended for current scale): Disable cluster mode, use PM2 single-process**  
Run one Node.js process with 4 Mediasoup C++ workers. Use PM2 for process restart on crash. Each room stays on one process. Simpler, works correctly now.

**Option B (For true horizontal scale): Redis + mediasoup-broadcaster pattern**  
Each signaling node has its own Mediasoup workers. Rooms are "pinned" to a node via Redis hash (`room:${roomId}:node → nodeId`). When a client connects to a different node, they are redirected (HTTP 302 or Socket.IO redirection) to the correct node. This is the standard multi-node Mediasoup pattern used by mediasoup-demo.

---

### ARCH-002 · Worker Failover Chain is Broken End-to-End

**Impact:** 🔴 CRITICAL — Server-side failover is wired, client-side handler is missing  
**Affects:** [`server/monitoring/supervisor.js:61`](file:///D:/Projects/REA Lab/G Meet/server/monitoring/supervisor.js#L61) → [`client/src/hooks/useWebRTC.js`](file:///D:/Projects/REA Lab/G Meet/client/src/hooks/useWebRTC.js)

**Current failover chain:**

```
Mediasoup Worker dies
      ↓
WorkerPool.handleWorkerDeath() fires
      ↓
Supervisor.handleWorkerCrash() runs
      ↓
✅ Clears room transports/producers/consumers (server-side)
✅ Allocates new router on surviving worker
✅ Emits 'sfu-reconnect-needed' to room participants
      ↓
❌ Client receives 'sfu-reconnect-needed' → NO HANDLER → event ignored
❌ Client retains stale transport objects pointing to dead worker
❌ Media permanently frozen — no recovery without page reload
```

**Advisory:**  
Add a client-side handler in `useWebRTC.js`:
```javascript
socket.on('sfu-reconnect-needed', async ({ roomId, reason }) => {
  addToast('Media connection lost — reconnecting...', 'warning');
  // 1. Close existing transports (they're invalid)
  sendTransportRef.current?.close();
  recvTransportRef.current?.close();
  sendTransportRef.current = null;
  recvTransportRef.current = null;
  // 2. Close all consumers (they're invalid)
  consumersRef.current.forEach(({ consumer }) => { try { consumer.close(); } catch {} });
  consumersRef.current.clear();
  peerMediaStreamsRef.current.clear();
  setRemoteStreams({});
  // 3. Re-initialize SFU session
  await initMediasoupSession(socketRef.current, localStreamRef.current, isAudioMuted, isVideoOff);
  // 4. Re-request existing producers from server
  socket.emit('get-existing-producers', {}, (producers) => {
    producers.forEach(item => consumeProducer(item));
  });
});
```
This requires also adding a `get-existing-producers` server endpoint that returns `existingProducers` for the socket's room.

---

### ARCH-003 · Subscription Engine & Simulcast Layer Management are Dead Code

**Impact:** 🟠 HIGH — All participants receive full HD (highest simulcast layer) regardless of network quality  
**Affects:** [`server/subscription/subscriptionEngine.js`](file:///D:/Projects/REA Lab/G Meet/server/subscription/subscriptionEngine.js), [`server/media/simulcastManager.js`](file:///D:/Projects/REA Lab/G Meet/server/media/simulcastManager.js), [`client/src/hooks/useWebRTC.js:1212-1230`](file:///D:/Projects/REA Lab/G Meet/client/src/hooks/useWebRTC.js#L1212)

**Current state:** The client computes `visiblePeerIds` correctly but never sends it to the server. The `update-subscription-preferences` event handler on the server is fully implemented but never receives any client calls.

**Advisory:**  
Add this to `useWebRTC.js` after `visiblePeerIds` changes:
```javascript
useEffect(() => {
  if (!socketRef.current || !isConnected) return;
  socketRef.current.emit('update-subscription-preferences', {
    pinnedPeerId,
    visiblePeerIds: Array.from(visiblePeerIds),
    networkQuality: networkStats.quality
  });
}, [visiblePeerIds, pinnedPeerId, networkStats.quality, isConnected]);
```

This one `useEffect` activates the entire subscription engine + simulcast optimization path.

---

## HIGH PRIORITY ADVISORIES

---

### ARCH-004 · React Re-Render Storm on Remote Stream Updates

**Impact:** 🟠 HIGH — At 20+ participants, every speaking event causes full grid re-render  
**Affects:** [`client/src/hooks/useWebRTC.js:293`](file:///D:/Projects/REA Lab/G Meet/client/src/hooks/useWebRTC.js#L293), [`VideoGrid.jsx`](file:///D:/Projects/REA Lab/G Meet/client/src/components/VideoGrid.jsx), [`VideoTile.jsx`](file:///D:/Projects/REA Lab/G Meet/client/src/components/VideoTile.jsx)

**Problem chain:**
1. `speaking-level` → server processes → emits `room-deltas` with `active-speaker-change`
2. Client receives delta → `setRoster()` → React state update → full `VideoGrid` re-render
3. All `VideoTile` components re-render → their `useEffect([stream, isLocal])` fires → `.play()` called on all audio elements → brief audio glitches

**Current mitigation:** `peerMediaStreamsRef` stores streams outside React state (good). But `setRemoteStreams` still creates new object refs on every consumer event.

**Advisory:**
- Memoize `VideoTile` with `React.memo` and careful prop comparison to prevent unnecessary re-renders
- Separate `activeSpeakerId` state from `roster` state to avoid roster re-renders on speaker changes
- Use `useRef` for the active speaker ring highlight instead of CSS class applied via state
- Consider React 18's `useDeferredValue` for roster updates during active speech

---

### ARCH-005 · No TURN Server Configuration — Restrictive Networks Will Fail

**Impact:** 🟠 HIGH — Corporate firewalls, symmetric NAT, and mobile 4G/5G on some carriers block UDP  
**Affects:** [`server/signaling/socketHandlers.js:393-408`](file:///D:/Projects/REA Lab/G Meet/server/signaling/socketHandlers.js#L393)

**Current state:** The `createWebRtcTransport` handler only uses `listenIps` with no TURN server configuration. ICE will fail for participants behind symmetric NAT or enterprise firewalls.

**Advisory:**
1. Configure Mediasoup `iceServers` in the transport creation response:
```javascript
// Return iceServers to client for transport creation
callback({
  id: transport.id,
  iceParameters: transport.iceParameters,
  iceCandidates: transport.iceCandidates,
  dtlsParameters: transport.dtlsParameters,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: process.env.TURN_URL, username: process.env.TURN_USER, credential: process.env.TURN_PASS }
  ]
});
```
2. Add TURN configuration to `.env.example`
3. Use Coturn (self-hosted) or Metered.ca/Twilio TURN for production

---

### ARCH-006 · `VideoGrid` Pagination and `useWebRTC` Subscription Out of Sync

**Impact:** 🟠 HIGH — Structural fragility; will break if either PAGE_SIZE constant changes  
**Affects:** [`VideoGrid.jsx:37`](file:///D:/Projects/REA Lab/G Meet/client/src/components/VideoGrid.jsx#L37), [`useWebRTC.js:11`](file:///D:/Projects/REA Lab/G Meet/client/src/hooks/useWebRTC.js#L11)

Both `VideoGrid.PAGE_SIZE = 6` (hardcoded) and `useWebRTC.DEFAULT_PAGE_SIZE = 6` exist independently with no link between them.

**Advisory:** Remove `VideoGrid.PAGE_SIZE` and pass `pageSize` as a prop from `MeetingRoom.jsx` (which already receives it from `useWebRTC`). This creates a single source of truth.

---

### ARCH-007 · No Server-Side Mediasoup AudioLevelObserver

**Impact:** 🟠 HIGH — Client-side VAD is inaccurate when tab is backgrounded or throttled  
**Affects:** [`client/src/hooks/useWebRTC.js:188-224`](file:///D:/Projects/REA Lab/G Meet/client/src/hooks/useWebRTC.js#L188)

**Current state:** VAD runs on the client using Web Audio API analysis every 100ms. When the browser tab is backgrounded, timer interval throttling (1-second minimum in Chrome) causes VAD to stop working. CPU-intensive tabs also cause VAD to lag.

**Advisory:**  
Mediasoup provides `router.createAudioLevelObserver()` which runs in the C++ worker and fires `volumes` events at configurable intervals (default 1 second). This is reliable, independent of client tab state, and far more accurate:

```javascript
// In roomManager or socketHandlers, after router creation:
const audioLevelObserver = await room.router.createAudioLevelObserver({
  maxEntries: 1,
  threshold: -80, // dB
  interval: 800   // ms
});

audioLevelObserver.on('volumes', (volumes) => {
  const { producer, volume } = volumes[0];
  const producerEntry = room.producers.get(producer.id);
  if (producerEntry) {
    // Directly emit active speaker change to room
    io.to(room.id).emit('room-deltas', [{
      type: 'active-speaker-change',
      peerId: producerEntry.peerId,
      isSpeaking: true,
      level: volume
    }]);
  }
});

audioLevelObserver.on('silence', () => {
  io.to(room.id).emit('room-deltas', [{
    type: 'active-speaker-change',
    peerId: null,
    isSpeaking: false
  }]);
});
```

This eliminates BUG-007 (AudioContext resume) and BUG-006 (VAD flooding rate limit).

---

## MEDIUM PRIORITY ADVISORIES

---

### ARCH-008 · `DistributedState` In-Memory Lock — No Eviction of Expired Entries

**Impact:** 🟡 MEDIUM — Memory leak in long-running process  
**Affects:** `server/state/distributedState.js`

Lock map entries for `room-init:${roomId}` are never proactively cleaned up after expiry. In a 24/7 deployment with thousands of room IDs created over time, the lock map grows unboundedly.

**Advisory:** Add a `setInterval` that sweeps the lock map every 5 minutes and deletes entries where `Date.now() > expiresAt`.

---

### ARCH-009 · `RoomManager.destroyRoom()` Is Async But Many Callers Don't Await

**Impact:** 🟡 MEDIUM — Potential orphaned Mediasoup routers on rapid room creation/destroy  
**Affects:** [`server/signaling/socketHandlers.js:353`](file:///D:/Projects/REA Lab/G Meet/server/signaling/socketHandlers.js#L353), [`server/signaling/socketHandlers.js:863`](file:///D:/Projects/REA Lab/G Meet/server/signaling/socketHandlers.js#L863)

`destroyRoom()` is `async` (it calls `routerAllocator.releaseRoomRouter(roomId)` and distributed state `del` operations). Several callers invoke it without `await`. The router may not be released before the room ID could be reused.

**Advisory:** Ensure all `destroyRoom` calls are `await`-ed.

---

### ARCH-010 · `sessionManager.graceTimers` — Memory Leak on Repeated Reconnect

**Impact:** 🟡 MEDIUM — `graceTimers` Map grows if `createSession` is called without prior disconnect  
**Affects:** [`server/state/sessionManager.js:40-43`](file:///D:/Projects/REA Lab/G Meet/server/state/sessionManager.js#L40)

If a peer reconnects via `reconnectToken` path (`restoreSession`), `createSession` is NOT called (the session is updated in-place). The `graceTimers` map entry for the old `peerId` is cleared in `restoreSession` ✅. But if `createSession` is called for a fresh join of the same `peerId` (same socket ID, reconnected without token), `createSession` checks for existing grace timer and clears it ✅. This is actually handled correctly.

**However:** If `handleDisconnect` is called multiple times for the same peer (possible if Socket.IO emits disconnect twice, e.g., due to transport fallback), two grace timers could be set for the same `peerId`. The second call overwrites `graceTimers.set(peerId, timer)` without clearing the first → timer 1 fires and calls `destroySession` while timer 2 is still pending → `destroySession` runs twice.

**Advisory:** Guard `handleDisconnect` against duplicate calls for same peerId:
```javascript
if (this.graceTimers.has(peerId)) {
  clearTimeout(this.graceTimers.get(peerId));
  this.graceTimers.delete(peerId);
}
```
(This guard already exists at line 40 in `createSession` but not at the START of `handleDisconnect`.)

---

### ARCH-011 · `getStats()` RTT Polling Every 2500ms — Scale Issue

**Impact:** 🟡 MEDIUM — At 100+ participants (host view), 2.5-second polling creates bursts  
**Affects:** [`client/src/hooks/useWebRTC.js:469-508`](file:///D:/Projects/REA Lab/G Meet/client/src/hooks/useWebRTC.js#L469)

The host's browser polls `transport.getStats()` every 2500ms. `getStats()` is a relatively expensive operation on the native WebRTC stack. At high participant count on the host's machine, this competes with video rendering.

**Advisory:** 
- Increase interval to 5000ms (5 seconds is sufficient for quality display)
- Use `recvTransportRef` preferentially (recv transport stats are more useful for quality classification)
- Skip stats polling when tab is backgrounded (`document.visibilityState === 'hidden'`)

---

## ARCHITECTURAL IMPROVEMENT ROADMAP

```
Phase 1 — Fix Critical Bugs (1-2 weeks)
  ├── ARCH-002: Add sfu-reconnect-needed client handler
  ├── BUG-001: Same as above
  ├── ARCH-001: Document cluster mode as unsupported; add NODE_ENV check
  ├── BUG-005: Separate screen share stream from camera stream
  └── BUG-007/BUG-008: AudioContext resume + audio element stability

Phase 2 — Activate Existing Architecture (1 week)
  ├── ARCH-003: Wire update-subscription-preferences from client
  ├── ARCH-007: Add server-side AudioLevelObserver (replace client VAD)
  ├── ARCH-005: Add TURN server configuration
  └── ARCH-006: Unify PAGE_SIZE between VideoGrid and useWebRTC

Phase 3 — Feature Parity (2-4 weeks)
  ├── F-13: Co-host assignment
  ├── F-12: Manual host transfer
  ├── F-01: Emoji reactions
  ├── F-10: Private DMs
  ├── F-14: Meeting password
  └── F-25: Mediasoup AudioLevelObserver (if not done in Phase 2)

Phase 4 — Advanced Features (4-8 weeks)
  ├── F-02: Background blur (MediaPipe)
  ├── F-07: Polls
  ├── F-05: Live captions (Web Speech API)
  ├── F-03: Client-side recording
  └── F-06: Breakout rooms

Phase 5 — Scale & Mobile (2-4 weeks)
  ├── ARCH-001 Option B: Redis-based multi-node room routing
  ├── Mobile responsiveness
  ├── ARIA accessibility
  └── TURN server deployment automation
```

---

## Deployment Architecture Recommendation

For the current codebase, the recommended production deployment is **single-process with PM2**, not cluster mode:

```
Internet → Nginx (TLS termination, /ws proxy) → Node.js Process (PM2)
                                                      ↓
                                                4 Mediasoup Workers
                                                (1 per CPU core)
```

For true horizontal scale (100+ concurrent rooms):
```
Internet → Load Balancer (sticky sessions by roomId) 
               ↓                    ↓
         Node A + 4 Workers   Node B + 4 Workers
               ↓                    ↓
                    Redis (room affinity, sessions)
```

