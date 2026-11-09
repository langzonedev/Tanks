import {MAPS, MAX_TURNS, WEAPONS, replayMatch} from './engine.js';

export const CALLSIGNS = ['Tide', 'Ember', 'Violet', 'Gold'];
const CODE_LIMIT = 10000;
const VERSION = 1;

export function makeConfig(map, count, seed) {
  return {map, seed, players: CALLSIGNS.slice(0, count)};
}

export function encodeTurn(state) {
  const commands = state.history.map(({move, angle, power, weapon}) => [
    move, angle, power, WEAPONS.findIndex(entry => entry.id === weapon)
  ]);
  const payload = JSON.stringify([VERSION, state.seed, state.map, state.players.length, commands]);
  return btoa(payload).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeTurn(code) {
  if (typeof code !== 'string' || !code.length || code.length > CODE_LIMIT || !/^[A-Za-z0-9_-]+$/.test(code)) {
    throw new Error('Invalid turn link');
  }
  const payload = JSON.parse(atob(code.replaceAll('-', '+').replaceAll('_', '/')));
  if (!Array.isArray(payload) || payload.length !== 5) throw new Error('Invalid turn link');
  const [version, seed, map, count, turns] = payload;
  if (version !== VERSION || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !MAPS.some(entry => entry.id === map) || !Number.isInteger(count) || count < 2 || count > 4 ||
      !Array.isArray(turns) || turns.length > MAX_TURNS) {
    throw new Error('Invalid match settings');
  }
  const commands = turns.map(turn => {
    if (!Array.isArray(turn) || turn.length !== 4 || !turn.every(Number.isInteger)) {
      throw new Error('Invalid shot');
    }
    const [move, angle, power, weaponIndex] = turn;
    const weapon = WEAPONS[weaponIndex];
    if (!weapon) throw new Error('Unknown weapon');
    return {move, angle, power, weapon: weapon.id};
  });
  return replayMatch(makeConfig(map, count, seed), commands);
}
