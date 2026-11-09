/** Deterministic rules for a local match or a replayed turn-by-turn exchange. */
export const WIDTH = 1200;
export const HEIGHT = 600;
export const MAX_MOVE = 90;
export const MAX_TURNS = 120;
export const COLORS = Object.freeze(['#67e8dc', '#ff926d', '#b8a1ff', '#f6d16f']);

export const MAPS = Object.freeze([
  Object.freeze({ id: 'badlands', name: 'Redline Badlands', description: 'Broken ridges and open approaches.' }),
  Object.freeze({ id: 'ridge', name: 'Relay Ridge', description: 'A high centre ridge rewards lobbed shots.' }),
  Object.freeze({ id: 'basin', name: 'Salt Basin', description: 'Low central ground with elevated flanks.' }),
]);

export const WEAPONS = Object.freeze([
  Object.freeze({ id: 'shell', name: 'Field Shell', description: 'Reliable damage and a modest crater.', ammo: null, color: '#e9f6b6', radius: 65, damage: 56, depth: 48, speed: 1, wind: 1 }),
  Object.freeze({ id: 'heavy', name: 'Bunker Buster', description: 'A wide blast and deep crater. Slower in flight.', ammo: 2, color: '#ff9566', radius: 100, damage: 76, depth: 78, speed: 0.92, wind: 0.65 }),
  Object.freeze({ id: 'scatter', name: 'Cluster Charge', description: 'Splits in flight to cover a wider area.', ammo: 2, color: '#c6abff', radius: 45, damage: 25, depth: 34, speed: 1, wind: 1.25 }),
  Object.freeze({ id: 'digger', name: 'Groundbreaker', description: 'Cut a steep trench and upset enemy positioning.', ammo: 2, color: '#ffd875', radius: 47, damage: 36, depth: 126, speed: 1.02, wind: 0.85 }),
  Object.freeze({ id: 'shield', name: 'Reactive Shield', description: 'Spend a turn to halve the next damaging blast.', ammo: 1, color: '#7cecdf', radius: 0, damage: 0, depth: 0, speed: 0, wind: 0 }),
]);

