import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCATION_PICKER_HISTORY_KEY,
  applyLocationPickerHistoryAction,
  buildLocationPickerHistoryState,
  isLocationPickerHistoryState,
  locationPickerHistoryAction,
} from '../src/lib/locationPickerHistory.ts';

function fakeHistory(initial = null) {
  const history = {
    state: initial,
    stack: [initial],
    index: 0,
    pushState(state) {
      this.stack = this.stack.slice(0, this.index + 1);
      this.stack.push(state);
      this.index += 1;
      this.state = state;
    },
    back() {
      if (this.index === 0) return;
      this.index -= 1;
      this.state = this.stack[this.index];
    },
    forward() {
      if (this.index >= this.stack.length - 1) return;
      this.index += 1;
      this.state = this.stack[this.index];
    },
  };
  return history;
}

test('opening the picker pushes exactly one overlay state', () => {
  const history = fakeHistory({ page: 1 });
  assert.equal(locationPickerHistoryAction(true, history.state), 'push');
  applyLocationPickerHistoryAction('push', history, '/#services');
  assert.equal(history.stack.length, 2);
  assert.equal(isLocationPickerHistoryState(history.state), true);
  assert.equal(locationPickerHistoryAction(true, history.state), 'none');
  applyLocationPickerHistoryAction('none', history, '/#services');
  assert.equal(history.stack.length, 2);
});

test('Back pops the overlay and Forward restores it', () => {
  const history = fakeHistory({ page: 1 });
  applyLocationPickerHistoryAction('push', history, '/#services');
  history.back();
  assert.equal(isLocationPickerHistoryState(history.state), false);
  assert.equal(locationPickerHistoryAction(false, history.state), 'none');
  history.forward();
  assert.equal(isLocationPickerHistoryState(history.state), true);
});

test('closing while the overlay is current consumes it with back, not a second push', () => {
  const history = fakeHistory({ page: 1 });
  applyLocationPickerHistoryAction('push', history, '/#services');
  assert.equal(locationPickerHistoryAction(false, history.state), 'back');
  applyLocationPickerHistoryAction('back', history, '/#services');
  assert.equal(history.stack[history.index], history.state);
  assert.equal(isLocationPickerHistoryState(history.state), false);
  assert.equal(history.index, 0);
});

test('repeated open/close cycles do not stack duplicate overlay entries', () => {
  const history = fakeHistory({ page: 1 });
  for (let cycle = 0; cycle < 4; cycle += 1) {
    applyLocationPickerHistoryAction(locationPickerHistoryAction(true, history.state), history, '/#services');
    assert.equal(isLocationPickerHistoryState(history.state), true);
    applyLocationPickerHistoryAction(locationPickerHistoryAction(false, history.state), history, '/#services');
    assert.equal(isLocationPickerHistoryState(history.state), false);
  }
  assert.equal(history.index, 0);
  assert.equal(history.stack.length, 2);
});

test('overlay state preserves prior history state and the marker key', () => {
  const next = buildLocationPickerHistoryState({ stay: 'airbnb' });
  assert.equal(next.stay, 'airbnb');
  assert.equal(next[LOCATION_PICKER_HISTORY_KEY], true);
  assert.equal(isLocationPickerHistoryState(null), false);
  assert.equal(isLocationPickerHistoryState({ [LOCATION_PICKER_HISTORY_KEY]: false }), false);
});
