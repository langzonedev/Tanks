import {MAX_MOVE, WEAPONS, predictShot} from './engine.js';
import {frontlineMoveLimit, frontlineWeapons, previewFrontline} from './frontline.js?v=2.0.1';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const take = (values, standard) => standard ? values : values.filter((_, index) => index % 2 === 0);

function seededNoise(seed, turn) {
  let state = (seed ^ Math.imul(turn, 0x85ebca6b)) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shotScore(preview, enemies, actor, weapon) {
  let score = -16;
  for (const impact of preview.impacts) {
    const nearest = Math.min(...enemies.map(target => Math.hypot(target.x - impact.x, target.y - 12 - impact.y)));
    const damage = impact.radius && nearest < impact.radius ? weapon.damage * (1 - nearest / impact.radius) : 0;
    score = Math.max(score, damage || -nearest / 22);
    if (impact.direct === actor.id) score -= 55;
    else if (Math.abs(impact.x - preview.tank.x) < impact.radius * .6) score -= 22;
  }
  return score;
}

function frontlineScore(board, units, preview, command) {
  const damage = new Map(preview.damage.map(hit => [hit.id, hit.amount]));
  let score = 0;
  const holdsCentre = unit => Math.abs(unit.x - board.objective.x) <= board.objective.radius;
  let ours = false;
  let theirs = false;
  for (const unit of units) {
    const amount = damage.get(unit.id) || 0;
    const friendly = unit.team === board.active;
    score += friendly ? -amount * 1.35 : amount;
    if (amount >= unit.health) score += friendly ? -24 : 27;
    if (amount >= unit.health) continue;
    const end = unit.id === preview.tank.id ? preview.tank : unit;
    if (holdsCentre(end)) {
      if (friendly) ours = true;
      else theirs = true;
    }
  }
  if (command.weapon === 'air-drop' && holdsCentre({x: command.target})) ours = true;
  if (ours && !theirs) {
    const maintained = board.rulesVersion === 2 || board.objective.owner === board.active;
    score += maintained && board.scores[board.active] + 1 >= board.objective.goal ? 180 : maintained ? 33 : 26;
  }
  if (theirs && board.objective.owner === 1 - board.active) {
    score += ours ? 25 : -15;
  }
  const advance = Math.abs(preview.tank.x - board.objective.x);
  const current = units.find(unit => unit.id === command.unit);
  score += (Math.abs(current.x - board.objective.x) - advance) / 13;
  if (command.weapon === 'air-drop') score += 14 + Math.max(0, 300 - Math.abs(command.target - board.objective.x)) / 19;
  if (command.weapon === 'air-raid') score -= 22;
  if (command.weapon === 'rocket' || command.weapon === 'heavy') score -= 8;
  if (command.weapon === 'hold') score -= 2;
  return score;
}

function targetChoices(actor, enemies, board, weapon) {
  if (weapon === 'air-drop') {
    const direction = Math.sign(board.objective.x - actor.x) || 1;
    const near = board.objective.x - direction * (board.objective.radius + 35);
    return [board.objective.x, board.objective.x - direction * 64, board.objective.x + direction * 64, near, near - direction * 52, actor.x + direction * 55, actor.x - direction * 55];
  }
  return enemies.map(unit => unit.x);
}

export function planBotTurn(board, {difficulty = 'standard'} = {}) {
  if (board.winner !== null) return null;
  const standard = difficulty !== 'recruit';
  const frontline = board.scenario === 'frontline';
  const units = frontline ? board.units.filter(unit => unit.health > 0) : board.players.filter(unit => unit.health > 0);
  const friendly = unit => frontline ? unit.team === board.active : unit.id === board.active;
  const friends = units.filter(friendly);
  const enemies = units.filter(unit => !friendly(unit));
  if (!friends.length || !enemies.length) return null;
  const random = seededNoise(board.seed, board.turn);
  let best = null;
  let bestScore = -Infinity;

  function consider(command, actor, weapon) {
    let score;
    try {
      const preview = frontline
        ? previewFrontline(board, command, {record: false})
        : predictShot(board, command);
      if (preview.valid === false) return;
      score = frontline
        ? frontlineScore(board, units, preview, command)
        : shotScore(preview, enemies, actor, weapon) - (weapon.id === 'heavy' ? 10 : 0);
    } catch {
      return;
    }
    if (!standard) score += random() * 22 - 11;
    if (score > bestScore) {
      best = command;
      bestScore = score;
    }
  }

  for (const actor of friends) {
    const nearest = [...enemies].sort((a, b) => Math.abs(a.x - actor.x) - Math.abs(b.x - actor.x))[0];
    const limit = frontline ? frontlineMoveLimit(actor) : MAX_MOVE;
    const centre = frontline ? board.objective.x : nearest.x;
    const direction = Math.sign(centre - actor.x) || 1;
    const towards = direction * Math.min(limit, Math.abs(centre - actor.x));
    const moves = [...new Set([0, Math.round(towards), ...(standard ? [Math.round(-towards * .55)] : [])])];
    const weapons = frontline
      ? frontlineWeapons(board, actor.id)
      : WEAPONS.filter(weapon => actor.ammo[weapon.id] !== 0 && ['shell', 'heavy'].includes(weapon.id));
    for (const weapon of weapons) {
      if (weapon.ammo === 0) continue;
      const command = {move: 0, angle: 42, power: 70, weapon: weapon.id};
      if (frontline) Object.assign(command, {unit: actor.id, target: 600});
      if (weapon.targeted) {
        for (const target of targetChoices(actor, enemies, board, weapon.id)) {
          consider({...command, move: Math.round(towards), target: clamp(Math.round(target), 32, 1168)}, actor, weapon);
        }
      } else if (weapon.id === 'hold') {
        for (const move of moves) consider({...command, move}, actor, weapon);
      } else {
        const angles = weapon.id === 'rifle' ? [0, 9, 19, 30, 43] : [14, 27, 40, 53, 66, 78];
        const powers = weapon.id === 'rifle' ? [55, 80, 100] : [32, 45, 58, 70, 82, 92, 100];
        for (const move of moves) {
          const left = nearest.x < actor.x + move;
          for (const angle of take(angles, standard)) {
            for (const power of take(powers, standard)) {
              consider({...command, move, angle: left ? 180 - angle : angle, power}, actor, weapon);
            }
          }
        }
      }
    }
  }

  if (standard && best && !['hold', 'air-drop', 'air-raid'].includes(best.weapon)) {
    const candidate = best;
    const actor = friends.find(unit => unit.id === (frontline ? candidate.unit : board.active));
    const weapon = (frontline ? frontlineWeapons(board, actor.id) : WEAPONS).find(item => item.id === candidate.weapon);
    for (const angle of [-6, -3, 0, 3, 6]) {
      for (const power of [-8, -4, 0, 4, 8]) {
        consider({...candidate, angle: clamp(candidate.angle + angle, 0, 180), power: clamp(candidate.power + power, 10, 100)}, actor, weapon);
      }
    }
  }
  return best;
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.addEventListener('message', event => {
    const {board, difficulty} = event.data;
    self.postMessage(planBotTurn(board, {difficulty}));
  });
}
