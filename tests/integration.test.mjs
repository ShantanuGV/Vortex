import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';
import http from 'http';

const SERVER_URL = 'http://localhost:5000';
const ROOM_ID = 'ind-test-' + Math.random().toString(36).substr(2, 6);

function runTests() {
  return new Promise((resolve, reject) => {
    console.log(`\n[Test] Starting Industry-Grade Test Suite against ${SERVER_URL} on room "${ROOM_ID}"...\n`);

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

        hostSocket.on('room-snapshot', (snapshot) => {
          if (!snapshot.isHost || !snapshot.hostSecret) {
            return reject(new Error('Host did not receive isHost or cryptographic hostSecret!'));
          }
          savedHostSecret = snapshot.hostSecret;
          console.log(`✅ PASS: Host granted admin privileges and issued cryptographic token: ${savedHostSecret.slice(0, 8)}...`);

          // 3. Test Chat Sanitization
          hostSocket.emit('send-chat', {
            message: `<script>alert('xss')</script><b>Hello Vortex</b>`
          });
        });

        hostSocket.on('new-chat-message', (chat) => {
          if (chat.message.includes('<script>')) {
            return reject(new Error('XSS injection not sanitized! Received: ' + chat.message));
          }
          console.log('✅ PASS: Chat payload sanitized against XSS:', chat.message);

          // 4. Test Rate-Limiter
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
            // Disconnect host
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
                console.log('✅ PASS: Host session seamlessly restored via cryptographic hostSecret without being demoted or locked out!');
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
    console.log('\n🎉 ALL INDUSTRY-GRADE TESTS PASSED CLEANLY!\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
