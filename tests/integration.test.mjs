import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';
import http from 'http';

const SERVER_URL = 'http://localhost:5000';
const ROOM_ID = 'sfu-test-' + Math.random().toString(36).substr(2, 6);

function runTests() {
  return new Promise((resolve, reject) => {
    console.log(`\n[Test] Starting Mediasoup SFU & Industry-Grade Test Suite against ${SERVER_URL} on room "${ROOM_ID}"...\n`);

    // 1. Test /healthz and /readyz
    http.get(`${SERVER_URL}/healthz`, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`/healthz failed with status ${res.statusCode}`));
      }
      console.log('✅ PASS: /healthz probe returned 200 OK');

      http.get(`${SERVER_URL}/readyz`, (res2) => {
        if (res2.statusCode !== 200) {
          return reject(new Error(`/readyz failed with status ${res2.statusCode}`));
        }
        console.log('✅ PASS: /readyz readiness probe returned 200 OK');

        // 2. Connect Host Socket
        const hostSocket = io(SERVER_URL, { transports: ['websocket'] });
        let savedHostSecret = null;

        hostSocket.on('connect', () => {
          console.log('✅ PASS: Host socket connected to signaling engine');
          hostSocket.emit('join-room', {
            roomId: ROOM_ID,
            userName: 'PrimaryHost'
          });
        });

        hostSocket.on('room-snapshot', async (snapshot) => {
          if (!snapshot.isHost || !snapshot.hostSecret) {
            return reject(new Error('Host did not receive isHost or cryptographic hostSecret!'));
          }
          savedHostSecret = snapshot.hostSecret;
          console.log(`✅ PASS: Host granted admin privileges and issued cryptographic token: ${savedHostSecret.slice(0, 8)}...`);

          // 3. Test Mediasoup SFU Signaling: getRouterRtpCapabilities
          try {
            console.log('\n--- Testing Mediasoup SFU Pipeline ---');
            const response = await new Promise((res, rej) => {
              hostSocket.emit('getRouterRtpCapabilities', {}, (resp) => {
                if (resp && resp.error) rej(new Error(resp.error));
                else res(resp);
              });
            });

            const rtpCaps = response && response.rtpCapabilities;
            if (!rtpCaps || !rtpCaps.codecs || rtpCaps.codecs.length === 0) {
              return reject(new Error('getRouterRtpCapabilities returned invalid codecs: ' + JSON.stringify(response)));
            }
            console.log(`✅ PASS: SFU Router RTP capabilities received (${rtpCaps.codecs.length} codecs negotiated: ${rtpCaps.codecs.map(c => c.mimeType).join(', ')})`);

            // 4. Test Mediasoup SFU Signaling: createWebRtcTransport (send direction)
            const sendTransportData = await new Promise((res, rej) => {
              hostSocket.emit('createWebRtcTransport', { direction: 'send' }, (response) => {
                if (response.error) rej(new Error(response.error));
                else res(response);
              });
            });

            if (!sendTransportData.id || !sendTransportData.iceParameters || !sendTransportData.dtlsParameters) {
              return reject(new Error('createWebRtcTransport send failed'));
            }
            console.log(`✅ PASS: Send WebRtcTransport allocated (ID: ${sendTransportData.id.slice(0, 8)}..., ICE candidates: ${sendTransportData.iceCandidates.length})`);

            // 5. Test Mediasoup SFU Signaling: createWebRtcTransport (recv direction)
            const recvTransportData = await new Promise((res, rej) => {
              hostSocket.emit('createWebRtcTransport', { direction: 'recv' }, (response) => {
                if (response.error) rej(new Error(response.error));
                else res(response);
              });
            });

            if (!recvTransportData.id) {
              return reject(new Error('createWebRtcTransport recv failed'));
            }
            console.log(`✅ PASS: Recv WebRtcTransport allocated (ID: ${recvTransportData.id.slice(0, 8)}...)`);

            // 6. Test Mediasoup SFU Signaling: connectWebRtcTransport
            const mockDtlsParameters = {
              role: 'client',
              fingerprints: [
                {
                  algorithm: 'sha-256',
                  value: '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF'
                }
              ]
            };

            await new Promise((res, rej) => {
              hostSocket.emit('connectWebRtcTransport', {
                transportId: sendTransportData.id,
                dtlsParameters: mockDtlsParameters
              }, (response) => {
                if (response && response.error) rej(new Error(response.error));
                else res(response);
              });
            });
            console.log('✅ PASS: WebRtcTransport DTLS parameters successfully negotiated with SFU Worker');

            // 7. Test Chat Sanitization
            hostSocket.emit('send-chat', {
              message: `<script>alert('xss')</script><b>Hello Vortex Mediasoup SFU</b>`
            });
          } catch (sfuErr) {
            return reject(sfuErr);
          }
        });

        hostSocket.on('new-chat-message', (chat) => {
          if (chat.message.includes('<script>')) {
            return reject(new Error('XSS injection not sanitized! Received: ' + chat.message));
          }
          console.log('✅ PASS: Chat payload sanitized against XSS:', chat.message);

          // 8. Test Anti-flood Rate-Limiter
          let receivedRateLimitWarning = false;
          hostSocket.on('rate-limit-warning', () => {
            if (!receivedRateLimitWarning) {
              receivedRateLimitWarning = true;
              console.log('✅ PASS: Anti-flood rate limiter intercepted excessive socket calls');
              testHostReconnection();
            }
          });

          // Flood 65 speaking-level events
          for (let i = 0; i < 65; i++) {
            hostSocket.emit('speaking-level', { level: 0.8 });
          }

          function testHostReconnection() {
            hostSocket.disconnect();
            console.log('... Host disconnected. Testing session restoration with token ...');

            setTimeout(() => {
              const reconnectedHost = io(SERVER_URL, { transports: ['websocket'] });
              reconnectedHost.on('connect', () => {
                reconnectedHost.emit('join-room', {
                  roomId: ROOM_ID,
                  userName: 'PrimaryHost',
                  hostSecret: savedHostSecret
                });
              });

              reconnectedHost.on('room-snapshot', (snap) => {
                if (!snap.isHost) {
                  return reject(new Error('Host session was NOT restored with valid token!'));
                }
                console.log('✅ PASS: Host session seamlessly restored via cryptographic hostSecret without demotion!');
                reconnectedHost.disconnect();
                resolve();
              });
            }, 300);
          }
        });
      });
    });
  });
}

runTests()
  .then(() => {
    console.log('\n🎉 ALL MEDIASOUP SFU & INDUSTRY-GRADE TESTS PASSED CLEANLY!\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
