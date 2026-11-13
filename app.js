import {
  WIDTH, HEIGHT, MAPS, WEAPONS, createMatch, predictShot, previewTank, resolveTurn
} from './engine.js';
import {createFrontline, frontlineWeapons, frontlineMoveLimit, isDeployment, previewFrontline, resolveFrontline} from './frontline.js?v=2.0.1';
import {planBotTurn} from './bot.js?v=2.0.1';
import BattlefieldRenderer from './renderer.js?v=2';
import {decodeTurn, encodeTurn, makeConfig} from './session.js?v=2.0.1';

const $ = id => document.getElementById(id);
const layout = document.querySelector('.layout');
const field = $('field');
const fieldBoard = $('field-board');
const compactLayout = matchMedia('(max-width: 860px), (max-height: 540px) and (max-width: 1024px)');
const renderer = new BattlefieldRenderer(field);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const storageKey = 'langsystems-tanks-match-v1';
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const options = {map: MAPS[0].id, count: 2, mode: 'local', scenario: 'frontline', difficulty: 'standard'};
const surveySeed = seed();
let match = null;
let incoming = null;
let phase = 'setup';
let waiting = false;
let recording = false;
let replacePending = false;
let weaponId = 'shell';
let selectedUnit = null;
let botTimer = null;
let botWorker = null;
let aimTank = null;
const unitNames = {tank: 'Tank', rifle: 'Rifle squad', rocket: 'AT squad'};
const actionLabels = {shield: 'Deploy shield', 'air-raid': 'Call air raid', 'air-drop': 'Drop reinforcements', hold: 'Hold position'};
const frontline = () => match?.scenario === 'frontline';
const deployment = () => frontline() && isDeployment(match);
const botTurn = () => options.mode === 'solo' && match?.active === 1 && match.winner === null;
const locked = () => waiting || recording || match.winner !== null || botTurn();

function createBoard(gameSeed) {
  const count = options.scenario === 'frontline' || options.mode !== 'local' ? 2 : options.count;
  const config = makeConfig(options.map, count, gameSeed);
  return options.scenario === 'frontline' ? createFrontline(config) : createMatch(config);
}

function friendlyUnits() {
  return match.units.filter(unit => unit.team === match.active && unit.health > 0);
}

function orderOptions() {
  if (frontline()) return selectedUnit === null ? [] : frontlineWeapons(match, selectedUnit);
  const ammo = match.players[match.active].ammo;
  return WEAPONS.map(weapon => ({...weapon, ammo: ammo[weapon.id]}));
}

function actionPreview(command) {
  return frontline() ? previewFrontline(match, command) : predictShot(match, command);
}
let frameQueued = false;
let pointerId = null;
let audio = null;
let sound = false;

function getCommand() {
  const command = {
    move: Number($('move').value),
    angle: Number($('angle').value),
    power: Number($('power').value),
    weapon: weaponId
  };
  if (frontline()) Object.assign(command, {unit: selectedUnit, target: Number($('target').value)});
  return command;
}

function announce(message) {
  $('status').textContent = message;
}

function saveMatch(board = match, pending = waiting) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      mode: options.mode,
      difficulty: options.difficulty,
      waiting: pending,
      code: encodeTurn(board)
    }));
    return true;
  } catch {
    return false;
  }
}

function readSavedMatch() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw || raw.length > 10200) return;
    const saved = JSON.parse(raw);
    if (!['local', 'link', 'solo'].includes(saved?.mode)) return;
    const restored = decodeTurn(saved.code);
    if (saved.mode !== 'local' && restored.players.length !== 2) return;
    options.difficulty = saved.difficulty === 'recruit' ? 'recruit' : 'standard';
    match = restored;
    options.mode = saved.mode;
    waiting = saved.mode === 'link' && saved.waiting === true && restored.winner === null;
  } catch {
    // A bad saved match never blocks opening the game.
  }
}

