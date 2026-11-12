# VORTEX — Missing Features Report
**vs. Google Meet Feature Parity**  
**Date:** 2026-11-12  
**Analyst:** Senior WebRTC Engineer (QA Role)

---

## Parity Assessment Summary

> [!IMPORTANT]
> **Intentional Design:** Only the host/admin can see the full participant list and count. Normal participants only see themselves and the host. This is by design and is NOT listed as missing or a bug.

**Estimated Google Meet Parity: ~38%**

Core video/audio works. The gap is primarily in collaboration features, media quality features, and enterprise/admin features.

---

## Feature Matrix

### ✅ PRESENT (Implemented)

| Feature | Implementation Quality | Notes |
|---|---|---|
| Join meeting via code | Good | Lobby with preview |
| Audio/Video toggle | Good | With producer pause/resume |
| Screen sharing | Partial | No separate tile for screen vs camera |
| In-call chat (broadcast) | Good | Sanitized, rate-limited |
| Raise hand | Good | Visible badge + roster indicator |
| Mute all (host) | Good | With policy lock |
| Mute individual (host) | Good | Quick-mute button on tile |
| Kick participant (host) | Good | With reason message |
| Lock meeting (host) | Good | Rejects new joiners |
| End meeting for all (host) | Good | With confirmation |
| Waiting room (admission) | Good | Admit/deny/admit-all |
| Host transfer | Partial | Auto-migration only; no manual transfer |
| Session reconnection | Good | 30s grace period + hostSecret restoration |
| Participant grid (host) | Good | Pagination, spotlight, pin |
| Network quality HUD | Partial | Stats unreliable on Firefox/Safari |
| Picture-in-Picture | Good | Per-tile PiP button |
| Active speaker highlight | Partial | Client-side VAD; no Mediasoup AudioLevelObserver |
| Simulcast (3-layer) | Present but inactive | Never triggered from client |
| Camera device selection | Good | In settings modal |
| Mic device selection | Good | In settings modal |
| Resolution selection | Good | 180p/360p/720p |
| Mirror video (self) | Good | Toggle in settings |
| Keyboard shortcuts | Good | Shortcuts modal |
| Participant color assignment | Good | Deterministic hash-based |
| "You" badge highlight | Good | Google Meet-style |
| Secure host token | Good | Crypto random, session-persisted |
| XSS sanitization | Good | On all user input |
| Rate limiting | Good | Token bucket per socket |

---

### ❌ MISSING FEATURES (vs. Google Meet)

---

#### TIER 1 — Core UX (Most Visible Gaps)

---

**F-01 · Emoji Reactions**  
Real-time emoji reactions (👍 🎉 ❤️ 😂 😮 🙌) that float up from the sender's tile. Used constantly in Google Meet for non-verbal feedback without unmuting.  
**Complexity:** Low — socket event + CSS animation  
**Files to change:** `Controls.jsx`, `VideoTile.jsx`, new `socketHandlers.js` event, `useWebRTC.js`

---

**F-02 · Background Blur / Virtual Backgrounds**  
Client-side background segmentation using MediaPipe Selfie Segmentation or TensorFlow.js BodyPix. The UI scaffold exists (`backgroundEffect: 'none'` in settings and `videoFilter` in VideoTile), but only CSS `blur()` is applied to the entire video element — not background segmentation.  
**What exists:** A CSS blur filter that blurs the ENTIRE frame including the person.  
**What's missing:** Actual background replacement/blur keeping the person sharp.  
**Complexity:** High — requires WASM/TFJS integration, MediaStream processing pipeline  
**Files to change:** `useWebRTC.js` (canvas pipeline), `VideoTile.jsx`

---

**F-03 · Recording (Client-Side or Server-Side)**  
No meeting recording capability. Google Meet offers cloud recording for Workspace accounts. Even a client-side MediaRecorder implementation is absent.  
**Complexity:** Medium (client-side), Very High (cloud/server-side)

---

