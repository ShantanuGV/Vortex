# VORTEX — Distributed Media Fabric & Enterprise Video Platform

A high-concurrency, host-moderated, enterprise video conferencing platform powered by a **Distributed Media Fabric** utilizing **Mediasoup C++ Workers**, **Intelligent Virtual Media Streams**, and **Distributed Session State**.

Reconstructed and hardened with **REA (`morluto/rea`)**.

---

## ⚡ Architecture: Distributed Media Fabric

```
Developer / Browser Clients (mediasoup-client Device)
        │
        ▼
Load Balancer / Ingress Port
        │
        ▼
Signaling Cluster (Socket.IO + AuthGuard + Rate Limiting)
        │
        ├──── Shared State Coordinator (Redis / Memory Atomic Coordinator)
        │     • Room Metadata & Distributed Locks
        │     • Session Presence & 30s Grace Reconnection Tokens
        │
        ▼
Room Placement & Router Allocator (Worker Capacity & Affinity Engine)
        │
        ▼
Distributed Media Fabric (Multi-Worker Pool & PipeTransports)
        ├──── Media Node Alpha
        │       ├─ Worker 0 (CPU Core 0) ── Router A
        │       ├─ Worker 1 (CPU Core 1) ── Router B
        │       └─ Local PipeTransport Inter-Worker Relay
        │
        └──── Media Node Beta
                ├─ Worker 2 (CPU Core 2) ── Router C
                ├─ Worker 3 (CPU Core 3) ── Router D
                └─ Cross-Host PipeTransport Tuple Relay
```

---

## 🛠️ The Six Architectural Upgrades

### 1. Distributed Media Infrastructure
- **Multi-Worker Pool**: Spawns $N$ Mediasoup C++ workers mapped to independent CPU cores.
- **Worker Allocation**: Assigns rooms to the least-loaded worker with room affinity.
- **Cross-Router & Cross-Worker PipeTransports**: Dynamically pipes producers between routers on different workers or nodes using Mediasoup's `pipeToRouter` and explicit UDP tuples.

### 2. Virtual Media Streams (VMS)
- Implements a receiver-centric logical stream slotting abstraction inspired by Google Meet's public virtual stream model.
- Maintains a fixed budget of downstream video slots (Screen + up to 6 video slots).
- Off-screen or low-priority feeds are paused on the SFU with `consumer.pause()`, conserving client downlink bandwidth and CPU decoders.

### 3. Intelligent Media Subscription & Adaptive Simulcast
- **Priority Ordering**: 1. Screen Share ➔ 2. Pinned Participant ➔ 3. Active Speaker ➔ 4. Recent Speakers (8s decay) ➔ 5. Visible Viewport Tiles.
- **Dynamic Simulcast Layer Selection**: Highest-priority feeds receive Spatial Layer 2 (720p @ 900 kbps); grid tiles receive Layer 1 (360p) or Layer 0 (180p).
- **Network Quality Classifier**: Real-time evaluation of RTT, loss, and jitter with automatic layer downscaling.

### 4. Group Meeting & Webinar Dual Routing
- **Conference Mode**: Full multi-participant group conference where all participants can publish and consume streams.
- **Webinar Mode**: Strict privacy mode where attendees only see the host, and non-host video is routed strictly to the host.
- **Centralized AuthGuard**: Validates transport ownership, producer ownership, room membership, and publish/consume permissions on every signaling call.

### 5. Distributed Session & Room Management
- Shared Redis-backed coordination with pluggable in-memory atomic coordinator for zero-dependency testability.
- Atomic room initialization locks (`acquireLock('room-init:' + roomId)`).
- **30-Second Grace Period Reconnection**: Reconnecting users recover session and host authority seamlessly using cryptographic tokens.

### 6. Failure Recovery, Supervision & Observability
- **Worker Crash Detection**: Active supervisor monitors worker process lifecycles.
- **Automated Failover**: Detects worker death, reallocates rooms to healthy workers, and broadcasts `sfu-reconnect-needed`.
- **Prometheus Metrics**: Exposes active rooms, participants, workers, transports, producers, and consumers at `/api/metrics`.

---

## 💻 Running the Application

### Option A: Standard Multi-Worker SFU Mode
```bash
# Starts VORTEX Distributed Media Fabric on port 5000
npm start
```
Accessible at: **http://localhost:5000**

### Option B: Sticky Multi-Core Cluster Mode
```bash
cd server
npm run start:cluster
```

### Option C: Production Docker Deployment
```bash
docker compose up -d --build
```

---

## 🧪 Comprehensive Verification & Test Suites

VORTEX includes 6 dedicated test suites covering all architectural layers:

```bash
# 1. Run unit test suite (WorkerPool, permissions, AuthGuard, VMS, VAD, state)
npm run test:unit

# 2. Run baseline SFU signaling and probe test
npm test

# 3. Run multi-participant group conference routing & anti-spoofing
npm run test:conf

# 4. Run distributed cross-worker PipeTransport routing
npm run test:dist

# 5. Run failure-injection and self-healing reliability test
npm run test:fail

# 6. Run concurrency load benchmark
npm run test:load

# 7. Run real dual-browser context audio/video transmission test (Playwright)
npm run test:browser

# 8. Run all test suites consecutively
npm run test:all
```

### Measured Load Benchmark Results:
- **32 / 32** concurrent clients connected across **4 rooms**.
- **32** WebRTC transports allocated in **0.73s** (**44.0 joins/sec**).
- **4 C++ Mediasoup Workers** load-balanced evenly.
- Real dual-browser video & audio element playback verified.

---

## 📊 Health Probes & Telemetry
- **Liveness Probe:** `http://localhost:5000/healthz`
- **Readiness Probe:** `http://localhost:5000/readyz`
- **Health Summary:** `http://localhost:5000/api/health`
- **System Metrics (JSON / Prometheus):** `http://localhost:5000/api/metrics`
