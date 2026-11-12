import os from 'os';

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  rateLimitPerSec: parseInt(process.env.RATE_LIMIT_PER_SEC, 10) || 50,
  
  // Redis state coordinator
  redisUrl: process.env.REDIS_URL || null,
  
  // Mediasoup C++ worker configuration
  mediasoup: {
    workerPoolSize: parseInt(process.env.MEDIASOUP_WORKER_POOL_SIZE, 10) || Math.min(os.cpus().length, 4),
    numWorkers: parseInt(process.env.MEDIASOUP_WORKERS, 10) || Math.max(1, Math.min(os.cpus().length, 4)),
    rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT, 10) || 40000,
    rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT, 10) || 49999,
    listenIp: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
    announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null,
    
    // Codecs supported by room routers
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1
        }
      }
    ],

    // WebRTC Transport settings
    webRtcTransport: {
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 300000,
      maxSctpMessageSize: 262144
    }
  },

  // Meeting defaults
  meeting: {
    defaultMode: 'conference', // 'conference' | 'webinar'
    maxVideoConsumersPerPeer: 6,
    gracePeriodMs: 30000 // 30-second session grace period for reconnection
  }
};