function readIncomingTurn() {
  if (recording) return;
  incoming = null;
  $('import').hidden = true;
  if ($('setup-notice').dataset.kind === 'link') notice('');
  if (!location.hash.startsWith('#turn=')) return;
  try {
    const shared = decodeTurn(location.hash.slice(6));
    if (shared.players.length !== 2) throw new Error('Shared matches require two players');
    if (phase !== 'setup') openMenu();
    incoming = shared;
    const label = incoming.winner === null
      ? `Turn ${incoming.turn} · ${incoming.players[incoming.active].name} to play`
      : 'Completed match';
    $('import-info').textContent = `Shared match · ${label}`;
    $('import').hidden = false;
    $('import-button').focus();
  } catch {
    const message = 'This turn link is invalid or incomplete. Ask for the full link.';
    if (phase === 'setup') {
      $('setup-notice').dataset.kind = 'link';
      notice(message);
    } else announce(message);
  }
}

function notice(message) {
  $('setup-notice').textContent = message;
  $('setup-notice').hidden = !message;
}

function clearLink() {
  if (location.hash.startsWith('#turn=')) history.replaceState(null, '', location.pathname + location.search);
  incoming = null;
  $('import').hidden = true;
}

function setSetup() {
  phase = 'setup';
  layout.classList.remove('in-match');
  replacePending = false;
  $('intro').hidden = false;
  $('players').hidden = true;
  $('objective-status').hidden = true;
  $('setup').hidden = false;
  $('command').hidden = true;
  $('menu-button').hidden = true;
  field.classList.remove('aiming');
  field.tabIndex = -1;
  $('resume').hidden = !match;
  $('start').firstChild.textContent = 'Start match ';
  if (match) {
    options.map = match.map;
    options.count = match.players.length;
    options.scenario = match.scenario || 'classic';
  }
  $('mode').value = options.mode;
  $('scenario').value = options.scenario;
  $('difficulty').value = options.difficulty;
  $('count').value = String(options.count);
  updateSetupPreview();
}

function updateSetupPreview() {
  const board = createBoard(surveySeed);
  for (const button of $('map-options').children) {
    button.setAttribute('aria-pressed', String(button.dataset.map === options.map));
  }
  const fixedCount = options.scenario === 'frontline' || options.mode !== 'local';
  $('count').disabled = fixedCount;
  $('count').value = fixedCount ? '2' : String(options.count);
  $('difficulty-wrap').hidden = options.mode !== 'solo';
  const modeCopy = {
    solo: 'Take turns against Ember AI. Both sides get the same starting kit.',
    link: 'Send a fresh link after each order to pass the turn.',
    local: options.scenario === 'frontline' ? 'Two sides take turns on this device.' : 'Take turns on this screen with up to four players.'
  };
  $('mode-help').textContent = modeCopy[options.mode];
  $('map-label').textContent = MAPS.find(map => map.id === options.map).name.toUpperCase();
  $('wind-label').textContent = 'FIELD PREVIEW';
  $('turn-label').textContent = 'SECTOR 01';
  $('field-hint').textContent = 'SURVEY FEED / TERRAIN PREVIEW';
  $('seed-label').textContent = '';
  renderer.draw(board, {angle: 42, reducedMotion: motion.matches});
}

function prepareTurn() {
  const tank = frontline() ? friendlyUnits()[0] : match.players[match.active];
  selectedUnit = frontline() ? tank?.id ?? null : null;
  $('move').value = 0;
  $('power').value = 68;
  aimTank = null;
  if (!tank) return;
  setUnitAim(tank);
  weaponId = orderOptions().find(weapon => weapon.ammo !== 0)?.id || 'hold';
}

function setUnitAim(tank) {
  const opponents = frontline()
    ? match.units.filter(unit => unit.team !== match.active && unit.health > 0)
    : match.players.filter(unit => unit.id !== tank.id && unit.health > 0);
  const nearest = opponents.sort((a, b) => Math.abs(a.x - tank.x) - Math.abs(b.x - tank.x))[0];
  $('angle').value = nearest && nearest.x < tank.x ? 138 : 42;
  $('move').max = frontline() ? frontlineMoveLimit(tank) : 90;
  $('move').min = -Number($('move').max);
  $('move').value = 0;
  $('target').value = nearest?.x ?? 600;
}

