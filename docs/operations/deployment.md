# VORTEX — Operations & Deployment Guide

**Document:** `docs/operations/deployment.md`  
**Status:** Operational Reference

---

## 1. System Requirements & Architecture Models

VORTEX supports three deployment topologies depending on target scale:

| Deployment Option | Typical Concurrency | Components | Infrastructure |
| :--- | :--- | :--- | :--- |
| **Option A: Standalone Multi-Worker** | Up to 1,000 active participants | Node.js + In-Memory Atomic Coordinator + Multi-Worker Pool | 1 Host / Container (4-8 vCPUs) |
| **Option B: Multi-Core Clustered** | Up to 5,000 active participants | `@socket.io/sticky` Master + Cluster Adapter + Mediasoup Multi-Worker | 1 Dedicated Host (16+ vCPUs) |
| **Option C: Distributed Fabric** | 10,000+ active participants | Multi-Node Signaling + Shared Redis Sentinel + Mediasoup Media Nodes | Multiple VM/Container instances behind Load Balancer |

---

## 2. Environment Variables Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `5000` | HTTP & WebSocket signaling port |
| `NODE_ENV` | `production` | Node environment (`production` / `development`) |
| `CORS_ORIGIN` | `*` | Allowed CORS origins for signaling requests |
| `RATE_LIMIT_PER_SEC` | `50` | Maximum signaling WebSocket events per second per socket |
| `REDIS_URL` | `null` | Redis connection URL for distributed coordination (e.g. `redis://redis:6379`). Uses memory atomic coordinator if unset. |
| `MEDIASOUP_WORKERS` | `os.cpus().length` | Number of Mediasoup C++ worker subprocesses to spawn per node |
| `MEDIASOUP_MIN_PORT`| `40000` | Start of WebRTC UDP/TCP port range |
| `MEDIASOUP_MAX_PORT`| `49999` | End of WebRTC UDP/TCP port range |
| `MEDIASOUP_LISTEN_IP`| `0.0.0.0` | Local network interface IP to bind WebRTC sockets |
| `MEDIASOUP_ANNOUNCED_IP`| `null` | Public IPv4 or DNS FQDN for WAN NAT traversal |
| `VITE_STUN_SERVERS` | `stun:stun.l.google.com:19302` | STUN server URLs for client ICE gathering |

---

## 3. Deployment Runbooks

### Option A: Standard Multi-Worker Boot
```bash
# Builds client and starts multi-worker fabric server
npm run build
npm start
```
Accessible at: **http://localhost:5000**

### Option B: Sticky Cluster Mode
```bash
cd server
npm run start:cluster
```

### Option C: Production Docker Deployment
```bash
# Start containerized fabric
docker compose up -d --build

# View real-time fabric logs
docker compose logs -f
```

---

## 4. NAT Traversal & Firewall Configuration

For public Internet deployments, ensure firewall access for:
1. **Signaling Port**: `TCP 5000` (or `443` via reverse proxy)
2. **WebRTC Media Port Range**: `UDP 40000–49999`
3. **Environment Setup**: Set `MEDIASOUP_ANNOUNCED_IP` to the public Elastic IP or external WAN address of the media host.

