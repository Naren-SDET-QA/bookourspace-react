import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('Android manifest registers the native Google OAuth callback', () => {
  const xml = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(xml, /android:scheme="com.bookourspace.app"/);
  assert.match(xml, /android:host="auth"/);
  assert.match(xml, /android:path="\/callback"/);
  assert.match(xml, /android:launchMode="singleTask"/);
});

test('iOS Info.plist registers the native Google OAuth URL scheme', () => {
  const plist = fs.readFileSync(path.join(root, 'ios/App/App/Info.plist'), 'utf8');
  assert.match(plist, /<string>com.bookourspace.app<\/string>/);
});

test('Capacitor app id matches the native OAuth scheme', () => {
  const config = fs.readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8');
  assert.match(config, /appId:\s*'com.bookourspace.app'/);
});