function selectUnit(unit) {
  if (locked() || unit.id === selectedUnit) return;
  selectedUnit = unit.id;
  setUnitAim(unit);
  weaponId = orderOptions().find(weapon => weapon.ammo !== 0)?.id || 'hold';
  buildOrders();
  drawMatch();
  $('units').querySelector('[aria-pressed="true"]').focus({preventScroll: true});
}

function setSupportTarget(weapon) {
  const actor = match.units.find(unit => unit.id === selectedUnit);
  const enemies = match.units.filter(unit => unit.team !== match.active && unit.health > 0);
  if (weapon === 'air-raid') {
    const near = enemies.sort((a, b) => Math.abs(a.x - 600) - Math.abs(b.x - 600))[0];
    $('target').value = near?.x ?? 600;
    return;
  }
  const direction = match.active === 0 ? 1 : -1;
  const command = getCommand();
  for (const distance of [180, 125, 220, 70, 265, 35, 300, 340, 390]) {
    const target = Math.round(match.objective.x - distance * direction);
    const candidate = previewFrontline(match, {...command, target}, {record: false});
    if (candidate.valid !== false) {
      $('target').value = target;
      return;
    }
  }
  $('target').value = actor.x;
}

function playerCards() {
  const elements = match.players.map((tank, index) => {
    const card = document.createElement('div');
    card.className = 'player';
    card.style.setProperty('--team', tank.color);
    card.classList.toggle('active', index === match.active && match.winner === null);
    card.classList.toggle('out', tank.health <= 0);
    const heading = document.createElement('div');
    heading.className = 'player-heading';
    const name = document.createElement('b');
    name.textContent = tank.name + (options.mode === 'solo' && index === 1 ? ' · AI' : '');
    const health = document.createElement('small');
    health.textContent = tank.health > 0
      ? `${Math.ceil(tank.health)} HP${tank.shield ? ' · SHIELD' : ''}`
      : 'OUT';
    heading.append(name, health);
    const progress = document.createElement('progress');
    progress.max = tank.maxHealth || 100;
    progress.value = tank.health;
    progress.setAttribute('aria-label', `${tank.name} health`);
    card.append(heading, progress);
    return card;
  });
  $('players').replaceChildren(...elements);
}

function buildOrders() {
  $('unit-picker').hidden = !frontline();
  if (frontline()) {
    const cards = friendlyUnits().map(unit => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'weapon';
      button.setAttribute('aria-pressed', String(unit.id === selectedUnit));
      button.disabled = locked();
      const name = document.createElement('b');
      name.textContent = unitNames[unit.type];
      const health = document.createElement('small');
      health.textContent = unit.health + ' HP';
      button.append(name, health);
      button.addEventListener('click', () => selectUnit(unit));
      return button;
    });
    $('units').replaceChildren(...cards);
  }
  const cards = orderOptions().map(weapon => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'weapon';
    button.dataset.weapon = weapon.id;
    button.disabled = locked() || weapon.ammo === 0;
    const name = document.createElement('b');
    name.textContent = weapon.name;
    const ammo = document.createElement('small');
    ammo.textContent = weapon.ammo === null ? 'UNLIMITED' : weapon.ammo + ' LEFT';
    button.append(name, ammo);
    button.addEventListener('click', () => {
      weaponId = weapon.id;
      if (weapon.targeted) setSupportTarget(weapon.id);
      syncOrderControls();
      queueDraw();
    });
    return button;
  });
  $('weapons').replaceChildren(...cards);
  syncOrderControls();
}

function syncOrderControls() {
  const weapon = orderOptions().find(item => item.id === weaponId);
  if (!weapon) return;
  for (const button of $('weapons').children) {
    button.setAttribute('aria-pressed', String(button.dataset.weapon === weaponId));
  }
  const aiming = !weapon.targeted && !['hold', 'shield'].includes(weapon.id);
  $('angle-row').hidden = !aiming;
  $('power-row').hidden = !aiming;
  $('target-row').hidden = !weapon.targeted;
  $('orders-label').hidden = deployment();
  $('weapons').hidden = deployment();
  $('weapon-info').textContent = deployment()
    ? 'Reposition one unit or hold. Attacks and air support unlock after both sides deploy.'
    : weapon.description;
  $('fire').firstChild.textContent = (deployment() ? 'Finish deployment' : actionLabels[weapon.id] || 'Fire') + ' ';
  field.classList.toggle('aiming', !locked() && (aiming || weapon.targeted));
  $('field-hint').textContent = deployment() ? 'DEPLOYMENT / POSITION ONE UNIT'
    : weapon.targeted ? 'TAP THE FIELD TO SET TARGET'
    : aiming ? 'DRAG TO AIM / ONE ORDER PER TURN' : 'ONE ORDER PER TURN';
}