**F-04 · Noise Cancellation (Krisp-style)**  
The settings show `noiseCancellation: true` which maps to the browser's native `noiseSuppression: true` constraint — this is basic and inconsistent across browsers. There is no real AI noise cancellation (Krisp, RNNoise, or similar WASM model).  
**What exists:** Browser native `noiseSuppression` constraint  
**What's missing:** Real-time ML noise suppression  
**Complexity:** High

---

**F-05 · Closed Captions / Live Transcription**  
No real-time captions. Google Meet uses Google's Speech-to-Text API. A basic client-side Web Speech API implementation could be a reasonable approximation.  
**Complexity:** Medium (Web Speech API), High (server-side STT)

---

#### TIER 2 — Collaboration Features

---

**F-06 · Breakout Rooms**  
Ability for host to split participants into smaller sub-rooms with auto-return. Requires sub-room creation, participant assignment, and session migration.  
**Complexity:** Very High — new room lifecycle, UI, participant migration flow

---

**F-07 · Polls**  
In-meeting real-time polls with multiple choice options, live results, and host control.  
**Complexity:** Medium — socket events, React state, no DB needed for ephemeral polls

---

**F-08 · Q&A Mode**  
Structured question submission, upvoting, and host answer flow. Similar to polls in complexity.  
**Complexity:** Medium

---

**F-09 · Whiteboard Collaboration**  
Real-time shared canvas. Options: integrate tldraw, Excalidraw, or build from scratch.  
**Complexity:** High — requires CRDT or operational transform for multi-user sync

---

**F-10 · In-Meeting Private Direct Messages**  
Currently only broadcast chat exists. Google Meet supports private sidebar DMs to individual participants.  
**What's missing:** `targetPeerId` on `send-chat` event, private routing, UI differentiation  
**Complexity:** Low

---

**F-11 · Agenda / Meeting Notes Panel**  
Shared text pad accessible during the meeting for notes/agenda. Google Docs integration in Google Meet.  
**Complexity:** Medium–High

---

#### TIER 3 — Host & Admin Features

---

**F-12 · Manual Host Transfer**  
Currently host migration is automatic (on disconnect). Google Meet allows the host to manually hand off hosting to any participant while remaining in the call.  
**What exists:** Auto-migration on disconnect + `host-changed` event  
**What's missing:** `transfer-host` socket event + UI action in participants panel  
**Complexity:** Low — reuse existing host migration server logic

---

**F-13 · Co-Host Assignment**  
The `ROLES.CO_HOST` is defined in `permissionService.js` and `isMeetingAdmin()` checks for it. But there is no `assign-cohost` socket event, no UI, and no way to actually assign someone as co-host.  
**Complexity:** Low — the backend permission logic already exists

---

**F-14 · Meeting Password / PIN**  
No password protection for meetings beyond the room ID. Anyone who knows the room code can join (or knock if admission is on).  
**Complexity:** Low — add `password` field to room settings, check on join

---

**F-15 · Participant Limit Enforcement**  
No maximum participant cap. The settings object has no `maxParticipants` field. Large rooms will degrade without enforcement.  
**Complexity:** Low

---

**F-16 · Meeting Duration Timer / Enforcement**  
A timer UI is shown but there is no enforcement (auto-end meeting after N minutes). Google Meet free tier enforces 60-minute limits.  
**Complexity:** Low

---

**F-17 · Waiting Room Branded Customization**  
The waiting room screen is generic. Google Meet Workspace allows custom branding (logo, background, message).  
**Complexity:** Medium

---

**F-18 · Attendance Reports / Export**  
No logging of who joined, when, and for how long. Required for enterprise/educational use.  
**Complexity:** Medium — requires persistent storage (database)

---

#### TIER 4 — Advanced Features

---

**F-19 · Multi-Pinning (Pin Multiple Participants)**  
Currently only one participant can be pinned at a time. Google Meet allows pinning multiple tiles simultaneously in a fixed layout.  
**Complexity:** Medium — change `pinnedPeerId` (single) to `pinnedPeerIds` (Set)

---

