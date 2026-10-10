import 'dotenv/config';
/** Read before module decorators select providers; ConfigModule validates the same value. */
export function workersEnabled() {
  return (process.env.APP_MODE ?? 'combined').trim() !== 'api';
}
export function apiEnabled() {
  return (process.env.APP_MODE ?? 'combined').trim() !== 'worker';
}