function showObjective() {
  $('objective-status').hidden = !frontline();
  if (!frontline()) return;
  const {owner, contested, goal} = match.objective;
  let control = 'unoccupied';
  if (contested) control = 'contested';
  else if (owner !== null) control = 'held by ' + match.players[owner].name;
  $('objective-status').textContent = 'RELAY ' + control.toUpperCase() + ' · TIDE ' + match.scores[0] + ' / ' + goal + ' · EMBER ' + match.scores[1] + ' / ' + goal;
}

function shareUrl() {
  return `${location.origin}${location.pathname}#turn=${encodeTurn(match)}`;
}

function renderMatch() {
  phase = 'match';
  layout.classList.add('in-match');
  const ended = match.winner !== null;
  const tank = match.players[match.active];
  const winner = typeof match.winner === 'number' ? match.players[match.winner] : null;
  $('intro').hidden = true;
  $('setup').hidden = true;
  $('players').hidden = false;
  $('command').hidden = false;
  $('menu-button').hidden = false;
  $('menu-button').disabled = recording;
  $('controls').hidden = waiting || ended || botTurn();
  $('bot-status').hidden = !botTurn() || recording;
  $('bot-status').textContent = deployment() ? 'Ember is choosing a deployment position.' : 'Ember is planning an order.';
  $('orders-label').textContent = frontline() ? 'ORDERS' : 'ARSENAL';
  $('result').hidden = !ended;
  $('handoff').hidden = !waiting && !(ended && options.mode === 'link');
  $('continue').hidden = ended;
  $('active-title').textContent = ended
    ? (winner ? `${winner.name} wins` : 'Draw')
    : (waiting ? 'Pass the turn' : botTurn() ? 'Ember AI' : `${tank.name}’s turn`);
  $('result-copy').textContent = winner
    ? `${winner.name} finished with ${Math.ceil(winner.health)} HP after ${match.history.length} turns.`
    : `The battle ends in a draw after ${match.history.length} turns.`;
  $('map-label').textContent = MAPS.find(map => map.id === match.map).name.toUpperCase();
  const windDirection = match.wind < 0 ? '←' : '→';
  $('wind-label').textContent = deployment() ? 'DEPLOYMENT' : match.wind ? `WIND ${windDirection} ${Math.abs(match.wind)}` : 'WIND CALM';
  $('turn-label').textContent = `TURN ${String(match.turn).padStart(2, '0')}`;
  $('seed-label').textContent = `FIELD ${match.seed.toString(16).toUpperCase().padStart(8, '0')}`;
  $('field-hint').textContent = ended ? 'MATCH COMPLETE' : waiting ? 'NEXT TURN READY' : 'DRAG TO AIM / ONE SHOT PER TURN';
  if (!$('handoff').hidden) {
    $('share-url').value = shareUrl();
    $('copy').firstChild.textContent = ended ? 'Copy result link ' : 'Copy next-turn link ';
    $('handoff-copy').textContent = ended
      ? 'Send the final position to your opponent.'
      : `Send this link to ${tank.name} so they can take their turn.`;
  }
  field.classList.remove('aiming');
  field.tabIndex = locked() ? -1 : 0;
  for (const id of ['angle', 'power', 'move', 'target', 'fire']) $(id).disabled = locked();
  playerCards();
  showObjective();
  if (!$('controls').hidden) buildOrders();
  drawMatch();
  scheduleBot();
}

