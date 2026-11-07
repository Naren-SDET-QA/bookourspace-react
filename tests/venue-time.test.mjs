import test from 'node:test';
import assert from 'node:assert/strict';
import { venueDateTimeLabel, venueWallTimeCandidates } from '../src/lib/venueTime.ts';

test('venue-local wall time conversion rejects DST gaps and exposes repeated fall-back times',()=>{
  assert.deepEqual(venueWallTimeCandidates({date:'2027-03-14',time:'02:30'},'America/New_York'),[]);
  const repeated=venueWallTimeCandidates({date:'2027-11-07',time:'01:30'},'America/New_York');
  assert.equal(repeated.length,2);
  assert.deepEqual(repeated.map(value=>value.toISOString()),['2027-11-07T05:30:00.000Z','2027-11-07T06:30:00.000Z']);
});

test('venue-local wall time conversion is independent of device timezone',()=>{
  const values=venueWallTimeCandidates({date:'2027-01-12',time:'16:45'},'Asia/Kolkata');
  assert.equal(values.length,1);
  assert.equal(values[0].toISOString(),'2027-01-12T11:15:00.000Z');
});

test('venue-local date labels include a timezone abbreviation',()=>{
  assert.match(venueDateTimeLabel('2027-01-12T11:15:00.000Z','Asia/Kolkata'),/IST/);
});
