import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './risk-engine';
const sample={hours:1,eligible:true,attention:10,warning:20,severe:30,readings:[{id:'fixture',mm:20,observedAt:'2026-01-01T00:00:00Z'}]};
test('synthetic thresholds: boundary is inclusive',()=>assert.equal(evaluate(sample).level,'warning'));
test('missing readings never imply normal',()=>assert.equal(evaluate({...sample,readings:[]}).level,'unknown'));
test('ineligible station never implies normal',()=>assert.equal(evaluate({...sample,eligible:false}).level,'unknown'));
test('zero observed is distinct from missing',()=>assert.equal(evaluate({...sample,readings:[{...sample.readings[0]!,mm:0}]}).level,'normal'));