function drawMatch() {
  if (phase !== 'match' || recording) return;
  if (locked()) {
    renderer.draw(match, {reducedMotion: motion.matches});
    return;
  }
  const command = getCommand();
  const weapon = orderOptions().find(item => item.id === weaponId);
  const preview = actionPreview(command);
  aimTank = preview.tank;
  const actor = frontline() ? match.units.find(unit => unit.id === selectedUnit) : match.players[match.active];
  const travel = Math.round(aimTank.x - actor.x);
  const direction = travel < 0 ? '← ' : '→ ';
  $('angle-value').textContent = command.angle + '°';
  $('power-value').textContent = command.power + '%';
  $('move-value').textContent = (travel ? direction + Math.abs(travel) : '0') + ' / ' + $('move').max;
  $('target-value').textContent = 'GRID ' + String(command.target).padStart(4, '0');
  $('order-note').hidden = preview.valid !== false;
  $('order-note').textContent = preview.reason || '';
  $('fire').disabled = preview.valid === false;
  renderer.draw(match, {
    angle: command.angle,
    previewTank: aimTank,
    selectedUnit,
    target: weapon.targeted ? command.target : undefined,
    action: command.weapon,
    paths: preview.paths.map(path => path.filter(point => point.t <= .65)),
    reducedMotion: motion.matches
  });
}

function queueDraw() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    drawMatch();
  });
}

function focusMatch(revealBoard = false) {
  const action = match.winner !== null ? $('rematch') : waiting ? $('copy') : null;
  if (revealBoard && compactLayout.matches) window.scrollTo({top: layout.offsetTop});
  if (!botTurn()) (action || field).focus({preventScroll: !action});
}

function startMatch() {
  cancelBot();
  match = createBoard(seed());
  waiting = false;
  clearLink();
  prepareTurn();
  renderMatch();
  const saved = saveMatch();
  const instruction = deployment() ? 'Choose a unit and set its opening position.' : frontline() ? 'Choose a unit and issue its first order.' : 'Choose a weapon, line up your shot and fire.';
  announce(saved ? instruction : 'Match started. This browser could not save progress.');
  focusMatch(true);
}

function texture(context, output, layers) {
  const now = context.currentTime;
  for (const [delay, duration, frequency, resonance, level] of layers) {
    const source = context.createBufferSource();
    const frames = Math.ceil(context.sampleRate * duration);
    source.buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = source.buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      const attack = Math.min(1, i / (context.sampleRate * .0015));
      data[i] = (Math.random() * 2 - 1) * attack * (1 - i / frames) ** 2;
    }
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = resonance;
    const gain = context.createGain();
    gain.gain.value = level;
    source.connect(filter).connect(gain).connect(output);
    source.start(now + delay);
  }
}

function tone(kind) {
  if (!sound) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    audio ??= new Audio();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    texture(audio, audio.destination, kind === 'impact' ? [
      [0, .06, 1200, .55, .52], [.007, .43, 145, .65, .85],
      [.048, .29, 380, .6, .45], [.13, .21, 980, .65, .22],
    ] : [[0, .047, 1700, .62, .47], [.003, .19, 210, .7, .62]]);
  } catch {
    // Sound is optional.
  }
}

function fire() {
  if (phase !== 'match' || locked()) return;
  performOrder(getCommand());
}

