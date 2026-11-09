import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, resolveTurn} from '../engine.js';
import {createFrontline, resolveFrontline} from '../frontline.js';
import {makeConfig} from '../session.js';
import {planBotTurn} from '../bot.js';

const seed = 418021;
const initialHumanShot = {move: 0, angle: 180, power: 65, weapon: 'shell'};

for (const [label, start, resolve, humanShot] of [
  ['classic', createMatch, resolveTurn, initialHumanShot],
  ['Frontline', createFrontline, resolveFrontline, {...initialHumanShot, unit: 0, weapon: 'hold', target: 600}],
]) {
  test(`${label} recruit and standard bots produce legal deterministic commands without modifying the input`, () => {
    for (const map of ['badlands', 'ridge', 'basin']) {
      for (const difficulty of ['recruit', 'standard']) {
        const human = start(makeConfig(map, 2, seed));
        const state = resolve(human, humanShot).state;
        const original = structuredClone(state);
        assert.equal(state.active, 1);
        const shot = planBotTurn(state, {difficulty});
        assert.deepEqual(planBotTurn(state, {difficulty}), shot);
        assert.deepEqual(state, original);
        const result = resolve(state, shot).state;
        assert.equal(result.history.length, state.history.length + 1);
        assert.equal(result.active, 0);
      }
    }
  });
}
