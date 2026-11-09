import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MAPS, WIDTH} from '../engine.js';
import {
  createFrontline, frontlineMoveLimit, frontlineWeapons,
  previewFrontline, resolveFrontline, replayFrontline,
} from '../frontline.js';
import {decodeTurn, encodeTurn, makeConfig} from '../session.js';

const config = makeConfig('badlands', 2, 418021);
const initial = () => createFrontline(config);
const command = (unit, options = {}) => ({
  unit, move: 0, angle: 45, power: 65, weapon: 'hold', target: 600, ...options,
});
const pack = payload => Buffer.from(JSON.stringify(payload)).toString('base64url');

function teamUnits(state, team) {
  return state.units.filter(unit => unit.team === team);
}

function reflect(shot, unit) {
  return {...shot, unit, move: -shot.move, angle: 180 - shot.angle, target: WIDTH - shot.target};
}

test('Frontline starts every map with mirrored terrain, equal squads, equal reserves and paired wind', () => {
  for (const {id: map} of MAPS) {
    for (const seed of [0, 418021, 0xffffffff]) {
      const state = createFrontline({...config, map, seed});
      assert.deepEqual(state.terrain, state.terrain.toReversed());
      assert.equal(state.active, 0);
      const first = teamUnits(state, 0);
      const second = teamUnits(state, 1);
      assert.equal(first.length, 3);
      assert.equal(second.length, 3);
      assert.deepEqual(first.map(unit => unit.type).sort(), ['rifle', 'rocket', 'tank']);
      for (const ally of first) {
        const opponent = second.find(unit => unit.type === ally.type);
        assert.equal(ally.x + opponent.x, WIDTH);
        assert.equal(ally.y, opponent.y);
        assert.equal(ally.health, opponent.health);
        assert.deepEqual(ally.ammo, opponent.ammo);
        assert.equal(frontlineMoveLimit(ally), frontlineMoveLimit(opponent));
      }
      assert.deepEqual(state.players[0].ammo, state.players[1].ammo);
      assert.deepEqual(state.scores, [0, 0]);
      const reply = resolveFrontline(state, command(first[0].id)).state;
      assert.equal(reply.active, 1);
      assert.equal(reply.turn, 2);
      assert.equal(reply.wind + state.wind, 0);
      const third = resolveFrontline(reply, command(second[0].id)).state;
      const fourth = resolveFrontline(third, command(first[0].id)).state;
      assert.equal(third.active, 0);
      assert.equal(fourth.wind + third.wind, 0);
    }
  }
});

test('mirrored tank attacks have matching range, damage and terrain deformation', () => {
  const first = initial();
  const [left] = teamUnits(first, 0);
  const [right] = teamUnits(first, 1);
  const second = resolveFrontline(first, command(left.id)).state;
  const shot = command(left.id, {move: 10, angle: 36, power: 81, weapon: 'heavy', target: 865});
  const outcomeA = resolveFrontline(first, shot);
  const outcomeB = resolveFrontline(second, reflect(shot, right.id));
  assert.ok(outcomeA.impacts.length > 0);
  assert.equal(outcomeA.impacts.length, outcomeB.impacts.length);
  for (const [i, impact] of outcomeA.impacts.entries()) {
    const opposite = outcomeB.impacts[i];
    assert.ok(Math.abs(impact.x + opposite.x - WIDTH) < .02);
    assert.ok(Math.abs(impact.y - opposite.y) < .02);
  }
  assert.deepEqual(outcomeA.damage.map(entry => entry.amount), outcomeB.damage.map(entry => entry.amount));
  assert.deepEqual(outcomeA.state.terrain, outcomeB.state.terrain.toReversed());
});