function performOrder(command) {
  let result;
  try {
    result = frontline() ? resolveFrontline(match, command) : resolveTurn(match, command);
  } catch (error) {
    announce(error.message || 'This order is unavailable.');
    return false;
  }
  const before = match;
  const nextWaiting = options.mode === 'link' && result.state.winner === null;
  const saved = saveMatch(result.state, nextWaiting);
  const shooter = before.players[before.active].name;
  recording = true;
  renderMatch();
  const bounds = field.getBoundingClientRect();
  if (!motion.matches && result.duration && compactLayout.matches &&
      (bounds.top < 0 || bounds.bottom > innerHeight)) {
    field.scrollIntoView({block: 'center'});
  }
  announce(shooter + (frontline() ? ' issues an order.' : ' fires.'));
  tone('fire');
  const finish = () => {
    match = result.state;
    waiting = nextWaiting;
    recording = false;
    prepareTurn();
    renderMatch();
    announce(`${result.summary}${saved ? '' : ' Progress could not be saved on this device.'}`);
    focusMatch(!botTurn());
    readIncomingTurn();
  };
  if (motion.matches || !result.duration) {
    finish();
    return true;
  }
  const started = performance.now();
  const playbackRate = Math.max(1.35, result.duration / 3.5);
  let sounded = false;
  function frame(now) {
    const elapsed = (now - started) / 1000 * playbackRate;
    if (!sounded && result.impacts.some(impact => elapsed >= impact.t)) {
      sounded = true;
      tone('impact');
    }
    if (elapsed >= result.duration + .36) {
      finish();
      return;
    }
    renderer.draw(before, {
      angle: command.angle,
      previewTank: result.tank,
      selectedUnit: command.unit,
      target: command.target,
      action: command.weapon,
      paths: result.paths,
      impacts: result.impacts,
      elapsed
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return true;
}

function cancelBot() {
  clearTimeout(botTimer);
  botTimer = null;
  botWorker?.terminate();
  botWorker = null;
}

function scheduleBot() {
  if (!botTurn() || recording || botTimer !== null || botWorker) return;
  const board = match;
  const difficulty = options.difficulty;
  botTimer = setTimeout(() => {
    botTimer = null;
    if (phase !== 'match' || recording || match !== board || !botTurn()) return;
    function complete(command) {
      if (phase !== 'match' || recording || match !== board || !botTurn()) return;
      cancelBot();
      if (command && performOrder(command)) return;
      const fallback = frontline()
        ? {unit: friendlyUnits()[0].id, move: 0, angle: 90, power: 60, weapon: 'hold', target: 600}
        : {move: 0, angle: 138, power: 60, weapon: 'shell'};
      performOrder(fallback);
    }
    function planHere() {
      complete(planBotTurn(board, {difficulty}));
    }
    try {
      botWorker = new Worker(new URL('./bot.js?v=2.0.1', import.meta.url), {type: 'module'});
      botWorker.onmessage = event => complete(event.data);
      botWorker.onerror = event => {
        event.preventDefault();
        planHere();
      };
      botWorker.postMessage({board, difficulty});
    } catch {
      planHere();
    }
  }, 520);
}

function clearReplacement() {
  replacePending = false;
  $('start').firstChild.textContent = 'Start match ';
  if ($('setup-notice').dataset.kind === 'replace') notice('');
}

for (const map of MAPS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-option';
  button.dataset.map = map.id;
  const tile = document.createElement('span');
  tile.className = `map-tile ${map.id}`;
  tile.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  const title = document.createElement('b');
  title.textContent = map.name;
  const description = document.createElement('small');
  description.textContent = map.description;
  copy.append(title, description);
  button.append(tile, copy);
  button.addEventListener('click', () => {
    options.map = map.id;
    clearReplacement();
    updateSetupPreview();
  });
  $('map-options').append(button);
}
$('scenario').addEventListener('change', () => {
  options.scenario = $('scenario').value;
  clearReplacement();
  updateSetupPreview();
});
$('difficulty').addEventListener('change', () => {
  options.difficulty = $('difficulty').value;
  clearReplacement();
});
$('mode').addEventListener('change', () => {
  options.mode = $('mode').value;
  clearReplacement();
  updateSetupPreview();
});
$('count').addEventListener('change', () => {
  options.count = Number($('count').value);
  clearReplacement();
  updateSetupPreview();
});
$('start').addEventListener('click', () => {
  if (match && match.winner === null && !replacePending) {
    replacePending = true;
    $('setup-notice').dataset.kind = 'replace';
    notice('Starting a new match replaces your saved match. Select Start new match to continue.');
    $('start').firstChild.textContent = 'Start new match ';
    return;
  }
  startMatch();
});
$('resume').addEventListener('click', () => {
  options.map = match.map;
  options.count = match.players.length;
  Object.assign(options, savedSettings);
  options.scenario = match.scenario || 'classic';
  prepareTurn();
  renderMatch();
  announce('Saved match resumed.');
  focusMatch(true);
});
$('import-button').addEventListener('click', () => {
  if (!incoming) return;
  if (match && match.winner === null && encodeTurn(match) !== encodeTurn(incoming) &&
      !window.confirm('Open this shared turn and replace your saved match?')) return;
  cancelBot();
  match = incoming;
  options.scenario = match.scenario || 'classic';
  options.mode = 'link';
  options.count = match.players.length;
  options.map = match.map;
  waiting = false;
  clearLink();
  prepareTurn();
  renderMatch();
  const saved = saveMatch();
  announce(saved ? 'Shared match opened.' : 'Shared match opened. Progress could not be saved.');
  focusMatch(true);
});
let savedSettings;
function openMenu() {
  if (recording) return;
  cancelBot();
  savedSettings = {mode: options.mode, difficulty: options.difficulty};
  setSetup();
  announce('');
  $('start').focus({preventScroll: true});
}
$('menu-button').addEventListener('click', openMenu);
$('result-menu').addEventListener('click', openMenu);
$('rematch').addEventListener('click', startMatch);
$('fire').addEventListener('click', fire);
$('continue').addEventListener('click', () => {
  waiting = false;
  saveMatch();
  renderMatch();
  announce(`${match.players[match.active].name} takes the next turn on this device.`);
  focusMatch(true);
});
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('share-url').value);
    announce('Link copied. Send it to your opponent.');
  } catch {
    $('share-url').focus();
    $('share-url').select();
    announce('Copy the selected link and send it to your opponent.');
  }
});
$('sound').addEventListener('click', () => {
  sound = !sound;
  $('sound').textContent = sound ? 'Sound on' : 'Sound off';
  $('sound').setAttribute('aria-pressed', String(sound));
  if (sound) tone('fire');
});
for (const id of ['angle', 'power', 'move', 'target']) $(id).addEventListener('input', queueDraw);

