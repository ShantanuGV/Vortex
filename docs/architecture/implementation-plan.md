# VORTEX — Engineering Implementation Plan & Risk Mitigation

**Date:** November 12, 2026  
**Document:** `docs/architecture/implementation-plan.md`

---

## 1. Compatibility & Regression Risk Matrix

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Breaking React Client Contracts** | High | All existing Socket.IO event names (`join-room`, `room-snapshot`, `room-deltas`, `new-producer`, `consume`, etc.) will maintain exact backward compatibility in payloads. |
| **Host Moderation State Loss** | High | Host privileges, cryptographic tokens (`hostSecret`), waiting room knocking, and mute/kick actions remain centralized with validated server-side ownership. |
| **Redis Dependency in Local/Dev Mode** | Medium | Implement an abstraction layer (`distributedState.js`) with an in-memory Redis-compatible fallback so the app works identically out-of-the-box without requiring an external Redis instance, while seamlessly utilizing real Redis when `REDIS_URL` is provided. |
| **Simulcast Layer Incompatibility** | Medium | Ensure fallback to standard spatial layer 0 when temporal/spatial switching is not supported by client codec/browser. |
| **Worker Deadlock during PipeTransport** | Medium | Dedicated `pipeManager.js` ensures unidirectional pipe transports with automatic cleanup on router or producer closure. |

---

## 2. Phase Execution Roadmap

- **Phase 0 — Audit & Architecture Design** *(Completed)*
  - Complete source inspection.
  - Deliver `docs/architecture/current-state-audit.md`.
  - Deliver `docs/architecture/target-architecture.md`.
  - Deliver `docs/architecture/implementation-plan.md`.

- **Phase 1 — Security & Group Meeting Correctness (Upgrade 4)**
  - Implement `security/authGuard.js` (ownership, room membership, permission verification).
  - Implement meeting mode support (`conference` vs `webinar`) in routing.
  - Implement granular producer authorization.
  - Build integration tests verifying multi-participant group media exchange and unauthorized access rejection.

- **Phase 2 — Intelligent Media Subscriptions (Upgrade 3)**
  - Implement `subscription/networkMonitor.js` (RTT, loss, jitter classification).
  - Implement `subscription/subscriptionEngine.js` (priority ordering: screen, pinned, active speaker, visible tiles).
  - Implement `media/simulcastManager.js` (preferred spatial and temporal layer selection).
  - Add tests for dynamic layer switching and priority reordering.

- **Phase 3 — Distributed Media Infrastructure (Upgrade 1)**
  - Implement `media/workerPool.js` (multi-worker initialization, core affinity, capacity metrics).
  - Implement `media/mediaNode.js` (node identity and capacity tracking).
  - Implement `media/pipeManager.js` (inter-worker / cross-host PipeTransport forwarding).
  - Add tests for multi-worker and cross-router pipe forwarding.

- **Phase 4 — Distributed Session & Room Management (Upgrade 5)**
  - Implement `state/distributedState.js` (Redis client with in-memory fallback).
  - Implement `state/sessionManager.js` (presence, heartbeats, grace-period reconnection).
  - Implement `state/roomManager.js` (distributed room ownership and lifecycle).
  - Add lifecycle and session recovery tests.

- **Phase 5 — Virtual Media Streams (Upgrade 2)**
  - Implement `subscription/virtualMediaStream.js` (logical virtual stream abstraction).
  - Integrate with client media selection.
  - Deliver documentation distinguishing logical virtual streams vs combined RTP streams.

- **Phase 6 — Failure Recovery, Observability & Verification (Upgrade 6)**
  - Implement `monitoring/supervisor.js` (worker death detection and failover trigger).
  - Implement `monitoring/metrics.js` (Prometheus-compatible endpoints and load metrics).
  - Build failure-injection tests, distributed tests, browser tests, and load test scripts.
  - Deliver full operational and architectural documentation.
