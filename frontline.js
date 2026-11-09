import { COLORS, HEIGHT, MAX_TURNS, WEAPONS, WIDTH, createMatch } from './engine.js';

export const FRONTLINE_ACTIONS = Object.freeze(['shell', 'heavy', 'rifle', 'rocket', 'air-raid', 'air-drop', 'hold']);
export const MAX_FRONTLINE_MOVE = 90;
const EDGE = 32;
const CENTRE = WIDTH / 2;
const OBJECTIVE_RADIUS = 85;
const OBJECTIVE_GOAL = 4;
const STEP = 1 / 120;
const GROUND_LIMIT = HEIGHT - 30;
const UNIT_TYPES = Object.freeze({
  tank: { name: 'Tank', health: 100, move: 66, height: 12, radius: 18, grade: 0.86, ammo: { shell: null, heavy: 2 } },
  rifle: { name: 'Rifle Squad', health: 65, move: 90, height: 9, radius: 13, grade: 1.12, ammo: { rifle: null } },
  rocket: { name: 'AT Squad', health: 75, move: 78, height: 10, radius: 14, grade: 1, ammo: { rocket: 2 } },
});
const ACTIONS = new Map([
  ['shell', { ...WEAPONS[0], radius: 59, damage: 50, armour: 47 }],
  ['heavy', { ...WEAPONS[1], radius: 78, damage: 60, armour: 68 }],
  ['rifle', { id: 'rifle', name: 'Rifle Volley', description: 'Straight fire. Power sets range. Strong against infantry.', color: '#e9f6b6', radius: 0, damage: 39, armour: 14, depth: 0 }],
  ['rocket', { id: 'rocket', name: 'Anti-armour Rocket', description: 'Fast, shallow shot with a narrow blast. Strong against tanks.', color: '#ffd875', radius: 40, damage: 42, armour: 72, depth: 39 }],
  ['air-raid', { id: 'air-raid', name: 'Air Raid', description: 'One targeted strike per team. The blast can hit your own units.', color: '#ff9566', targeted: true, radius: 86, damage: 54, armour: 52, depth: 65 }],
  ['air-drop', { id: 'air-drop', name: 'Air Drop', description: 'Deploy a fresh rifle squad onto open ground. One per team.', color: '#7cecdf', targeted: true, radius: 0, damage: 0, depth: 0 }],
  ['hold', { id: 'hold', name: 'Hold Position', description: 'Keep your position or move without firing. Control still scores.', color: '#b8a1ff', radius: 0, damage: 0, depth: 0 }],
]);
const SUPPORT = ['air-raid', 'air-drop'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const integerWithin = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const quantize = (n) => Math.round(n * 1000) / 1000;

function pairedWind(seed, turn) {
  const round = Math.ceil(turn / 2);
  let hash = Math.imul(seed ^ Math.imul(round, 0x9e3779b9), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  const relative = ((hash ^ (hash >>> 16)) >>> 0) % 101 - 50;
  return turn % 2 ? relative : -relative || 0;
}

function unitAt(id, team, type, x, terrain) {
  const spec = UNIT_TYPES[type];
  return {
    id, team, type, name: spec.name, color: COLORS[team], x, y: terrain[x],
    health: spec.health, maxHealth: spec.health, shield: false, ammo: { ...spec.ammo },
  };
}

function teamCards(players, units) {
  return players.map((player) => {
    const roster = units.filter((unit) => unit.team === player.id);
    const representative = roster.find((unit) => unit.type === 'tank' && unit.health > 0)
      ?? roster.find((unit) => unit.health > 0) ?? roster[0];
    return {
      ...player, x: representative.x, y: representative.y,
      health: roster.reduce((sum, unit) => sum + unit.health, 0),
      maxHealth: roster.reduce((sum, unit) => sum + unit.maxHealth, 0),
    };
  });
}

export function createFrontline({ seed, map, players = ['Vanguard', 'Ember'] } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw new RangeError('Frontline requires two factions.');
  const base = createMatch({ seed, map, players });
  const terrain = base.terrain.map((height, x) => Math.round((height + base.terrain[WIDTH - x]) / 2));
  const units = [];
  for (let team = 0; team < 2; team++) {
    const spawn = [172, 255, 329];
    for (const [slot, type] of ['tank', 'rifle', 'rocket'].entries()) {
      const x = team === 0 ? spawn[slot] : WIDTH - spawn[slot];
      units.push(unitAt(team * 3 + slot, team, type, x, terrain));
    }
  }
  return {
    ...base, scenario: 'frontline', terrain, units, wind: pairedWind(base.seed, 1), scores: [0, 0],
    players: teamCards(base.players.map((player) => ({ ...player, ammo: { 'air-raid': 1, 'air-drop': 1 } })), units),
    objective: { x: CENTRE, radius: OBJECTIVE_RADIUS, goal: OBJECTIVE_GOAL, owner: null, contested: false },
  };
}

export function frontlineMoveLimit(unit) {
  return UNIT_TYPES[unit?.type]?.move ?? 0;
}

export function frontlineWeapons(state, unitId) {
  const unit = state.units.find(({ id }) => id === unitId);
  if (!unit || unit.health <= 0) return [];
  const ammo = { ...unit.ammo, ...state.players[unit.team].ammo, hold: null };
  return FRONTLINE_ACTIONS.filter((id) => Object.hasOwn(ammo, id)).map((id) => {
    const { name, description, color, targeted = false } = ACTIONS.get(id);
    return { id, name, description, ammo: ammo[id], color, targeted };
  });
}

function checkedCommand(state, command) {
  if (state.scenario !== 'frontline' || state.winner !== null) throw new RangeError('This Frontline match has ended or is invalid.');
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new TypeError('Choose a unit and an action.');
  const { unit, move, angle, power, weapon, target } = command;
  const selected = state.units.find(({ id }) => id === unit);
  if (!selected || selected.team !== state.active || selected.health <= 0) throw new RangeError('Choose one of your living units.');
  const limit = frontlineMoveLimit(selected);
  if (!integerWithin(move, -limit, limit) || !integerWithin(angle, 0, 180) || !integerWithin(power, 10, 100)) {
    throw new RangeError('Choose valid movement, angle and power values for this unit.');
  }
  if (!integerWithin(target, EDGE, WIDTH - EDGE)) throw new RangeError('Choose a target inside the battlefield.');
  const action = frontlineWeapons(state, unit).find(({ id }) => id === weapon);
  if (!action || action.ammo === 0) throw new RangeError('This unit cannot use that action.');
  return { command: { unit, move, angle, power, weapon, target }, selected };
}

function surface(terrain, x) {
  const safe = clamp(x, 0, WIDTH);
  const left = Math.floor(safe);
  return terrain[left] + (terrain[Math.min(left + 1, WIDTH)] - terrain[left]) * (safe - left);
}

function moveUnit(state, selected, move) {
  const spec = UNIT_TYPES[selected.type];
  const direction = Math.sign(move);
  let x = selected.x;
  for (let distance = 0; distance < Math.abs(move); distance++) {
    const next = x + direction;
    if (next < EDGE || next > WIDTH - EDGE) break;
    const grade = Math.abs(surface(state.terrain, next + 3) - surface(state.terrain, next - 3)) / 6;
    if (grade > spec.grade) break;
    const blocked = state.units.some((unit) => unit.id !== selected.id && unit.health > 0
      && Math.abs(unit.x - next) < UNIT_TYPES[unit.type].radius + spec.radius + 3);
    if (blocked) break;
    x = next;
  }
  return { ...selected, ammo: { ...selected.ammo }, x, y: state.terrain[x] };
}

function point(x, y, t) {
  return { x: quantize(x), y: quantize(y), t };
}

// Trace every faction from the same side of the map. This keeps even exact
// collision boundaries and rounding mirrored when a command is reflected.
function trace(state, units, tank, command, action, record) {
  const mirrored = tank.team === 1;
  const worldX = (x) => mirrored ? WIDTH - x : x;
  const sampleTerrain = (x) => surface(state.terrain, worldX(x));
  const localUnits = units.filter(({ health }) => health > 0).map((unit) => ({ ...unit, x: worldX(unit.x) }));
  const direction = (mirrored ? 180 - command.angle : command.angle) * Math.PI / 180;
  const cos = Math.cos(direction);
  const sin = Math.sin(direction);
  const isRifle = action.id === 'rifle';
  const isRocket = action.id === 'rocket';
  const barrel = isRifle ? 15 : isRocket ? 19 : 24;
  const elevation = isRifle ? 12 : isRocket ? 14 : 16;
  const speed = isRifle ? 1600 : isRocket ? 425 + command.power * 5 : (130 + command.power * 8.8) * action.speed;
  const gravity = isRifle ? 0 : isRocket ? 245 : 660;
  const wind = (mirrored ? -state.wind : state.wind) * (isRifle ? 0 : isRocket ? 0.25 : action.wind);
  const maxDistance = isRifle ? 90 + command.power * 3.8 : isRocket ? 790 : Infinity;
  let x = quantize(worldX(tank.x) + cos * barrel);
  let y = quantize(tank.y - elevation - sin * barrel);
  let vx = quantize(cos * speed);
  let vy = quantize(-sin * speed);
  let travelled = 0;
  const path = record ? [point(worldX(x), y, 0)] : null;
  for (let step = 1; step <= 720; step++) {
    vx = quantize(vx + wind * STEP);
    vy = quantize(vy + gravity * STEP);
    const nextX = quantize(x + vx * STEP);
    const nextY = quantize(y + vy * STEP);
    const stepDistance = Math.hypot(nextX - x, nextY - y);
    const samples = Math.max(1, Math.ceil(stepDistance / 4));
    for (let sample = 1; sample <= samples; sample++) {
      const fraction = sample / samples;
      const hitX = x + (nextX - x) * fraction;
      const hitY = y + (nextY - y) * fraction;
      const t = (step - 1 + fraction) * STEP;
      if (hitX < 0 || hitX > WIDTH || travelled + stepDistance * fraction > maxDistance) {
        return { paths: path ? [path] : [], impacts: [], duration: t + 0.12 };
      }
      const hitUnit = localUnits.find((unit) => {
        const spec = UNIT_TYPES[unit.type];
        return Math.hypot(unit.x - hitX, unit.y - spec.height - hitY) <= spec.radius;
      });
      if (!hitUnit && hitY < sampleTerrain(hitX)) continue;
      const end = point(worldX(quantize(hitX)), hitY, t);
      path?.push(end);
      return {
        paths: path ? [path] : [],
        impacts: [{ ...end, radius: action.radius, weapon: action.id, direct: hitUnit?.id ?? null }],
        duration: t + (isRifle ? 0.2 : 0.35),
      };
    }
    x = nextX;
    y = nextY;
    travelled += stepDistance;
    path?.push(point(worldX(x), y, step * STEP));
  }
  return { paths: path ? [path] : [], impacts: [], duration: 6.12 };
}

function supportPath(terrain, target, action, record) {
  const t = action.id === 'air-drop' ? 1.12 : 0.82;
  const y = terrain[target];
  const path = [];
  if (record) {
    for (let i = 0; i <= 40; i++) {
      const progress = i / 40;
      path.push(point(target, -44 + (y + 44) * progress, progress * t));
    }
  }
  return {
    paths: record ? [path] : [], impacts: [{ x: target, y, t, radius: action.radius, weapon: action.id, direct: null }],
    duration: t + 0.36,
  };
}

function dropReason(terrain, units, target) {
  if (units.some(({ x, health }) => health > 0 && Math.abs(x - target) < 48)) return 'Choose open ground at least 48 metres from another unit.';
  const heights = Array.from({ length: 21 }, (_, i) => terrain[target + i - 10]);
  if (Math.max(...heights) - Math.min(...heights) > 19) return 'Find flatter ground for the air drop.';
  return '';
}

function damageAt(impact, unit, action, command, shooter) {
  if (unit.health <= 0 || action.damage === 0) return 0;
  const max = unit.type === 'tank' ? action.armour ?? action.damage : action.damage;
  if (impact.direct === unit.id) {
    if (action.id !== 'rifle') return Math.min(unit.health, max);
    const distance = Math.abs(unit.x - shooter.x);
    const falloff = clamp(1 - Math.max(0, distance - 220) / 720, 0.65, 1);
    return Math.min(unit.health, Math.round(max * falloff));
  }
  if (!impact.radius || command.weapon === 'rifle') return 0;
  const distance = Math.hypot(unit.x - impact.x, unit.y - UNIT_TYPES[unit.type].height - impact.y);
  if (distance > impact.radius) return 0;
  return Math.min(unit.health, Math.max(1, Math.round(max * (0.14 + 0.86 * (1 - distance / impact.radius)))));
}

function prepare(state, input, record) {
  const { command, selected } = checkedCommand(state, input);
  const tank = moveUnit(state, selected, command.move);
  const units = state.units.map((unit) => unit.id === tank.id ? tank : unit);
  const action = ACTIONS.get(command.weapon);
  const reason = action.id === 'air-drop' ? dropReason(state.terrain, units, command.target) : '';
  if (reason) return { command, units, action, visual: { valid: false, reason, tank, paths: [], impacts: [], duration: 0, damage: [] } };
  let visual;
  if (action.id === 'hold') visual = { paths: [], impacts: [], duration: 0.22 };
  else if (action.targeted) visual = supportPath(state.terrain, command.target, action, record);
  else visual = trace(state, units, tank, command, action, record);
  const damage = units.flatMap((unit) => {
    const amount = visual.impacts.reduce((sum, impact) => sum + damageAt(impact, unit, action, command, tank), 0);
    return amount ? [{ id: unit.id, amount }] : [];
  });
  return { command, units, action, visual: { valid: true, tank, ...visual, damage } };
}

export function previewFrontline(state, command, { record = true } = {}) {
  return prepare(state, command, record).visual;
}

function cutCrater(terrain, impact, action) {
  if (!action.depth) return;
  const width = action.radius * 0.72;
  for (let x = Math.max(0, Math.ceil(impact.x - width)); x <= Math.min(WIDTH, Math.floor(impact.x + width)); x++) {
    const ratio = (x - impact.x) / width;
    const floor = Math.round(impact.y + action.depth * Math.sqrt(Math.max(0, 1 - ratio ** 2)));
    terrain[x] = Math.min(GROUND_LIMIT, Math.max(terrain[x], floor));
  }
}

function control(units, objective) {
  const present = [false, false];
  for (const unit of units) {
    if (unit.health > 0 && Math.abs(unit.x - objective.x) <= objective.radius) present[unit.team] = true;
  }
  return {
    ...objective,
    contested: present[0] && present[1],
    owner: present[0] === present[1] ? null : present[0] ? 0 : 1,
  };
}

function decideWinner(players, scores, turn) {
  if (players[0].health <= 0 && players[1].health <= 0) return 'draw';
  if (players[0].health <= 0) return 1;
  if (players[1].health <= 0) return 0;
  const secured = scores.findIndex((score) => score >= OBJECTIVE_GOAL);
  if (secured !== -1) return secured;
  if (turn < MAX_TURNS) return null;
  if (scores[0] !== scores[1]) return scores[0] > scores[1] ? 0 : 1;
  if (players[0].health !== players[1].health) return players[0].health > players[1].health ? 0 : 1;
  return 'draw';
}

function resolve(state, input, record) {
  const { command, action, visual, units: moved } = prepare(state, input, record);
  if (!visual.valid) throw new RangeError(visual.reason);
  const terrain = state.terrain.slice();
  const damage = new Map(visual.damage.map(({ id, amount }) => [id, amount]));
  const units = moved.map((unit) => ({ ...unit, health: Math.max(0, unit.health - (damage.get(unit.id) ?? 0)), ammo: { ...unit.ammo } }));
  const players = state.players.map((player) => ({ ...player, ammo: { ...player.ammo } }));
  const shooter = units.find(({ id }) => id === command.unit);
  const team = players[state.active];
  if (SUPPORT.includes(action.id)) team.ammo[action.id]--;
  else if (typeof shooter.ammo[action.id] === 'number') shooter.ammo[action.id]--;
  for (const impact of visual.impacts) cutCrater(terrain, impact, action);
  if (action.id === 'air-drop') units.push(unitAt(6 + state.active, state.active, 'rifle', command.target, terrain));
  for (const unit of units) unit.y = terrain[unit.x];
  const scores = [...state.scores];
  const objective = control(units, state.objective);
  const scored = objective.owner === state.active;
  if (scored) scores[state.active]++;
  const cards = teamCards(players, units);
  const winner = decideWinner(cards, scores, state.turn);
  const turn = winner === null ? state.turn + 1 : state.turn;
  const summary = [];
  if (action.id === 'air-drop') summary.push(`${team.name} deployed a Rifle Squad.`);
  else if (action.id === 'hold') summary.push(`${team.name} ${command.move ? 'repositioned' : 'held position'}.`);
  else if (visual.damage.length) {
    for (const { id, amount } of visual.damage) {
      const struck = units.find((unit) => unit.id === id);
      summary.push(`${cards[struck.team].name} ${struck.name} ${struck.health ? `−${amount} HP` : 'destroyed'}.`);
    }
  } else if (visual.impacts.length && action.depth) summary.push(`${team.name} reshaped the battlefield.`);
  else summary.push(`${team.name} missed.`);
  if (scored) summary.push(`${team.name} scores control ${scores[state.active]}/${OBJECTIVE_GOAL}.`);
  else if (objective.contested) summary.push('Control is contested.');
  return {
    ...visual, summary: summary.join(' '),
    state: {
      ...state, terrain, units, players: cards, scores, objective, winner, turn,
      active: winner === null ? 1 - state.active : state.active, wind: pairedWind(state.seed, turn),
      history: [...state.history, command],
    },
  };
}

export function resolveFrontline(state, command) {
  return resolve(state, command, true);
}

export function replayFrontline(config, commands) {
  if (!Array.isArray(commands) || commands.length > MAX_TURNS) throw new RangeError('This Frontline turn history is too long or invalid.');
  let state = createFrontline(config);
  for (const command of commands) state = resolve(state, command, false).state;
  return state;
}
