const buckets = new Map();

function consumeToken(key, options = {}) {
  const capacity = Number(options.capacity || 30);
  const refillPerSecond = Number(options.refillPerSecond || 0.5);
  const now = Date.now();
  const previous = buckets.get(key) || { tokens: capacity, updatedAt: now };
  const elapsedSeconds = Math.max(0, now - previous.updatedAt) / 1000;
  const tokens = Math.min(capacity, previous.tokens + elapsedSeconds * refillPerSecond);

  if (tokens < 1) {
    const retryAfterSeconds = Math.ceil((1 - tokens) / refillPerSecond);
    buckets.set(key, { tokens, updatedAt: now });
    return { allowed: false, retryAfterSeconds };
  }

  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return { allowed: true, retryAfterSeconds: 0 };
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function enforceRateLimit(req, userId, options) {
  const ipResult = consumeToken(`ip:${getClientIp(req)}`, options);
  const userResult = userId ? consumeToken(`user:${userId}`, options) : { allowed: true, retryAfterSeconds: 0 };
  if (!ipResult.allowed || !userResult.allowed) {
    const retryAfterSeconds = Math.max(ipResult.retryAfterSeconds, userResult.retryAfterSeconds);
    const error = new Error('Too many requests. Please try again later.');
    error.statusCode = 429;
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }
}

module.exports = { enforceRateLimit };