test('preview and replay are deterministic and reject wrong-side, out-of-range and incompatible commands', () => {
  const state = initial();
  const before = structuredClone(state);
  const ownTank = teamUnits(state, 0).find(unit => unit.type === 'tank');
  const ownRifle = teamUnits(state, 0).find(unit => unit.type === 'rifle');
  const opposite = teamUnits(state, 1)[0];
  const shoot = command(ownTank.id, {weapon: 'shell'});
  const preview = previewFrontline(state, shoot);
  const resolved = resolveFrontline(state, shoot);
  assert.deepEqual(state, before);
  assert.deepEqual(preview.impacts, resolved.impacts);
  assert.deepEqual(replayFrontline(config, [shoot]), resolved.state);
  for (const forged of [
    command(opposite.id), command(-1), command(1.5), command(ownRifle.id, {weapon: 'heavy'}),
    command(ownTank.id, {move: frontlineMoveLimit(ownTank) + 1}),
    command(ownTank.id, {target: WIDTH + 1}), command(ownTank.id, {angle: 181}),
    command(ownTank.id, {power: NaN}), command(ownTank.id, {weapon: 'constructor'}),
  ]) assert.throws(() => replayFrontline(config, [forged]));
});

test('published v1 token still reconstructs its exact historical shot, crater and shield state', () => {
  const token = 'WzEsNDE4MDIxLCJiYWRsYW5kcyIsMixbWzAsMjUsOTMsMV0sWzAsMTU1LDU1LDRdXV0';
  const state = decodeTurn(token);
  assert.equal(encodeTurn(state), token);
  assert.equal(state.turn, 3);
  assert.equal(state.active, 0);
  assert.equal(state.wind, -44);
  assert.deepEqual(state.players.map(({health, y, shield}) => [health, y, shield]), [[100,439,false],[24,461,true]]);
  assert.equal(createHash('sha256').update(JSON.stringify(state.terrain)).digest('hex'),
    '72680da01cbbdcbd44151d5d670c5b8677a1c2554afe60c14bb03763b3379bc9');
});

test('v2 exchanges reconstruct the exact state and reject illegal history or settings', () => {
  const start = initial();
  const one = resolveFrontline(start, command(teamUnits(start, 0)[0].id)).state;
  const two = resolveFrontline(one, command(teamUnits(one, 1)[0].id)).state;
  const token = encodeTurn(two);
  assert.deepEqual(decodeTurn(token), two);
  const envelope = JSON.parse(Buffer.from(token, 'base64url').toString());
  assert.equal(envelope[0], 2);
  const [version, seed, map, count, [first]] = envelope;
  for (const modified of [
    [3, seed, map, count, []], [version, seed, map, 4, []], [version, seed, 'constructor', count, []],
    [version, seed, map, count, [[...first, 0]]],
    [version, seed, map, count, [[teamUnits(start, 1)[0].id, ...first.slice(1)]]],
    [version, seed, map, count, [[...first.slice(0, 4), -1, first[5]]]],
    [version, seed, map, count, [[...first.slice(0, 5), WIDTH + 1]]],
    [version, seed, map, count, [first, first]],
  ]) assert.throws(() => decodeTurn(pack(modified)));
  assert.throws(() => decodeTurn('A'.repeat(50000)));
});

test('capture advances only on the occupying team’s turn, contested ground stalls, and target score ends the match', () => {
  const state = initial();
  const [tide] = teamUnits(state, 0);
  const [ember] = teamUnits(state, 1);
  const moveTo = (unit, x) => { unit.x = x; unit.y = state.terrain[x]; };
  moveTo(tide, state.objective.x - 24);
  moveTo(ember, state.objective.x + 24);
  const contested = resolveFrontline(state, command(tide.id)).state;
  assert.equal(contested.objective.contested, true);
  assert.deepEqual(contested.scores, [0, 0]);

  const exposedEmber = contested.units.find(unit => unit.id === ember.id);
  exposedEmber.x = ember.team === 1 ? WIDTH - 100 : 100;
  exposedEmber.y = contested.terrain[exposedEmber.x];
  const opposingTurn = resolveFrontline(contested, command(ember.id)).state;
  assert.equal(opposingTurn.objective.owner, 0);
  assert.deepEqual(opposingTurn.scores, [0, 0]);
  opposingTurn.scores[0] = opposingTurn.objective.goal - 1;
  const won = resolveFrontline(opposingTurn, command(tide.id)).state;
  assert.equal(won.winner, 0);
  assert.equal(won.scores[0], won.objective.goal);
  assert.throws(() => resolveFrontline(won, command(tide.id)));
});