function aimAt(event) {
  const rect = field.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * WIDTH;
  const y = (event.clientY - rect.top) / rect.height * HEIGHT;
  const weapon = orderOptions().find(item => item.id === weaponId);
  if (weapon.targeted) {
    $('target').value = Math.round(x);
    queueDraw();
    return;
  }
  const tank = aimTank || (frontline() ? match.units.find(unit => unit.id === selectedUnit) : previewTank(match, Number($('move').value)));
  const angle = Math.atan2(Math.max(0, tank.y - 16 - y), x - tank.x) * 180 / Math.PI;
  $('angle').value = Math.round(angle);
  queueDraw();
}
field.addEventListener('pointerdown', event => {
  if (!field.classList.contains('aiming') || pointerId !== null || event.button !== 0) return;
  pointerId = event.pointerId;
  field.setPointerCapture(pointerId);
  aimAt(event);
});
field.addEventListener('pointermove', event => {
  if (event.pointerId === pointerId && field.classList.contains('aiming')) aimAt(event);
});
field.addEventListener('lostpointercapture', () => { pointerId = null; });
window.addEventListener('keydown', event => {
  if (phase !== 'match' || locked() ||
      event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest?.('input, button, select, a, summary')) return;
  const actions = {
    KeyA: ['move', -6], KeyD: ['move', 6], ArrowLeft: ['angle', 1],
    ArrowRight: ['angle', -1], ArrowUp: ['power', 1], ArrowDown: ['power', -1]
  };
  const action = actions[event.code];
  if (frontline() && !$('target-row').hidden && ['ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
    $('target').value = Number($('target').value) + (event.code === 'ArrowLeft' ? -12 : 12);
    queueDraw();
    return;
  }
  if (action) {
    event.preventDefault();
    const [id, amount] = action;
    $(id).value = Number($(id).value) + amount;
    queueDraw();
  }
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    fire();
  }
});
function resizeField() {
  if (phase === 'match') queueDraw();
  else updateSetupPreview();
}
motion.addEventListener('change', resizeField);
window.addEventListener('resize', resizeField);
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--battlefield-height', fieldBoard.offsetHeight + 'px');
}).observe(fieldBoard);
window.addEventListener('hashchange', readIncomingTurn);

readSavedMatch();
savedSettings = {mode: options.mode, difficulty: options.difficulty};
setSetup();
readIncomingTurn();
