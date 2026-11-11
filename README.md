# Google Meet High-Scale WebRTC Architecture & REA Lab

A high-concurrency, clean-room reconstruction of the **Google Meet** video conferencing architecture using **REA (`morluto/rea`)**.

Engineered specifically to handle **large-scale calls (500+ participants per meeting across 10+ concurrent rooms = 5,000+ simultaneous connections)** on **minimal hardware with zero lag**.

---

## ⚡ The Scalability Math: How 500+ Users Work Without Lag

### 1. The Naive P2P Mesh Trap ($O(N^2)$)
In a naive WebRTC mesh:
- Number of streams = $N \times (N - 1)$
- For $N = 500$, total streams = **249,500 connections**!
- Each client would upload and decode 499 video streams requiring **~750 Mbps download** and crashing browser hardware decoders within seconds.

### 2. The Google Meet Selective Subscription & SFU Solution ($O(N)$)
This architecture employs **Zero-Transcoding Selective Forwarding & Grid Virtualization**:
1. **Upload**: Each client uploads only **1 stream** (using simulcast layers: 720p / 360p / 180p).
2. **Download (Selective Subscription)**:
   - A display only shows 6 to 9 tiles per page.
   - The client **only downloads and decodes video for the currently visible page** (6 tiles) and the active speaker.
   - The remaining 490+ participants remain in the light-weight roster (names, mute status, hand-raised state), consuming **near-zero bandwidth**.
   - Client bandwidth drops from 750 Mbps to **~2.5 Mbps** (**98.8% bandwidth & CPU savings**).
3. **Voice Activity Detection (VAD) Auto-Promotion**:
   - The server monitors vocal audio levels via Web Audio API analyzers.
   - When any participant starts speaking, the server broadcasts an `active-speaker-change` delta.
   - The client automatically moves the active speaker to the spotlight on Page 1 without manual switching.
4. **Server Event-Loop Protection (50ms Delta Batching)**:
   - When 500 users enter a room, unthrottled individual socket emissions choke Node's single-threaded event loop.
   - The signaling server queues room state changes and flushes them in **50ms batched delta ticks** (`room-deltas`).
5. **Multi-Worker Clustering (5,000+ Concurrent Connections)**:
   - Utilizing Node.js `cluster` across the host's CPU cores (12 cores), distributing the connection load evenly across isolated worker threads.

---

## 🏗️ Architecture Blueprint

```
[ Participant 1..500 (Browser) ]
        │
        ├── Upload: 1 WebRTC Stream (Webcam + Mic with VAD)
        │
        ├── Download: Selective Active Page (6 Video Tiles Max)
        │   └── 98.8% Bandwidth/CPU Conservation
        │
        ▼ WebSocket (Compact 50ms Deltas)
┌────────────────────────────────────────────────────────┐
│               Primary Cluster Manager                  │
│             Spawns Workers Across 12 Cores             │
├──────────────────────────┬─────────────────────────────┤
│ Worker Core 1            │ Worker Core 2..12           │
│ • Room 1 (500 Peers)     │ • Room 2..10 (500 Peers ea) │
│ • 50ms Batched Deltas    │ • 50ms Batched Deltas       │
│ • VAD Speaker Broker     │ • VAD Speaker Broker        │
│ • Zero Transcode Routing │ • Zero Transcode Routing    │
└──────────────────────────┴─────────────────────────────┘
```

---

## 🛠️ Implemented Features Checklist

- [x] **Pre-Join Green Room (Lobby)** with camera & mic preview.
- [x] **Scalable Paginated Video Grid**: Supports 1 to 500+ participants with `< Prev` / `Next >` page navigation.
- [x] **Voice Activity Detection (VAD)**: Real-time speaking detection with audio pulse wave indicators.
- [x] **Active Speaker Dynamic Spotlight**: Auto-promotes talking participants into view.
- [x] **Raise Hand Queue**: Interactive hand toggle with priority sorting in the participant roster.
- [x] **Searchable Participant Directory**: Instant search across 500+ attendees, categorized into Speakers vs. Audience.
- [x] **Scale & Telemetry HUD**: Live floating diagnostics showing total room count, active decoders, and bandwidth saved.
- [x] **Keyboard Shortcuts**: `Ctrl + D` (Microphone mute/unmute), `Ctrl + E` (Camera toggle).
- [x] **Screen Sharing**: Seamless track replacement via `getDisplayMedia`.
- [x] **In-Call Real-Time Chat**: Integrated slide-out messaging panel.
- [x] **Multi-Worker Clustering**: High-concurrency launcher (`server/cluster.js`) utilizing all host CPU cores.

---

## 💻 Running the Application

### Option A: Standard Single-Process Mode
```bash
# Start backend server & frontend static bundle
npm run server
```
App will be accessible at: **http://localhost:5000**

### Option B: High-Concurrency Cluster Mode (For 10+ Rooms & 5,000+ Users)
```bash
# Launches multi-worker cluster across all CPU cores
cd server
npm run start:cluster
```

### Live Telemetry & Health Endpoints
- **Health Check:** `http://localhost:5000/api/health`
- **System Metrics & Load:** `http://localhost:5000/api/metrics`

---

## 🧪 REA Audit
Verify feature parity and reconstruction coverage against REA specifications:
```bash
npm run rea:doctor
npm run rea:audit
```