test('an occupied landing rejects a reinforcement, while a clear landing consumes only the acting team’s reserve', () => {
  const state = initial();
  const [tide] = teamUnits(state, 0);
  const [ember] = teamUnits(state, 1);
  const blocked = command(tide.id, {weapon: 'air-drop', target: ember.x});
  const original = structuredClone(state);
  assert.equal(previewFrontline(state, blocked).valid, false);
  assert.throws(() => resolveFrontline(state, blocked));
  assert.deepEqual(state, original);

  const choices = [600, 500, 450, 700, 750];
  const clear = choices.map(target => command(tide.id, {weapon: 'air-drop', target}))
    .find(shot => previewFrontline(state, shot).valid !== false);
  assert.ok(clear);
  const next = resolveFrontline(state, clear).state;
  assert.equal(next.players[0].ammo['air-drop'], state.players[0].ammo['air-drop'] - 1);
  assert.equal(next.players[1].ammo['air-drop'], state.players[1].ammo['air-drop']);
  assert.equal(next.units.length, state.units.length + 1);
  assert.equal(next.units.at(-1).team, 0);
  assert.equal(next.units.at(-1).x, clear.target);
  assert.ok(frontlineWeapons(state, tide.id).some(action => action.id === 'air-drop'));
});

test('rifles can hit infantry without cutting ground, and the anti-armour rocket punches through tank armour', () => {
  const state = initial();
  state.terrain.fill(450);
  for (const unit of state.units) unit.y = state.terrain[unit.x];
  const ownRifle = teamUnits(state, 0).find(unit => unit.type === 'rifle');
  const ownAT = teamUnits(state, 0).find(unit => unit.type === 'rocket');
  const rivalRifle = teamUnits(state, 1).find(unit => unit.type === 'rifle');
  const rivalTank = teamUnits(state, 1).find(unit => unit.type === 'tank');
  ownAT.x = 200;
  rivalRifle.x = 455;
  const volley = command(ownRifle.id, {weapon: 'rifle', angle: 0, power: 100});
  const onInfantry = resolveFrontline(state, volley);
  assert.deepEqual(onInfantry.damage, [{id: rivalRifle.id, amount: 39}]);
  assert.deepEqual(onInfantry.state.terrain, state.terrain);

  rivalRifle.x = 945;
  rivalTank.x = 455;
  const onArmour = resolveFrontline(state, volley);
  assert.deepEqual(onArmour.damage, [{id: rivalTank.id, amount: 14}]);
  ownRifle.x = 145;
  const rocket = resolveFrontline(state, command(ownAT.id, {weapon: 'rocket', angle: 0, power: 100}));
  assert.deepEqual(rocket.damage, [{id: rivalTank.id, amount: 72}]);
  assert.equal(rocket.state.units.find(unit => unit.id === ownAT.id).ammo.rocket, 1);
  assert.ok(rocket.state.terrain.some(y => y > 450));
});

test('an air raid consumes the acting team’s one charge and can be exchanged in v2 history', () => {
  const state = initial();
  const [tide] = teamUnits(state, 0);
  const [ember] = teamUnits(state, 1);
  const attack = command(tide.id, {weapon: 'air-raid', target: ember.x});
  const outcome = resolveFrontline(state, attack);
  assert.ok(outcome.damage.some(hit => hit.id === ember.id && hit.amount > 0));
  assert.equal(outcome.state.players[0].ammo['air-raid'], 0);
  assert.equal(outcome.state.players[1].ammo['air-raid'], 1);
  assert.deepEqual(decodeTurn(encodeTurn(outcome.state)), outcome.state);
  const returned = resolveFrontline(outcome.state, command(ember.id)).state;
  assert.throws(() => resolveFrontline(returned, attack));
});
