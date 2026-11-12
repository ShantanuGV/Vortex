import crypto from 'crypto';

/**
 * Distributed State Coordinator
 * Supports Redis when configured, with an in-memory atomic coordinator fallback for zero-dependency testability.
 */
export class DistributedState {
  constructor(options = {}) {
    this.redisClient = options.redisClient || null;
    this.isRedisActive = Boolean(this.redisClient);

    // In-memory atomic store (fallback & unit testing)
    this.store = new Map(); // key -> value
    this.ttls = new Map();  // key -> expirationTimestamp
    this.locks = new Map(); // lockKey -> { token, expiresAt }
  }

  /**
   * Acquire a distributed lock atomically
   * @param {string} lockKey
   * @param {number} ttlMs
   * @returns {Promise<string|null>} Lock token if acquired, or null if contended
   */
  async acquireLock(lockKey, ttlMs = 5000) {
    const token = crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    if (this.isRedisActive) {
      try {
        const result = await this.redisClient.set(`lock:${lockKey}`, token, 'PX', ttlMs, 'NX');
        return result === 'OK' ? token : null;
      } catch (err) {
        console.warn('[DistributedState] Redis lock error, falling back to memory:', err.message);
      }
    }

    // Memory-backed atomic lock
    const existing = this.locks.get(lockKey);
    if (existing && existing.expiresAt > now) {
      return null; // Lock already held
    }

    this.locks.set(lockKey, { token, expiresAt: now + ttlMs });
    return token;
  }

  /**
   * Release a distributed lock
   * @param {string} lockKey
   * @param {string} token
   */
  async releaseLock(lockKey, token) {
    if (this.isRedisActive && typeof this.redisClient.eval === 'function') {
      try {
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await this.redisClient.eval(script, 1, `lock:${lockKey}`, token);
        return;
      } catch (err) {
        console.warn('[DistributedState] Redis releaseLock error:', err.message);
      }
    }

    const current = this.locks.get(lockKey);
    if (current && current.token === token) {
      this.locks.delete(lockKey);
    }
  }

  /**
   * Set key-value with optional TTL
   */
  async set(key, value, ttlSeconds = null) {
    const serialized = JSON.stringify(value);

    if (this.isRedisActive) {
      try {
        if (ttlSeconds) {
          await this.redisClient.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await this.redisClient.set(key, serialized);
        }
        return;
      } catch (err) {
        console.warn('[DistributedState] Redis set error:', err.message);
      }
    }

    this.store.set(key, serialized);
    if (ttlSeconds) {
      this.ttls.set(key, Date.now() + ttlSeconds * 1000);
    } else {
      this.ttls.delete(key);
    }
  }

  /**
   * Get key-value
   */
  async get(key) {
    if (this.isRedisActive) {
      try {
        const data = await this.redisClient.get(key);
        return data ? JSON.parse(data) : null;
      } catch (err) {
        console.warn('[DistributedState] Redis get error:', err.message);
      }
    }

    // Check expiration
    const expiry = this.ttls.get(key);
    if (expiry && expiry < Date.now()) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }

    const raw = this.store.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * Delete key
   */
  async del(key) {
    if (this.isRedisActive) {
      try {
        await this.redisClient.del(key);
        return;
      } catch (err) {
        console.warn('[DistributedState] Redis del error:', err.message);
      }
    }

    this.store.delete(key);
    this.ttls.delete(key);
  }

  /**
   * Add member to set
   */
  async sadd(setKey, member) {
    if (this.isRedisActive) {
      try {
        await this.redisClient.sadd(setKey, member);
        return;
      } catch (err) {
        console.warn('[DistributedState] Redis sadd error:', err.message);
      }
    }

    let set = this.store.get(setKey);
    if (!set || !(set instanceof Set)) {
      set = new Set();
      this.store.set(setKey, set);
    }
    set.add(member);
  }

  /**
   * Remove member from set
   */
  async srem(setKey, member) {
    if (this.isRedisActive) {
      try {
        await this.redisClient.srem(setKey, member);
        return;
      } catch (err) {
        console.warn('[DistributedState] Redis srem error:', err.message);
      }
    }

    const set = this.store.get(setKey);
    if (set && set instanceof Set) {
      set.delete(member);
    }
  }

  /**
   * Get all members of set
   */
  async smembers(setKey) {
    if (this.isRedisActive) {
      try {
        return await this.redisClient.smembers(setKey);
      } catch (err) {
        console.warn('[DistributedState] Redis smembers error:', err.message);
      }
    }

    const set = this.store.get(setKey);
    return set && set instanceof Set ? Array.from(set) : [];
  }
}
