# VORTEX — Media Routing & Transport Architecture

**Document:** `docs/architecture/media-routing.md`  
**Status:** Production Architecture

---

## 1. Overview

The VORTEX Distributed Media Fabric provides flexible, low-latency WebRTC media routing using **Mediasoup C++ Workers** arranged in a multi-worker pool. It supports both **Group Conference Mode** (peer-to-peer visibility through SFU) and **Webinar Mode** (strict host-moderated broadcast).

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Participant Alice (Publisher)
    participant ClientHook as useWebRTC.js (mediasoup-client)
    participant Signaling as Socket.IO Signaling (Node.js)
    participant RouterA as Mediasoup Router A (Worker 0)
    participant RouterB as Mediasoup Router B (Worker 1)
    actor Bob as Participant Bob (Receiver)

    Note over Alice,Bob: 1. Ingestion Phase (Simulcast Ingestion)
    Alice->>ClientHook: Enable Camera
    ClientHook->>Signaling: produce({ transportId, kind: 'video', rtpParameters (3 Simulcast Layers) })
    Signaling->>RouterA: transport.produce()
    RouterA-->>Signaling: producer (ID: prod-vid-1)
    Signaling-->>ClientHook: { id: prod-vid-1 }

    Note over Signaling,Bob: 2. Routing & Forwarding Evaluation
    Signaling->>Signaling: SubscriptionEngine evaluates Bob's priority & layer budget
    
    alt Receiver on Different Worker Router
        Signaling->>RouterA: pipeToRouter({ producerId, router: RouterB })
        RouterA->>RouterB: PipeTransport SRTP Stream
    end

    Signaling->>Bob: new-producer({ producerId, kind: 'video' })
    Bob->>Signaling: consume({ transportId, producerId, rtpCapabilities })
    Signaling->>RouterB: transport.consume({ paused: true })
    RouterB-->>Signaling: consumer (ID: cons-1)
    Signaling-->>Bob: consumer parameters
    Bob->>Signaling: resumeConsumer({ consumerId: cons-1 })
    RouterB-->>Bob: Downlink Media Forwarding (Selected Simulcast Layer)
```

---

## 2. Ingestion & Multi-Layer Simulcast

Local camera video streams are ingested using 3-layer spatial simulcast:

| Layer | RID | Resolution | Target Bitrate | Scale Factor | Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Layer 0 (Low)** | `r0` | 180p (320x180) | 100 kbps | 1/4 | Inactive grid tiles, constrained downlink |
| **Layer 1 (Medium)** | `r1` | 360p (640x360) | 300 kbps | 1/2 | Standard active grid tiles (2-6 tiles) |
| **Layer 2 (High)** | `r2` | 720p (1280x720) | 900 kbps | 1.0 (Full) | Active speaker spotlight & pinned participant |

Screen-sharing video tracks are produced as independent high-framerate/high-detail video producers (`mediaType: 'screen'`) without spatial downscaling.

---

## 3. Meeting Modes: Conference vs Webinar

The meeting policy engine supports two distinct routing topologies configurable by the host:

### Mode A: Group Conference (`conference`)
- All admitted participants are authorized to produce audio, video, and screen share (subject to host locks).
- The SFU broadcasts `new-producer` events to all room members.
- Participants consume each other's audio and video according to the **Intelligent Subscription Engine** budget (up to 6 concurrent video tiles).

### Mode B: Webinar Privacy (`webinar`)
- Host feeds (audio, video, screen share) are forwarded to all participants.
- Non-host participant feeds are routed strictly to the Host and Co-Hosts.
- Regular attendees do not receive other attendees' media or presence information.

---

## 4. Cross-Worker & Cross-Host PipeTransport Protocol

When room capacity exceeds a single worker core or spans multiple media nodes:
1. **Local Inter-Worker Pipe**:
   - `pipeManager.pipeProducerLocal({ sourceRouter, targetRouter, producerId })` invokes Mediasoup's C++ `pipeToRouter` API.
   - Creates a bidirectional loopback `PipeTransport` pair between the worker processes.
2. **Cross-Host Forwarding**:
   - `pipeManager.createCrossHostPipeTransport(router, { listenIp })` allocates UDP pipe ports.
   - Transports connect across hosts exchanging IP and port tuples.
   - Stream is consumed on source pipe transport and produced on target pipe transport.