const weaponById = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const mapIds = new Set(MAPS.map((map) => map.id));
const gravity = 660;
const shotStep = 1 / 120;
const maxFlight = 6;
const tankRadius = 18;
const groundLimit = HEIGHT - 30;
const minTankX = 32;
const maxTankX = WIDTH - minTankX;
const tankGap = 38;
const maximumGrade = 0.86;
const turnNames = ['Vanguard', 'Ember', 'Spectre', 'Nomad'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const integerWithin = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const quantize = (value) => Math.round(value * 1000) / 1000;

function mixedSeed(seed) {
  let value = seed >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function windAt(seed, turn) {
  return mixedSeed(seed ^ Math.imul(turn, 0x9e3779b9)) % 121 - 60;
}

function cleanNames(names) {
  if (!Array.isArray(names) || names.length < 2 || names.length > 4) {
    throw new RangeError('Choose between two and four players.');
  }
  return Array.from(names, (name) => {
    if (typeof name !== 'string' || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(name)) {
      throw new TypeError('Use a short, readable player name.');
    }
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 24) throw new RangeError('Player names need 1–24 characters.');
    return trimmed;
  });
}

function terrainFor(seed, map) {
  const offset = mixedSeed(seed) / 0x100000000 * Math.PI * 2;
  const secondary = mixedSeed(seed ^ 0x7637f61a) / 0x100000000 * Math.PI * 2;
  return Array.from({ length: WIDTH + 1 }, (_, x) => {
    const u = x / WIDTH;
    const bump = Math.exp(-((u - 0.5) ** 2) / 0.029);
    const texture = Math.sin(u * Math.PI * 5.3 + offset) * 23 + Math.sin(u * Math.PI * 11 + secondary) * 9;
    let base = 421 + Math.sin(u * Math.PI * 3.3 + secondary) * 40;
    if (map === 'ridge') base = 456 - bump * 154;
    if (map === 'basin') base = 373 + bump * 119;
    return Math.round(clamp(base + texture, 250, 520));
  });
}

function surface(terrain, x) {
  const left = Math.floor(clamp(x, 0, WIDTH));
  const right = Math.min(left + 1, WIDTH);
  return terrain[left] + (terrain[right] - terrain[left]) * clamp(x - left, 0, 1);
}

export function createMatch({ seed = 1, map = 'badlands', players = turnNames.slice(0, 2) } = {}) {
  if (!integerWithin(seed, 0, 0xffffffff)) throw new RangeError('Use an unsigned 32-bit match seed.');
  if (!mapIds.has(map)) throw new RangeError('Choose a known battlefield.');
  const names = cleanNames(players);
  const terrain = terrainFor(seed, map);
  const fractions = names.length === 2 ? [0.15, 0.85] : names.length === 3 ? [0.14, 0.5, 0.86] : [0.13, 0.37, 0.63, 0.87];
  const tanks = names.map((name, id) => {
    const x = Math.round(WIDTH * fractions[id]);
    return {
      id, name, color: COLORS[id], x, y: terrain[x], health: 100,
      ammo: Object.fromEntries(WEAPONS.map(({ id: key, ammo }) => [key, ammo])), shield: false,
    };
  });
  return { seed, map, players: tanks, terrain, active: 0, turn: 1, wind: windAt(seed, 1), winner: null, history: [] };
}

/** Check the complete planned route, even when the endpoint itself is clear. */
export function previewTank(state, move = 0) {
  if (!integerWithin(move, -MAX_MOVE, MAX_MOVE)) throw new RangeError('Movement is outside the fuel budget.');
  const tank = state.players[state.active];
  const direction = Math.sign(move);
  let x = tank.x;
  for (let distance = 0; distance < Math.abs(move); distance++) {
    const next = x + direction;
    if (next < minTankX || next > maxTankX) break;
    const ahead = next + direction * 3;
    const behind = next - direction * 3;
    const grade = Math.abs(surface(state.terrain, ahead) - surface(state.terrain, behind)) / 6;
    if (grade > maximumGrade) break;
    if (state.players.some((other) => other.id !== tank.id && other.health > 0 && Math.abs(other.x - next) < tankGap)) break;
    x = next;
  }
  return { ...tank, x, y: state.terrain[x] };
}

function checkedCommand(state, command) {
  if (state.winner !== null) throw new RangeError('This match has ended.');
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new TypeError('A turn requires a shot command.');
  const { move, angle, power, weapon } = command;
  if (!integerWithin(move, -MAX_MOVE, MAX_MOVE) || !integerWithin(angle, 0, 180) || !integerWithin(power, 10, 100)) {
    throw new RangeError('Choose valid movement, angle and power values.');
  }
  if (!weaponById.has(weapon)) throw new RangeError('Choose a known weapon.');
  if (state.players[state.active].ammo[weapon] === 0) throw new RangeError('This weapon has no charges left.');
  return { move, angle, power, weapon };
}

function traceProjectile({ start, terrain, players, wind, weapon, split = false, record = true }) {
  const path = record ? [{ x: start.x, y: start.y, t: start.t }] : null;
  let { x, y, vx, vy, t } = start;
  for (let step = 1; t < maxFlight; step++) {
    vx = quantize(vx + wind * weapon.wind * shotStep);
    vy = quantize(vy + gravity * shotStep);
    const nextX = quantize(x + vx * shotStep);
    const nextY = quantize(y + vy * shotStep);
    const nextT = start.t + step * shotStep;
    const samples = Math.max(1, Math.ceil(Math.hypot(nextX - x, nextY - y) / 4));
    for (let sample = 1; sample <= samples; sample++) {
      const fraction = sample / samples;
      const hitX = x + (nextX - x) * fraction;
      const hitY = y + (nextY - y) * fraction;
      const hitT = t + (nextT - t) * fraction;
      if (hitX < 0 || hitX > WIDTH) return { path, t: hitT };
      const hitTank = players.find((tank) => tank.health > 0 && Math.hypot(tank.x - hitX, tank.y - 12 - hitY) <= tankRadius);
      if (hitTank || hitY >= surface(terrain, hitX)) {
        const impact = {
          x: quantize(hitX), y: quantize(hitY), t: hitT,
          radius: weapon.radius, weapon: weapon.id, direct: hitTank?.id ?? null,
        };
        path?.push({ x: impact.x, y: impact.y, t: impact.t });
        return { path, impact, t: hitT };
      }
    }
    x = nextX;
    y = nextY;
    t = nextT;
    path?.push({ x, y, t });
    if (split && (t >= 0.48 || (t >= 0.2 && vy > -20))) return { path, split: { x, y, vx, vy, t }, t };
  }
  return { path, t };
}

function simulateShot(state, command, record = true) {
  const tank = previewTank(state, command.move);
  const weapon = weaponById.get(command.weapon);
  const players = state.players.map((player) => player.id === tank.id ? tank : player);
  if (weapon.id === 'shield') return { tank, paths: [], impacts: [], duration: 0.28 };
  const radians = command.angle * Math.PI / 180;
  const speed = (130 + command.power * 8.8) * weapon.speed;
  const start = {
    x: quantize(tank.x + Math.cos(radians) * 24),
    y: quantize(tank.y - 16 - Math.sin(radians) * 24),
    vx: quantize(Math.cos(radians) * speed),
    vy: quantize(-Math.sin(radians) * speed),
    t: 0,
  };
  const context = { terrain: state.terrain, players, wind: state.wind, weapon, record };
  const main = traceProjectile({ ...context, start, split: weapon.id === 'scatter' });
  const traces = [main];
  if (main.split) {
    const direction = Math.sign(main.split.vx) || 1;
    for (const offset of [-1, 0, 1]) {
      const child = {
        ...main.split,
        vx: main.split.vx + offset * direction * 100,
        vy: main.split.vy - offset * 45,
      };
      traces.push(traceProjectile({ ...context, start: child }));
    }
  }
  const paths = traces.map((trace) => trace.path).filter(Boolean);
  const impacts = traces.map((trace) => trace.impact).filter(Boolean).sort((a, b) => a.t - b.t);
  const duration = Math.max(...traces.map((trace) => trace.t)) + (impacts.length ? 0.35 : 0.12);
  return { tank, paths, impacts, duration };
}

export function predictShot(state, command) {
  return simulateShot(state, checkedCommand(state, command));
}

function crater(terrain, impact, weapon) {
  const cutRadius = weapon.radius * 0.72;
  const left = Math.max(0, Math.ceil(impact.x - cutRadius));
  const right = Math.min(WIDTH, Math.floor(impact.x + cutRadius));
  for (let x = left; x <= right; x++) {
    const ratio = (x - impact.x) / cutRadius;
    const depth = weapon.depth * Math.sqrt(Math.max(0, 1 - ratio ** 2));
    terrain[x] = Math.min(groundLimit, Math.max(terrain[x], Math.round(impact.y + depth)));
  }
}

function blastDamage(impact, tank, weapon) {
  if (tank.health <= 0) return 0;
  if (impact.direct === tank.id) return weapon.damage;
  const distance = Math.hypot(tank.x - impact.x, tank.y - 12 - impact.y);
  if (distance > impact.radius) return 0;
  return Math.max(1, Math.round(weapon.damage * (0.14 + 0.86 * (1 - distance / impact.radius))));
}

function decideWinner(players, turn) {
  const living = players.filter((tank) => tank.health > 0);
  if (living.length <= 1) return living[0]?.id ?? 'draw';
  if (turn < MAX_TURNS) return null;
  const bestHealth = Math.max(...living.map((tank) => tank.health));
  const leaders = living.filter((tank) => tank.health === bestHealth);
  return leaders.length === 1 ? leaders[0].id : 'draw';
}

function resolve(state, command, record) {
  const shot = checkedCommand(state, command);
  const visual = simulateShot(state, shot, record);
  const terrain = state.terrain.slice();
  const players = state.players.map((tank) => ({ ...(tank.id === visual.tank.id ? visual.tank : tank), ammo: { ...tank.ammo } }));
  const shooter = players[state.active];
  const weapon = weaponById.get(shot.weapon);
  if (shooter.ammo[weapon.id] !== null) shooter.ammo[weapon.id]--;
  if (weapon.id === 'shield') shooter.shield = true;
  const damage = [];
  for (const impact of visual.impacts) {
    for (const tank of players) {
      let amount = blastDamage(impact, tank, weapon);
      if (!amount) continue;
      if (tank.shield) {
        amount = Math.ceil(amount / 2);
        tank.shield = false;
      }
      tank.health = Math.max(0, tank.health - amount);
    }
    crater(terrain, impact, weapon);
  }
  for (const tank of players) {
    const amount = state.players[tank.id].health - tank.health;
    if (amount) damage.push({ id: tank.id, amount });
    tank.y = terrain[tank.x];
  }
  const winner = decideWinner(players, state.turn);
  let active = state.active;
  if (winner === null) {
    do active = (active + 1) % players.length;
    while (players[active].health <= 0);
  }
  const turn = winner === null ? state.turn + 1 : state.turn;
  let summary = `${shooter.name} missed the battlefield.`;
  if (visual.impacts.length) summary = `${shooter.name} reshaped the battlefield.`;
  if (damage.length) summary = damage.map(({ id, amount }) => `${players[id].name} −${amount} armour`).join(' · ');
  if (shot.weapon === 'shield') summary = `${shooter.name} armed a reactive shield.`;
  return {
    ...visual,
    summary,
    damage,
    state: { ...state, terrain, players, active, turn, wind: windAt(state.seed, turn), winner, history: [...state.history, shot] },
  };
}

export function resolveTurn(state, command) {
  return resolve(state, command, true);
}

export function replayMatch(config, commands) {
  if (!Array.isArray(commands) || commands.length > MAX_TURNS) throw new RangeError('This turn history is too long or invalid.');
  let state = createMatch(config);
  for (const command of commands) state = resolve(state, command, false).state;
  return state;
}
