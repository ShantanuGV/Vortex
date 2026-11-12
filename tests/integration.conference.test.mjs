import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';
import assert from 'assert';

const SERVER_URL = 'http://localhost:5000';
const ROOM_ID = 'conf-test-' + Math.random().toString(36).substr(2, 6);

async function runConferenceTest() {
  console.log(`\n=============================================================`);
  console.log(`👥 Testing Multi-Participant Group Conference Routing on "${ROOM_ID}"`);
  console.log(`=============================================================\n`);

  // Connect Client A (Host)
  const clientA = io(SERVER_URL, { transports: ['websocket'] });
  let clientASocketId = null;

  await new Promise((resolve) => {
    clientA.on('connect', () => {
      clientASocketId = clientA.id;
      console.log(`✅ Client A connected (Host candidate: ${clientASocketId})`);
      clientA.emit('join-room', {
        roomId: ROOM_ID,
        userName: 'HostAlice'
      });
      clientA.on('room-snapshot', (snap) => {
        assert.strictEqual(snap.isHost, true, 'Client A must be host');
        // Set room mode to conference so all participants see and consume each other
        clientA.emit('update-room-settings', {
          settings: {
            hostAdmission: false, // Direct admission for test
            mode: 'conference'
          }
        });
        console.log('✅ Client A snapshot received and room configured for CONFERENCE mode');
        resolve();
      });
    });
  });

  // Client A creates send transport & produces audio
  const clientATransport = await new Promise((resolve, reject) => {
    clientA.emit('createWebRtcTransport', { direction: 'send' }, (res) => {
      if (res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
  console.log(`✅ Client A Send WebRtcTransport created: ${clientATransport.id}`);

  // Connect transport with mock DTLS
  await new Promise((resolve, reject) => {
    clientA.emit('connectWebRtcTransport', {
      transportId: clientATransport.id,
      dtlsParameters: {
        role: 'client',
        fingerprints: [{ algorithm: 'sha-256', value: '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF' }]
      }
    }, (res) => {
      if (res?.error) reject(new Error(res.error));
      else resolve();
    });
  });

  // Client A produces audio
  const clientAProducer = await new Promise((resolve, reject) => {
    clientA.emit('produce', {
      transportId: clientATransport.id,
      kind: 'audio',
      rtpParameters: {
        mid: '0',
        codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000, channels: 2 }],
        encodings: [{ ssrc: 11111111 }]
      },
      appData: { mediaType: 'mic' }
    }, (res) => {
      if (res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
  console.log(`✅ Client A produced audio track: ${clientAProducer.id}`);

  // Connect Client B (Guest 1)
  const clientB = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((resolve) => {
    clientB.on('connect', () => {
      console.log(`✅ Client B connected: ${clientB.id}`);
      clientB.emit('join-room', {
        roomId: ROOM_ID,
        userName: 'GuestBob'
      });
      clientB.on('room-snapshot', (snap) => {
        assert.strictEqual(snap.isHost, false, 'Client B is guest');
        assert.ok(snap.existingProducers.some((p) => p.producerId === clientAProducer.id), 'Client B should see Client A audio producer');
        console.log(`✅ Client B received snapshot with ${snap.existingProducers.length} existing producers`);
        resolve();
      });
    });
  });

  // Client B creates send transport & produces video
  const clientBTransport = await new Promise((resolve, reject) => {
    clientB.emit('createWebRtcTransport', { direction: 'send' }, (res) => {
      if (res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });

  await new Promise((resolve) => {
    clientB.emit('connectWebRtcTransport', {
      transportId: clientBTransport.id,
      dtlsParameters: {
        role: 'client',
        fingerprints: [{ algorithm: 'sha-256', value: '11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00' }]
      }
    }, () => resolve());
  });

  // Client B produces video
  const clientBProducer = await new Promise((resolve, reject) => {
    clientB.emit('produce', {
      transportId: clientBTransport.id,
      kind: 'video',
      rtpParameters: {
        mid: '0',
        codecs: [{ mimeType: 'video/VP8', payloadType: 96, clockRate: 90000 }],
        encodings: [{ ssrc: 22222222 }]
      },
      appData: { mediaType: 'camera' }
    }, (res) => {
      if (res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
  console.log(`✅ Client B produced video track: ${clientBProducer.id}`);

  // Connect Client C (Guest 2)
  const clientC = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((resolve) => {
    clientC.on('connect', () => {
      console.log(`✅ Client C connected: ${clientC.id}`);
      clientC.emit('join-room', {
        roomId: ROOM_ID,
        userName: 'GuestCharlie'
      });
      clientC.on('room-snapshot', (snap) => {
        assert.strictEqual(snap.isHost, false);
        // In CONFERENCE mode, Client C sees both Client A (host) AND Client B (guest) producers!
        const seenProducers = snap.existingProducers.map((p) => p.producerId);
        assert.ok(seenProducers.includes(clientAProducer.id), 'Client C must see Client A producer');
        assert.ok(seenProducers.includes(clientBProducer.id), 'Client C must see Client B (guest-to-guest) producer in conference mode');
        console.log(`✅ Client C confirmed reception of Client B's guest producer in conference mode!`);
        resolve();
      });
    });
  });

  // Client C creates recv transport
  const clientCTransport = await new Promise((resolve, reject) => {
    clientC.emit('createWebRtcTransport', { direction: 'recv' }, (res) => {
      if (res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });

  await new Promise((resolve) => {
    clientC.emit('connectWebRtcTransport', {
      transportId: clientCTransport.id,
      dtlsParameters: {
        role: 'client',
        fingerprints: [{ algorithm: 'sha-256', value: '22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:11' }]
      }
    }, () => resolve());
  });

  // Client C consumes Client B's video track!
  const consumerParams = await new Promise((resolve, reject) => {
    clientC.emit('consume', {
      transportId: clientCTransport.id,
      producerId: clientBProducer.id,
      rtpCapabilities: {
        codecs: [{ mimeType: 'video/VP8', kind: 'video', preferredPayloadType: 96, clockRate: 90000, parameters: {}, rtcpFeedback: [] }],
        headerExtensions: []
      }
    }, (res) => {
      if (res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
  assert.ok(consumerParams.id, 'Consumer ID must be returned');
  console.log(`✅ Client C successfully consumed Client B's video stream (Consumer ID: ${consumerParams.id})`);

  // Verify Unauthorized Access Rejection:
  // Client C tries to connect using Client A's transportId (Transport Spoofing)
  const spoofAttempt = await new Promise((resolve) => {
    clientC.emit('connectWebRtcTransport', {
      transportId: clientATransport.id, // Host transport
      dtlsParameters: {}
    }, (res) => resolve(res));
  });
  assert.ok(spoofAttempt?.error, 'Server must reject transport spoofing attempt');
  console.log(`✅ Security Verified: Unauthorized transport spoofing rejected with: "${spoofAttempt.error}"`);

  // Cleanup connections
  clientA.disconnect();
  clientB.disconnect();
  clientC.disconnect();

  console.log('\n🎉 ALL GROUP CONFERENCE ROUTING & SECURITY TESTS PASSED!\n');
}

runConferenceTest().catch((err) => {
  console.error('\n❌ CONFERENCE TEST FAILED:', err);
  process.exit(1);
});
