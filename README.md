# Google Meet WebRTC Clone & REA Reverse Engineering Lab

This repository reconstructs the **Google Meet** web client architecture using **REA (`morluto/rea`)** — the AI Reverse Engineering Assistant toolkit.

---

## 🚀 Live App Status

The signaling server and web application are actively running locally:
- **Application URL:** [http://localhost:5000](http://localhost:5000)
- **API & Signaling Endpoint:** `http://localhost:5000`

---

## 🏗️ Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │          Google Meet Web Client         │
                      │  (React 19 + Vite + Lucide Icons)       │
                      └─────────────┬───────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌────────────────────────┐                        ┌──────────────────────┐
│  Signaling Transport   │                        │  WebRTC Media Engine │
│  (Socket.io / HTTP)    │                        │  (Peer-to-Peer Mesh) │
└──────────┬─────────────┘                        └──────────┬───────────┘
           │                                                 │
           ▼                                                 ▼
┌────────────────────────┐                        ┌──────────────────────┐
│ Node.js Server (:5000) │                        │ Google STUN Servers  │
│ • Room Directory       │                        │ stun.l.google.com    │
│ • SDP Offer/Ans Relay  │                        │ • Public IP discovery│
│ • ICE Candidate Relay  │                        │ • NAT Traversal      │
│ • Real-time Chat Sync  │                        │ • Audio/Video Media  │
└────────────────────────┘                        └──────────────────────┘
```

---

## 🛠️ Implemented Features (REA Parity Checklist)

Verified against [`.rea/reconstruction-ledger.json`](file:///d:/Projects/REA%20Lab/G%20Meet/.rea/reconstruction-ledger.json):

1. **Pre-Join Green Room (Lobby)**:
   - Live camera preview before entering.
   - Microphone & camera toggle with status indicators.
   - Dynamic room code generator (`abc-defg-hij` format).
   - Custom display name selection.
2. **In-Call WebRTC Grid**:
   - Adaptive responsive video grid for multiple participants (1, 2, 4, 6+ participants).
   - Spotlight / Pinned video mode (click pin icon on any participant).
   - Fallback user avatar initials when video is turned off.
   - Participant audio mute indicator.
3. **Meeting Controls (Google Meet Dark Theme)**:
   - Microphone toggle (`Mic` / `MicOff`).
   - Camera toggle (`Video` / `VideoOff`).
   - Screen sharing via `navigator.mediaDevices.getDisplayMedia` with seamless track replacement.
   - Leave call button with graceful room cleanup.
4. **Collaboration & Info Panels**:
   - Slide-out **In-call Messages** panel for real-time text chat.
   - **People** panel showing list of connected participants with their mute/video states.
   - **Meeting Details** panel with one-click URL copy.

---

## 💻 Developer Commands

### 1. Run the App
```bash
# Start backend & serve production build
npm run server

# Or run frontend with Vite Hot Module Reloading (HMR)
cd client
npm run dev
```

### 2. Audit with REA
```bash
# Check REA doctor
npm run rea:doctor

# Check reconstruction obligation coverage
npm run rea:audit
```

