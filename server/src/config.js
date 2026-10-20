/**
 * Validate environment variables once at startup, so a misconfigured deployment
 * fails immediately with a clear message instead of misbehaving later.
 */
export function loadConfig(env = process.env) {
  const errors = [];
  const isProd = env.NODE_ENV === 'production';
  if (!env.MONGODB_URI) errors.push('MONGODB_URI is required');
  if (!env.JWT_SECRET) errors.push('JWT_SECRET is required');
  else if (isProd && (env.JWT_SECRET.length < 32 || /change-me/i.test(env.JWT_SECRET))) {
    errors.push('JWT_SECRET must be a random string of at least 32 characters in production');
  }
  if (isProd && !env.CLIENT_URL) errors.push('CLIENT_URL is required in production (used in invite and reset links)');
  const maxMb = Number(env.MAX_RESUME_MB || 5);
  if (!(maxMb > 0 && maxMb <= 50)) errors.push('MAX_RESUME_MB must be between 1 and 50');
  if (errors.length) {
    console.error(`Invalid configuration:\n  - ${errors.join('\n  - ')}\nSee server/.env.example.`);
    process.exit(1);
  }
  return {
    env: env.NODE_ENV || 'development',
    port: Number(env.PORT || 5000),
    mongoUri: env.MONGODB_URI,
  };
}
