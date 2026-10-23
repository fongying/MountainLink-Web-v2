import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBattery, powerStatus } from './battery.ts';

test('power display never turns 101 or unknown into battery percentage/charging',()=>{
  const base={deviceId:'H01',online:true,updatedAt:1000,mx2SampleTs:1000};
  assert.equal(formatBattery({...base,battery:0,mx2BatteryRaw:0}),'0%');
  assert.equal(formatBattery({...base,battery:57,mx2BatteryRaw:57}),'57%');
  assert.equal(formatBattery({...base,battery:null,mx2BatteryRaw:101,charging:true}),'外部供電');
  assert.equal(powerStatus({...base,battery:null,mx2BatteryRaw:101,charging:true}),'外部供電，未提供百分比');
  assert.equal(formatBattery({...base,battery:null,mx2BatteryRaw:255}),'未知');
  assert.equal(powerStatus({...base,battery:null,mx2BatteryRaw:255}),'供電狀態未知');
  assert.equal(powerStatus({...base,battery:null}),'供電狀態未知');
});
