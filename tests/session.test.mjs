import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, MAX_TURNS, resolveTurn } from '../engine.js';
import { decodeTurn, encodeTurn, makeConfig } from '../session.js';

const toToken = json => Buffer.from(JSON.stringify(json)).toString('base64url');
const base = [1, 420, 'ridge', 2, []];

test('a shared shot replays the exact position and changes the active tank on a clean client', () => {
  const match = createMatch(makeConfig('ridge', 2, 420));
  const { state: played } = resolveTurn(match, { move: 45, angle: 53, power: 69, weapon: 'heavy' });
  const code = encodeTurn(played);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeTurn(code), played);
  assert.equal(decodeTurn(code).active, 1);
});

test('the same format restores saved four-player matches through multiple turns', () => {
  let state = createMatch(makeConfig('basin', 4, 0xffffffff));
  for (const angle of [180, 180, 0]) {
    state = resolveTurn(state, { move: 0, angle, power: 100, weapon: 'shell' }).state;
  }
  assert.deepEqual(decodeTurn(encodeTurn(state)), state);
  assert.equal(state.active, 3);
});

test('malformed, oversized, unversioned and forged match envelopes are rejected', () => {
  for (const input of ['', '?bad', 'A'.repeat(10001), 'A', toToken(null), toToken({ seed: 420 })]) {
    assert.throws(() => decodeTurn(input));
  }
  for (const payload of [
    [3, ...base.slice(1)], [1, -1, ...base.slice(2)], [1, '420', ...base.slice(2)],
    [1, 420, 'constructor', 2, []], [1, 420, 'ridge', 5, []], [...base, { winner: 0 }],
    [1, 420, 'ridge', 2, Array(MAX_TURNS + 1).fill([0, 0, 100, 0])],
  ]) assert.throws(() => decodeTurn(toToken(payload)));
});

test('invalid command tuples and illegally reused charges cannot enter a match', () => {
  for (const turns of [
    [[0, 0, 100]], [[0, 0, 100, 99]], [[0, 0, 100, '0']], [[91, 0, 100, 0]],
    [[0, 181, 100, 0]], [[0, 0, 9, 0]], [[0, 0, 100, 0, { health: 500 }]],
    [[0, 0, 100, 4], [0, 0, 100, 4], [0, 0, 100, 4]],
  ]) assert.throws(() => decodeTurn(toToken([...base.slice(0, -1), turns])));
});
