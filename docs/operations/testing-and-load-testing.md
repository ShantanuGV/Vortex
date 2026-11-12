# VORTEX — Testing & Load Testing Runbook

**Document:** `docs/operations/testing-and-load-testing.md`  
**Status:** Verification Runbook & Benchmarks

---

## 1. Test Suite Structure

The VORTEX Distributed Media Fabric includes 6 automated test suites covering all architectural layers:

```
tests/
├── integration.test.mjs             # Baseline Mediasoup SFU & probe tests
├── unit/
│   └── fabric.unit.test.mjs         # WorkerPool, permissions, authGuard, VMS, VAD, state
├── integration.conference.test.mjs  # Multi-participant group conference routing & anti-spoofing
├── distributed/
│   └── distributed.test.mjs         # Multi-worker & cross-host PipeTransport routing
├── failure/
│   └── failure.test.mjs             # Worker crash recovery, grace reconnection, state fallback
├── load/
│   └── load.test.mjs                # Concurrency load harness & server telemetry
└── browser/
    └── multibrowser.test.mjs        # Playwright dual-browser real A/V transmission test
```

---

## 2. Test Execution Commands

```bash
# 1. Run unit test suite
npm run test:unit

# 2. Run baseline integration test suite
npm test

# 3. Run multi-participant group conference test
npm run test:conf

# 4. Run distributed cross-worker PipeTransport test
npm run test:dist

# 5. Run failure-injection and self-healing test
npm run test:fail

# 6. Run concurrency load benchmark
npm run test:load

# 7. Run real dual-browser context audio/video test
npm run test:browser

# 8. Run all test suites consecutively
npm run test:all
```

---

## 3. Measured Benchmark Results

*Test Environment: Windows 11 x64, Node.js v26.13.0, 4 C++ Mediasoup Workers, 16 GB RAM.*

| Benchmark Metric | Measured Result |
| :--- | :--- |
| **Concurrent Client Sessions** | **32 / 32 Connected** |
| **Concurrent Active Rooms** | **4 Rooms** |
| **WebRTC Transports Allocated** | **32 Transports** |
| **Ramp-Up Elapsed Time** | **0.73 Seconds** |
| **Join Throughput** | **44.0 Joins / Second** |
| **Client Benchmark Memory (RSS)** | **67 MB** |
| **Server Heap Memory** | **21 MB** |
| **Active C++ Mediasoup Workers** | **4 Workers** |
| **Worker Router Distribution** | `[W0: 6 routers], [W1: 3 routers], [W2: 3 routers], [W3: 2 routers]` |
| **Dual-Browser Real Media Test** | **PASS** (Live video & audio element playback verified in dual Playwright contexts) |
| **Worker Death Recovery** | **PASS** (Zero room loss; automated failover and router re-binding) |