**F-20 · Spatial Audio**  
3D positional audio where participant direction/distance correlates to their position in the grid. Google Meet has begun experimenting with this.  
**Complexity:** Very High — Web Audio API panner nodes per consumer track

---

**F-21 · Low Data Mode Toggle**  
Client-side toggle to cap incoming video quality. The `NetworkMonitor` and `SubscriptionEngine` exist server-side for this, but there is no client-facing toggle and no server-side enforcement (simulcast layers never adjusted).  
**Complexity:** Low (UI toggle) + Medium (wire subscription preferences to server)

---

**F-22 · Companion Mode**  
Join the same meeting on a second device without double audio (second device is audio-only or view-only).  
**Complexity:** High — requires device linking and audio muting logic

---

**F-23 · Phone Dial-In**  
PSTN/SIP gateway integration for participants joining by phone. Requires Twilio, Vonage, or FreeSWITCH integration.  
**Complexity:** Very High — external telephony integration

---

**F-24 · Livestreaming (YouTube / RTMP)**  
Stream the meeting to external platforms via RTMP. Requires server-side media mixing/muxing.  
**Complexity:** Very High — FFmpeg or dedicated streaming service integration

---

**F-25 · Mediasoup AudioLevelObserver (Server-side VAD)**  
Google Meet uses server-side audio level detection, not client-side. Currently Vortex uses client-side Web Audio API analysis which consumes client CPU and is inaccurate when the client tab is backgrounded.  
**What's missing:** `router.createAudioLevelObserver()` in Mediasoup, event-driven speaker detection  
**Complexity:** Medium — well-documented Mediasoup API

---

#### TIER 5 — Mobile & Accessibility

---

**F-26 · Mobile Responsiveness**  
The UI is desktop-first. On narrow screens, the control bar overflows, the video grid doesn't reflow to portrait, and touch targets are too small.  
**Complexity:** Medium — CSS breakpoints, touch event handling

---

**F-27 · Mobile Landscape/Portrait Layouts**  
No adaptive layout for phone screens in portrait or landscape.  
**Complexity:** Medium

---

**F-28 · Accessibility (ARIA, Keyboard Navigation)**  
No ARIA labels on critical controls, no keyboard focus management, no screen reader support.  
**Complexity:** Medium

---

**F-29 · Dark Mode / Light Mode Toggle**  
UI is permanently dark. No user preference or system theme detection.  
**Complexity:** Low

---

## Feature Gap Summary Table

| Category | Implemented | Missing | Parity % |
|---|---|---|---|
| Core Video/Audio | 8/8 | 0 | ~100% |
| Host Controls & Moderation | 7/10 | 3 (co-host, manual transfer, password) | ~70% |
| Collaboration Features | 2/8 | 6 | ~25% |
| Media Quality & Devices | 4/8 | 4 (bg blur, noise cancel, captions, recording) | ~50% |
| Enterprise/Admin | 1/6 | 5 | ~17% |
| Mobile & Accessibility | 0/5 | 5 | 0% |
| **Total** | **22/45** | **23** | **~38%** |

---

## Recommended Implementation Priority

> [!TIP]
> Focus on features that unlock the most usage value with the least complexity first.

| Priority | Feature | Why |
|---|---|---|
| 1 | F-13 · Co-host assignment | Backend already exists; just needs 1 event + UI |
| 2 | F-12 · Manual host transfer | Reuses existing migration code |
| 3 | F-10 · Private DMs | Low effort, high social value |
| 4 | F-01 · Emoji reactions | Most visible, very low effort |
| 5 | F-14 · Meeting password | Security-critical for public deployments |
| 6 | F-21 · Low data mode | Wire existing subscription engine to client |
| 7 | F-25 · Server-side AudioLevelObserver | Improves VAD accuracy, eliminates BUG-007 |
| 8 | F-02 · Background blur | High user demand, MediaPipe available |
| 9 | F-05 · Closed captions | Web Speech API first pass is achievable |
| 10 | F-07 · Polls | High meeting value, moderate effort |

