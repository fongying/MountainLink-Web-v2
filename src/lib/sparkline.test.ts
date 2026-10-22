import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finiteSegments, heartRateRange } from './sparkline.ts';

test('heart rate bounds expand with data and do not exaggerate flat readings', () => {
  assert.deepEqual(heartRateRange([72, 76, NaN]), { min: 55, max: 90 });
  const flat = heartRateRange([73, 73]);
  assert(flat.min < 73 && flat.max > 73 && flat.max - flat.min >= 30);
  const broad = heartRateRange([40, 180]);
  assert(broad.min < 40 && broad.max > 180);
  assert.deepEqual(heartRateRange([NaN]), { min: 50, max: 110 });
});

test('unknown battery samples break lines without hiding valid segments', () => {
  assert.deepEqual(finiteSegments([NaN, 91, 83, NaN, 76, 75]), [
    [{ index: 1, value: 91 }, { index: 2, value: 83 }],
    [{ index: 4, value: 76 }, { index: 5, value: 75 }]
  ]);
});
test('isolated and zero readings remain visible at their original index', () => {
  assert.deepEqual(finiteSegments([NaN, 0, NaN, 91, NaN]), [
    [{ index: 1, value: 0 }], [{ index: 3, value: 91 }]
  ]);
});
test('empty and entirely unknown series have no drawable segments', () => {
  assert.deepEqual(finiteSegments([]), []);
  assert.deepEqual(finiteSegments([NaN, Infinity, -Infinity]), []);
});
