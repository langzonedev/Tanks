import {MAPS, MAX_TURNS, WEAPONS, replayMatch} from './engine.js';
import {FRONTLINE_ACTIONS, replayFrontline} from './frontline.js';

export const CALLSIGNS = ['Tide', 'Ember', 'Violet', 'Gold'];
const CODE_LIMIT = 10000;

export function makeConfig(map, count, seed) {
  return {map, seed, players: CALLSIGNS.slice(0, count)};
}

export function encodeTurn(state) {
  const frontline = state.scenario === 'frontline';
  const commands = state.history.map(({unit, move, angle, power, weapon, target}) => {
    if (frontline) return [unit, move, angle, power, FRONTLINE_ACTIONS.indexOf(weapon), target];
    return [move, angle, power, WEAPONS.findIndex(entry => entry.id === weapon)];
  });
  const payload = JSON.stringify([frontline ? 2 : 1, state.seed, state.map, state.players.length, commands]);
  return btoa(payload).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeTurn(code) {
  if (typeof code !== 'string' || !code.length || code.length > CODE_LIMIT || !/^[A-Za-z0-9_-]+$/.test(code)) {
    throw new Error('Invalid turn link');
  }
  const payload = JSON.parse(atob(code.replaceAll('-', '+').replaceAll('_', '/')));
  if (!Array.isArray(payload) || payload.length !== 5) throw new Error('Invalid turn link');
  const [version, seed, map, count, turns] = payload;
  const frontline = version === 2;
  if ((version !== 1 && !frontline) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !MAPS.some(entry => entry.id === map) || !Number.isInteger(count) || count < 2 || count > 4 ||
      (frontline && count !== 2) || !Array.isArray(turns) || turns.length > MAX_TURNS) {
    throw new Error('Invalid match settings');
  }
  const commands = turns.map(turn => {
    if (!Array.isArray(turn) || turn.length !== (frontline ? 6 : 4) || !turn.every(Number.isInteger)) {
      throw new Error('Invalid order');
    }
    if (frontline) {
      const [unit, move, angle, power, index, target] = turn;
      const weapon = FRONTLINE_ACTIONS[index];
      if (!weapon) throw new Error('Unknown order');
      return {unit, move, angle, power, weapon, target};
    }
    const [move, angle, power, index] = turn;
    const weapon = WEAPONS[index];
    if (!weapon) throw new Error('Unknown weapon');
    return {move, angle, power, weapon: weapon.id};
  });
  const config = makeConfig(map, count, seed);
  return frontline ? replayFrontline(config, commands) : replayMatch(config, commands);
}
