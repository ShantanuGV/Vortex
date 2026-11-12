# VORTEX — Enterprise Video Collaboration Platform

A high-concurrency, host-moderated video collaboration platform powered by a **Centralized Selective Forwarding Unit (SFU)** built with **Mediasoup (C++)** and **Node.js Clustered Signaling**.

Reconstructed and hardened with **REA (`morluto/rea`)**.

---

## ⚡ Architecture: Mediasoup Centralized SFU Topology

```
             ┌────────────────────────────────────────────────────────┐
             │                  VORTEX SFU NODE                       │
             │                                                        │
             │   ┌────────────────────────────────────────────────┐   │
             │   │            Node.js Signaling Worker            │   │
             │   │   (Socket.IO + Cluster Adapter + Rate Limit)   │   │
             │   └───────────────────────┬────────────────────────┘   │
             │                           │ IPC Pipe                   │
             │   ┌───────────────────────▼────────────────────────┐   │
             │   │           Mediasoup C++ SFU Worker             │   │
             │   │  ┌──────────────────────────────────────────┐  │   │
             │   │  │        Room Router (Per Room ID)         │  │   │
             │   │  │  ├─ Send WebRtcTransport (Producer)      │  │   │
             │   │  │  ├─ Recv WebRtcTransport (Consumer)      │  │   │
             │   │  │  └─ 3-Layer Simulcast Forwarding         │  │   │
             │   │  └──────────────────────────────────────────┘  │   │
             │   └────────────────────────────────────────────────┘   │
             └───────────────────────▲───────▲────────────────────────┘
                                     │       │
              WebRTC Send/Recv       │       │ WebRTC Send/Recv
                  (SRTP/UDP)         │       │    (SRTP/UDP)
                                     │       │
                     ┌───────────────┴─┐   ┌─┴────────────────┐
                     │   Host Client   │   │   Guest Client   │
                     │(mediasoup-client│   │(mediasoup-client │
                     │  Device & Refs) │   │  Device & Refs)  │
                     └─────────────────┘   └──────────────────┘
```

### 1. Centralized SFU via Mediasoup
- **C++ SFU Core**: Exactly one high-performance Mediasoup worker per Node.js clustered process handles real-time SRTP encryption, packet routing, and dynamic spatial/temporal layer selection.
- **Dedicated Room Routers**: When a meeting room is initialized, a dedicated Mediasoup Router is instantiated bound specifically to that `roomId` with negotiated Opus audio and VP8/H.264 video capabilities.
- **Webinar Privacy Isolation**: 
  - Host video/audio producers are forwarded to all admitted guests.
  - Guest video/audio producers are forwarded strictly to the Host.
  - Guests never receive media or roster information from other guests.

### 2. Dynamic Bandwidth Adaptation with Simulcast
- Local video tracks are published with **3-Layer Simulcast**:
  - **Spatial Layer 0 (Low)**: 180p @ 100 kbps (1/4 scale)
  - **Spatial Layer 1 (Medium)**: 360p @ 300 kbps (1/2 scale)
  - **Spatial Layer 2 (High)**: 720p @ 900 kbps (full resolution)
- The SFU dynamically throttles or elevates bitrates based on each receiving peer's network condition and viewport size.

### 3. Stable React Client Media Storage (Zero-Jitter Render Pipeline)
- React frontend uses `mediasoup-client`'s `Device` class.
- All `Transport`, `Producer`, `Consumer`, and `MediaStream` objects are stored in persistent React Refs and Maps outside the component render cycle.
- Prevents DOM track re-initialization, media element tearing, or audio clipping when UI state changes (chat, attendee list, timers).

### 4. Signaling Protocol Endpoints
- `getRouterRtpCapabilities`: Fetches the SFU router's supported codecs (Opus, VP8, H264).
- `createWebRtcTransport`: Allocates Send or Recv WebRtcTransport with configurable `listenIps` and `announcedIp` for NAT traversal.
- `connectWebRtcTransport`: Exchanges DTLS parameters with the Mediasoup C++ worker.
- `produce`: Ingests client audio/video tracks into the SFU with simulcast encodings.
- `consume`: Creates server-side consumer and routes remote media tracks to clients.
- `resumeConsumer` / `pauseProducer` / `closeProducer`: Real-time media control.

### 5. Enterprise Security & Session Resilience
- **Cryptographic Host Secret**: 192-bit cryptographic session token (`hostSecret`) allows hosts to seamlessly recover administrative rights across network drops.
- **Token-Bucket Rate Limiter**: 50 socket events/sec rate limiter prevents event-loop abuse.
- **Stored & Reflected XSS Protection**: Deep payload sanitization for chat messages and usernames.
- **Cluster Synchronization**: `@socket.io/cluster-adapter` and `@socket.io/sticky` for horizontal multi-core scale.

---

## 🛠️ Feature Summary

- [x] **Brand Identity**: VORTEX branding with `Playfair Display` serif typography, Deep Slate (`#252B2D`), Bone White (`#F4F3EF`), and Soft Sage Green (`#9EAB9D`) palette.
- [x] **Mediasoup SFU Architecture**: Migrated from P2P star-mesh to enterprise-grade centralized SFU.
- [x] **Simulcast Ingestion**: 3-layer adaptive simulcast encoding (180p, 360p, 720p).
- [x] **Zero-Render-Jitter Client Hook**: Media tracks and consumers decoupled from React state renders.
- [x] **Host Admission / Waiting Room**: Knock notification banner and approval controls.
- [x] **Webinar Privacy Isolation**: Non-hosts only receive host stream; guest list hidden from attendees.
- [x] **Host Moderation**: Individual participant mute, mute all, kick participant, lock room, and end meeting.
- [x] **Network Health HUD Pill**: Real-time round-trip latency (RTT), packet loss, and jitter indicator via `transport.getStats()`.
- [x] **Picture-in-Picture (PiP)**: Pop out host video or screen share in an independent floating window.
- [x] **Live Vocal Volume Meter**: Web Audio Analyser visualization in Lobby and in-call.
- [x] **Push-to-Talk & Keyboard Shortcuts**: Spacebar to talk, `Ctrl+D` (Mic), `Ctrl+E` (Camera), `Ctrl+H` (Raise Hand), `?` (Guide).
- [x] **Non-Blocking Toast System**: Smooth, theme-matched toasts replacing browser alerts.
- [x] **Automated Test Suite**: End-to-end integration test (`npm test`) covering SFU signaling, RTP negotiation, DTLS exchange, XSS security, tokens, and probes.

---

## 💻 Running the Application

### Option A: Standard Single-Process SFU Mode
```bash
# Starts Mediasoup SFU signaling server and serves the built web app
npm start
```
Accessible at: **http://localhost:5000**

### Option B: Cluster Multi-Worker SFU Mode
```bash
cd server
npm run start:cluster
```

### Option C: Production Docker Deployment
```bash
docker compose up -d
```

### Run Automated Integration Tests
```bash
npm test
```

### Health & Metrics
- **Liveness Probe:** `http://localhost:5000/healthz`
- **Readiness Probe:** `http://localhost:5000/readyz`
- **Health Summary:** `http://localhost:5000/api/health`
- **System Metrics & Load:** `http://localhost:5000/api/metrics`
