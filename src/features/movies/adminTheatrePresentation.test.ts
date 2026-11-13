import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTheatreCardMeta } from './adminTheatrePresentation';

test('admin theatre cards expose a live edit action for both visibility states', () => {
  assert.deepEqual(getTheatreCardMeta({ is_visible: true, parent_visible: true }), {
    statusLabel: 'LIVE',
    actionLabel: 'Disable theatre',
    statusDescription: 'Visible in public movie listings',
  });
  assert.deepEqual(getTheatreCardMeta({ is_visible: false, parent_visible: true }), {
    statusLabel: 'OFF',
    actionLabel: 'Enable theatre',
    statusDescription: 'Hidden from public movie listings',
  });
});

test('a disabled source feed is shown separately from the admin visibility switch', () => {
  assert.equal(getTheatreCardMeta({ is_visible: false, parent_visible: false }).statusDescription, 'Source feed inactive; enable it upstream before publishing');
});
