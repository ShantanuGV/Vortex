# VORTEX — Video Collaboration Platform

A high-concurrency, host-moderated video collaboration platform reconstructed with **REA (`morluto/rea`)**.

Engineered with a **Star-Mesh Architecture** ensuring host privacy, ultra-low client resource consumption, and host admission control.

---

## ⚡ Architecture: Host-Moderated Star-Mesh Topology

### 1. Privacy & Participant Isolation
- **Host View**: The meeting Host sees all admitted participants, views the paginated participant grid (6 tiles per page), and has full visibility into total room attendance and the waiting room queue.
- **Non-Host Audience View**: Regular participants **only see the Host and themselves**. They do not see other participants' video feeds and cannot view the roster of who else has joined or the total count.
- **Client Resource Savings**: Because non-hosts maintain only **1 direct peer connection** (to the Host), client CPU and bandwidth consumption remain negligible even if hundreds of people join.

### 2. Host Admission & Waiting Room
- **Knocking Queue**: When host admission is active, joining guests enter the "Asking to join..." waiting room.
- **Host Approval Controls**: The host receives a real-time banner with **[Admit]** and **[Deny]** controls, plus a dedicated waiting list in the participants panel.
- **Failover & Stranding Protection**: If the host leaves with users still in the waiting room, the first waiting user is automatically promoted to Host and admitted, preventing stranded connections. When another participant is promoted, the active waiting list is seamlessly transferred to them.

### 3. WebRTC Negotiation & Audio Stability
- **Deterministic SDP Negotiation**: Uses socket ID comparison (`socket.id < peerId`) to eliminate SDP offer glare collisions when multiple users join simultaneously.
- **Dedicated Remote Audio Elements**: Audio playback runs through independent `<audio autoPlay playsInline />` elements, and video elements remain mounted at `opacity: 0` when camera is off, preventing Chromium from suspending remote WebRTC audio decoding.
- **Pinned Spotlight Persistence**: Pinned participant connections remain permanently subscribed across pagination changes.

### 4. Cluster Mode with Multi-Core Synchronization
- Uses `@socket.io/sticky` and `@socket.io/cluster-adapter` to distribute connections across multiple CPU worker processes while synchronizing signaling state across workers.

### 5. Enterprise Security & Resilience
- **Anti-Abuse Rate Limiting**: Per-socket token-bucket flood protection (default 50 events/sec) to defend against event loop exhaustion and malicious socket spam.
- **Strict Input Sanitization**: HTML escaping and boundary enforcement on room codes, user display names, and chat messages to protect against stored and reflected XSS.
- **Cryptographic Host Session Preservation**: Secure 192-bit token (`hostSecret`) issued to the host. Reconnecting hosts present this token to instantly regain administrative control without being sent to the waiting room.
- **Enterprise NAT Traversal & Configurable STUN/TURN**: Dynamic configuration supporting corporate firewalls, symmetric NATs, and mobile carrier LTE connections via environment variables.
- **Automatic ICE Restart**: Automatic exponential-backoff ICE recovery when connections transition to `disconnected` or `failed`.
- **Cloud Readiness**: Kubernetes and container probes (`/healthz` and `/readyz`) plus graceful lifecycle shutdown (`SIGTERM` / `SIGINT`).

---

## 🛠️ Feature Summary

- [x] **Brand Identity**: VORTEX branding with `Playfair Display` serif typography, Deep Slate (`#252B2D`), Bone White (`#F4F3EF`), and Soft Sage Green (`#9EAB9D`) palette.
- [x] **Host Admission / Waiting Room**: Full knock notification banner and approval controls.
- [x] **Participant Privacy**: Non-hosts only see the host and self; participant counts and attendee lists are private to the host.
- [x] **Host Moderation**: Individual participant mute, mute all, kick participant, lock room, and end meeting for all.
- [x] **Audio/Video Stability**: Dedicated audio playback elements and glare-free deterministic negotiation.
- [x] **Pinned Spotlight**: Pinned participants remain actively subscribed regardless of pagination.
- [x] **Multi-Worker Clustering**: Integrated `@socket.io/sticky` master with cluster adapter.
- [x] **Network Health HUD Pill**: Real-time round-trip latency (RTT), packet loss, and jitter indicator.
- [x] **Picture-in-Picture (PiP)**: Pop out host video or screen share in an independent floating window.
- [x] **Live Vocal Volume Meter**: Web Audio Analyser visualization in Lobby and in-call.
- [x] **Push-to-Talk & Keyboard Shortcuts**: Spacebar to talk, `Ctrl+D` (Mic), `Ctrl+E` (Camera), `Ctrl+H` (Raise Hand), `?` (Guide).
- [x] **Non-Blocking Toast System**: Replaced intrusive browser alerts with smooth, theme-matched toasts.
- [x] **Production Dockerfile & Compose**: Multi-stage lightweight non-root container with built-in healthchecks.
- [x] **Automated Test Suite**: End-to-end integration test (`npm test`) covering security, tokens, probes, and failover.

---

## 💻 Running the Application

### Option A: Standard Single-Process Mode
```bash
# Starts signaling server and serves the built web app
npm start
```
Accessible at: **http://localhost:5000**

### Option B: Cluster Multi-Worker Mode
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
