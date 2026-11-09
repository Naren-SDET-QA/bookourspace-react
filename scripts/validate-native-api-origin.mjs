#!/usr/bin/env node
/**
 * Validates VITE_NATIVE_API_ORIGIN without printing the value.
 * Exit 0 = usable origin; 2 = missing (fail-closed native); 3 = rejected.
 */
import { routeNativeApiRequest } from '../src/mobile/nativeApiTransport.ts';

const raw = String(process.env.VITE_NATIVE_API_ORIGIN || '').trim();
if (!raw) {
  console.log('BLOCKED: VITE_NATIVE_API_ORIGIN is empty; native /api calls fail closed.');
  process.exit(2);
}

try {
  const [url] = routeNativeApiRequest('/api/health', undefined, {
    native: true,
    backendOrigin: raw,
    isDev: false,
    currentOrigin: 'capacitor://localhost',
  });
  const origin = new URL(String(url)).origin;
  const local = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(new URL(origin).hostname);
  console.log(local
    ? 'PASS: loopback native origin accepted for device debugging (not a production origin).'
    : 'PASS: HTTPS native API origin accepted.');
  process.exit(0);
} catch (error) {
  console.log(`FAIL: ${error instanceof Error ? error.message : 'invalid native API origin'}`);
  process.exit(3);
}
