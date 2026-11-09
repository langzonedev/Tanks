import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIDTH, HEIGHT, MAX_MOVE, MAX_TURNS,
  createMatch, previewTank, predictShot, resolveTurn, replayMatch,
} from '../engine.js';

const configuration = { seed: 418021, map: 'badlands', players: ['Moss', 'Ember'] };
const miss = { move: 0, angle: 90, power: 100, weapon: 'shell' };
const shield = { ...miss, weapon: 'shield' };
const newMatch = () => createMatch(configuration);

const away = state => ({
  ...miss,
  angle: state.players[state.active].x < WIDTH / 2 ? 180 : 0,
});

test('a seed reproduces a bounded battlefield and deploys each tank on its surface', () => {
  const state = newMatch();
  assert.deepEqual(state, newMatch());
  assert.equal(state.terrain.length, WIDTH + 1);
  assert.ok(state.terrain.every(y => Number.isFinite(y) && y >= 0 && y <= HEIGHT));
  assert.ok(state.players[0].x < state.players[1].x);
  for (const tank of state.players) {
    assert.ok(tank.x >= 0 && tank.x <= WIDTH);
    assert.ok(tank.y <= state.terrain[Math.round(tank.x)]);
    assert.equal(tank.health, 100);
  }
});

test('aim preview is read-only and agrees with the resolved projectile', () => {
  const state = newMatch();
  const before = structuredClone(state);
  const command = { move: 37, angle: 48, power: 68, weapon: 'scatter' };
  const aim = predictShot(state, command);
  const result = resolveTurn(state, command);
  assert.deepEqual(state, before);
  assert.deepEqual(aim.paths, result.paths);
  assert.deepEqual(aim.impacts, result.impacts);
  assert.equal(aim.paths.length, 4); // Carrier path and three cluster paths.
  assert.ok(aim.paths.every(path => path.length > 1));
});

test('movement preview obeys the move allowance and does not mutate match state', () => {
  const state = newMatch();
  const original = structuredClone(state);
  for (const delta of [-MAX_MOVE, MAX_MOVE]) {
    const moved = previewTank(state, delta);
    assert.ok(Math.abs(moved.x - state.players[state.active].x) <= MAX_MOVE);
    assert.ok(moved.x >= 0 && moved.x <= WIDTH);
  }
  assert.deepEqual(state, original);
});

test('one command spends one limited weapon and hands the turn to the next player', () => {
  const state = newMatch();
  const result = resolveTurn(state, shield);
  const next = result.state;
  assert.equal(next.active, 1);
  assert.equal(next.turn, 2);
  assert.equal(next.players[0].ammo.shield, 0);
  assert.equal(next.players[0].shield, true);
  assert.equal(next.players[1].ammo.shield, 1);
  assert.equal(next.players[1].shield, false);
  assert.deepEqual(next.history, [shield]);
  const backToFirst = resolveTurn(next, away(next)).state;
  assert.equal(backToFirst.active, 0);
  assert.throws(() => resolveTurn(backToFirst, shield));
});

test('turn replay reconstructs health, terrain, ammo, wind and the next player exactly', () => {
  const first = newMatch();
  const commands = [
    shield,
    { move: -30, angle: 135, power: 70, weapon: 'digger' },
    { move: 34, angle: 46, power: 57, weapon: 'heavy' },
  ];
  const played = commands.reduce((state, command) => resolveTurn(state, command).state, first);
  assert.deepEqual(replayMatch(configuration, commands), played);
});

test('replay rejects out-of-range, non-numeric and unknown weapon commands', () => {
  for (const bad of [
    null, {}, { ...miss, move: MAX_MOVE + 1 }, { ...miss, move: 1.5 },
    { ...miss, power: '40' }, { ...miss, power: NaN }, { ...miss, power: Infinity },
    { ...miss, power: 0 }, { ...miss, angle: -1 }, { ...miss, angle: 181 },
    { ...miss, weapon: 'constructor' },
  ]) {
    assert.throws(() => replayMatch(configuration, [bad]), JSON.stringify(bad));
  }
  assert.throws(() => replayMatch(configuration, Array(MAX_TURNS + 1).fill(miss)));
});

test('a match eventually ends when every shot misses and refuses further turns', () => {
  let state = newMatch();
  for (let index = 0; state.winner === null && index < MAX_TURNS; index++) {
    state = resolveTurn(state, away(state)).state;
  }
  assert.notEqual(state.winner, null);
  assert.ok(state.history.length <= MAX_TURNS);
  assert.throws(() => resolveTurn(state, away(state)));
  assert.throws(() => replayMatch(configuration, [...state.history, away(state)]));
});

test('a direct hit removes terrain, and an equipped shield halves only the next blast', () => {
  const state = newMatch();
  const command = { move: 0, angle: 25, power: 93, weapon: 'heavy' };
  const regular = resolveTurn(state, command);
  assert.deepEqual(regular.damage, [{ id: 1, amount: 76 }]);
  assert.ok(regular.state.terrain.some((y, x) => y > state.terrain[x]));
  assert.ok(regular.state.terrain.every((y, x) => y >= state.terrain[x]));

  const equipped = structuredClone(state);
  equipped.players[1].shield = true;
  const absorbed = resolveTurn(equipped, command);
  assert.deepEqual(absorbed.damage, [{ id: 1, amount: 38 }]);
  assert.equal(absorbed.state.players[1].shield, false);
  assert.equal(equipped.players[1].shield, true);
});

test('turn rotation skips an eliminated player in a three-player match', () => {
  const state = createMatch({ ...configuration, players: [...configuration.players, 'Slate'] });
  state.players[1].health = 56;
  const { state: next } = resolveTurn(state, { move: 0, angle: 29, power: 52, weapon: 'shell' });
  assert.equal(next.players[1].health, 0);
  assert.equal(next.winner, null);
  assert.equal(next.active, 2);
});

test('replay derives state from allowed commands and rejects malformed match settings', () => {
  const forged = { ...shield, health: 1_000, winner: 0, active: 0, players: [] };
  assert.deepEqual(replayMatch(configuration, [forged]), replayMatch(configuration, [shield]));
  for (const config of [
    { ...configuration, seed: -1 }, { ...configuration, seed: '418021' },
    { ...configuration, map: 'constructor' }, { ...configuration, players: ['Solo'] },
    { ...configuration, players: ['Valid', '\u202eSpoof'] },
    { ...configuration, players: ['Valid', 'a'.repeat(25)] },
  ]) assert.throws(() => replayMatch(config, []));
});
