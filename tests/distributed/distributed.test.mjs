import assert from 'assert';
import { WorkerPool } from '../../server/media/workerPool.js';
import { PipeManager } from '../../server/media/pipeManager.js';
import { DistributedState } from '../../server/state/distributedState.js';
import { config } from '../../server/config/index.js';

async function runDistributedTests() {
  console.log(`\n=============================================================`);
  console.log(`🌐 Testing Distributed Media Fabric & Cross-Worker Pipe Routing`);
  console.log(`=============================================================\n`);

  // 1. Initialize WorkerPool with multiple workers
  console.log('[1/3] Spawning multi-worker pool (2 C++ workers)...');
  const pool = new WorkerPool({ numWorkers: 2, rtcMinPort: 42000, rtcMaxPort: 42999 });
  await pool.init();

  // Create Router A on Worker 0 and Router B on Worker 1
  const worker0 = pool.workers[0].worker;
  const worker1 = pool.workers[1].worker;

  const routerA = await worker0.createRouter({ mediaCodecs: config.mediasoup.mediaCodecs });
  const routerB = await worker1.createRouter({ mediaCodecs: config.mediasoup.mediaCodecs });

  console.log(`✅ Router A created on Worker [0] (PID: ${worker0.pid}, Router: ${routerA.id})`);
  console.log(`✅ Router B created on Worker [1] (PID: ${worker1.pid}, Router: ${routerB.id})`);

  // 2. Produce on Router A and Pipe to Router B
  console.log('\n[2/3] Testing Inter-Worker PipeTransport Routing...');
  const pipeManager = new PipeManager();

  // Create direct transport on Router A to simulate upstream producer
  const directTransportA = await routerA.createDirectTransport();
  const producerA = await directTransportA.produce({
    kind: 'audio',
    rtpParameters: {
      mid: '0',
      codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000, channels: 2 }],
      encodings: [{ ssrc: 55555555 }]
    }
  });
  console.log(`✅ Producer created on Router A (ID: ${producerA.id})`);

  // Pipe from Router A on Worker 0 to Router B on Worker 1
  const pipeResult = await pipeManager.pipeProducerLocal({
    sourceRouter: routerA,
    targetRouter: routerB,
    producerId: producerA.id
  });

  assert.strictEqual(pipeResult.piped, true, 'Producer must be piped across distinct routers');
  assert.ok(pipeResult.pipeConsumer, 'Pipe consumer must be created on source router');
  assert.ok(pipeResult.pipeProducer, 'Pipe producer must be created on target router');
  console.log(`✅ Inter-Worker Pipe Established! (Pipe Consumer: ${pipeResult.pipeConsumer.id}, Pipe Producer: ${pipeResult.pipeProducer.id})`);

  // Check that Router B can now consume this piped producer
  assert.strictEqual(
    routerB.canConsume({
      producerId: pipeResult.pipeProducer.id,
      rtpCapabilities: {
        codecs: [{ mimeType: 'audio/opus', kind: 'audio', preferredPayloadType: 111, clockRate: 48000, channels: 2, parameters: {}, rtcpFeedback: [] }],
        headerExtensions: []
      }
    }),
    true,
    'Router B on Worker 1 must be able to consume the piped producer from Worker 0'
  );
  console.log('✅ Router B successfully verified capability to consume piped audio track.');

  // 3. Test Cross-Host PipeTransport Negotiation
  console.log('\n[3/3] Testing Cross-Host PipeTransport Tuple Negotiation...');
  const hostPipeA = await pipeManager.createCrossHostPipeTransport(routerA, { listenIp: '127.0.0.1' });
  const hostPipeB = await pipeManager.createCrossHostPipeTransport(routerB, { listenIp: '127.0.0.1' });

  assert.ok(hostPipeA.port > 0, 'Host Pipe A port must be assigned');
  assert.ok(hostPipeB.port > 0, 'Host Pipe B port must be assigned');
  console.log(`✅ Host Pipe A port: ${hostPipeA.port}, Host Pipe B port: ${hostPipeB.port}`);

  await hostPipeA.transport.connect({ ip: '127.0.0.1', port: hostPipeB.port });
  await hostPipeB.transport.connect({ ip: '127.0.0.1', port: hostPipeA.port });
  console.log('✅ Cross-Host PipeTransport DTLS/RTP tuples successfully connected.');

  // Clean up
  directTransportA.close();
  hostPipeA.transport.close();
  hostPipeB.transport.close();
  routerA.close();
  routerB.close();
  pool.close();

  console.log('\n🎉 ALL DISTRIBUTED & CROSS-WORKER PIPE TESTS PASSED!\n');
}

runDistributedTests().catch((err) => {
  console.error('\n❌ DISTRIBUTED TEST FAILED:', err);
  process.exit(1);
});
