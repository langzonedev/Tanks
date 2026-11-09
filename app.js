import {
  WIDTH, HEIGHT, MAPS, WEAPONS, createMatch, predictShot, previewTank, resolveTurn
} from './engine.js';
import BattlefieldRenderer from './renderer.js';
import {decodeTurn, encodeTurn, makeConfig} from './session.js';

const $ = id => document.getElementById(id);
const field = $('field');
const renderer = new BattlefieldRenderer(field);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const storageKey = 'langsystems-tanks-match-v1';
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const options = {map: MAPS[0].id, count: 2, mode: 'local'};
const surveySeed = seed();
let match = null;
let incoming = null;
let phase = 'setup';
let waiting = false;
let recording = false;
let replacePending = false;
let weaponId = 'shell';
let frameQueued = false;
let pointerId = null;
let audio = null;
let sound = false;

function getCommand() {
  return {
    move: Number($('move').value),
    angle: Number($('angle').value),
    power: Number($('power').value),
    weapon: weaponId
  };
}

function announce(message) {
  $('status').textContent = message;
}

function saveMatch(board = match, pending = waiting) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      mode: options.mode,
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
    if (!['local', 'link'].includes(saved?.mode)) return;
    const restored = decodeTurn(saved.code);
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
  replacePending = false;
  $('intro').hidden = false;
  $('players').hidden = true;
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
  }
  $('mode').value = options.mode;
  $('count').value = String(options.count);
  updateSetupPreview();
}

function updateSetupPreview() {
  const count = options.mode === 'link' ? 2 : options.count;
  const board = createMatch(makeConfig(options.map, count, surveySeed));
  for (const button of $('map-options').children) {
    button.setAttribute('aria-pressed', String(button.dataset.map === options.map));
  }
  $('count').disabled = options.mode === 'link';
  $('mode-help').textContent = options.mode === 'link'
    ? 'Two players. Send a fresh link after each shot to pass the turn.'
    : 'Take turns on this screen with up to four players.';
  $('map-label').textContent = MAPS.find(map => map.id === options.map).name.toUpperCase();
  $('wind-label').textContent = 'FIELD PREVIEW';
  $('turn-label').textContent = 'SECTOR 01';
  $('field-hint').textContent = 'SURVEY FEED / TERRAIN PREVIEW';
  $('seed-label').textContent = '';
  renderer.draw(board, {angle: 42, reducedMotion: motion.matches});
}

function prepareTurn() {
  const tank = match.players[match.active];
  const opponent = match.players.find(player => player.id !== tank.id && player.health > 0);
  $('angle').value = opponent && opponent.x < tank.x ? 138 : 42;
  $('power').value = 68;
  $('move').value = 0;
  weaponId = 'shell';
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
    name.textContent = tank.name;
    const health = document.createElement('small');
    health.textContent = tank.health > 0
      ? `${Math.ceil(tank.health)} HP${tank.shield ? ' · SHIELD' : ''}`
      : 'OUT';
    heading.append(name, health);
    const progress = document.createElement('progress');
    progress.max = 100;
    progress.value = tank.health;
    progress.setAttribute('aria-label', `${tank.name} health`);
    card.append(heading, progress);
    return card;
  });
  $('players').replaceChildren(...elements);
}

function weaponButtons() {
  const tank = match.players[match.active];
  for (const button of $('weapons').children) {
    const ammo = tank.ammo[button.dataset.weapon];
    button.disabled = recording || ammo === 0;
    button.setAttribute('aria-pressed', String(button.dataset.weapon === weaponId));
    button.querySelector('small').textContent = ammo === null ? 'UNLIMITED' : `${ammo} LEFT`;
  }
  const weapon = WEAPONS.find(item => item.id === weaponId);
  $('weapon-info').textContent = weapon.description;
  $('fire').firstChild.textContent = weaponId === 'shield' ? 'Deploy shield ' : 'Fire ';
}

function shareUrl() {
  return `${location.origin}${location.pathname}#turn=${encodeTurn(match)}`;
}

function renderMatch() {
  phase = 'match';
  const ended = match.winner !== null;
  const tank = match.players[match.active];
  const winner = typeof match.winner === 'number' ? match.players[match.winner] : null;
  $('intro').hidden = true;
  $('setup').hidden = true;
  $('players').hidden = false;
  $('command').hidden = false;
  $('menu-button').hidden = false;
  $('menu-button').disabled = recording;
  $('controls').hidden = waiting || ended;
  $('result').hidden = !ended;
  $('handoff').hidden = !waiting && !(ended && options.mode === 'link');
  $('continue').hidden = ended;
  $('active-title').textContent = ended
    ? (winner ? `${winner.name} wins` : 'Draw')
    : (waiting ? 'Pass the turn' : `${tank.name}’s turn`);
  $('result-copy').textContent = winner
    ? `${winner.name} finished with ${Math.ceil(winner.health)} HP after ${match.history.length} shots.`
    : `The battle ends in a draw after ${match.history.length} turns.`;
  $('map-label').textContent = MAPS.find(map => map.id === match.map).name.toUpperCase();
  const windDirection = match.wind < 0 ? '←' : '→';
  $('wind-label').textContent = match.wind ? `WIND ${windDirection} ${Math.abs(match.wind)}` : 'WIND CALM';
  $('turn-label').textContent = `TURN ${String(match.turn).padStart(2, '0')}`;
  $('seed-label').textContent = `FIELD ${match.seed.toString(16).toUpperCase().padStart(8, '0')}`;
  $('field-hint').textContent = ended ? 'MATCH COMPLETE' : waiting ? 'NEXT TURN READY' : 'DRAG TO AIM / ONE SHOT PER TURN';
  if (!$('handoff').hidden) {
    $('share-url').value = shareUrl();
    $('copy').firstChild.textContent = ended ? 'Copy result link ' : 'Copy next-turn link ';
    $('handoff-copy').textContent = ended
      ? 'Send the final position to your opponent.'
      : `Send this link to ${tank.name} so they can take their shot.`;
  }
  const locked = waiting || ended || recording;
  field.classList.toggle('aiming', !locked);
  field.tabIndex = locked ? -1 : 0;
  for (const id of ['angle', 'power', 'move', 'fire']) $(id).disabled = locked;
  playerCards();
  weaponButtons();
  drawMatch();
}

function drawMatch() {
  if (phase !== 'match' || recording) return;
  if (waiting || match.winner !== null) {
    renderer.draw(match, {reducedMotion: motion.matches});
    return;
  }
  const command = getCommand();
  const tank = previewTank(match, command.move);
  const preview = predictShot(match, command);
  const travel = Math.round(tank.x - match.players[match.active].x);
  $('angle-value').textContent = `${command.angle}°`;
  $('power-value').textContent = `${command.power}%`;
  $('move-value').textContent = travel ? `${travel < 0 ? '←' : '→'} ${Math.abs(travel)} / 90` : '0 / 90';
  renderer.draw(match, {
    angle: command.angle,
    previewTank: tank,
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

function startMatch() {
  const count = options.mode === 'link' ? 2 : options.count;
  match = createMatch(makeConfig(options.map, count, seed()));
  waiting = false;
  clearLink();
  prepareTurn();
  renderMatch();
  const saved = saveMatch();
  announce(saved ? 'Choose a weapon, line up your shot and fire.' : 'Match started. This browser could not save progress.');
  field.focus({preventScroll: true});
}

function tone(kind) {
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    oscillator.type = kind === 'impact' ? 'triangle' : 'sawtooth';
    oscillator.frequency.setValueAtTime(kind === 'impact' ? 118 : 220, now);
    oscillator.frequency.exponentialRampToValueAtTime(34, now + .18);
    gain.gain.setValueAtTime(.10, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .25);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(now + .26);
  } catch {
    // Sound is optional.
  }
}

function fire() {
  if (phase !== 'match' || waiting || recording || match.winner !== null) return;
  const command = getCommand();
  let result;
  try {
    result = resolveTurn(match, command);
  } catch {
    announce('This shot is unavailable. Choose another weapon and try again.');
    return;
  }
  const before = match;
  const nextWaiting = options.mode === 'link' && result.state.winner === null;
  const saved = saveMatch(result.state, nextWaiting);
  const shooter = before.players[before.active].name;
  recording = true;
  renderMatch();
  if (matchMedia('(max-width: 860px)').matches) field.scrollIntoView({block: 'center'});
  announce(`${shooter} ${command.weapon === 'shield' ? 'deploys a shield' : 'fires'}.`);
  tone('fire');
  const finish = () => {
    match = result.state;
    waiting = nextWaiting;
    recording = false;
    prepareTurn();
    renderMatch();
    announce(`${result.summary}${saved ? '' : ' Progress could not be saved on this device.'}`);
    const focus = match.winner !== null ? $('rematch') : waiting ? $('copy') : field;
    focus.focus({preventScroll: true});
    readIncomingTurn();
  };
  if (motion.matches || !result.duration) {
    finish();
    return;
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
      paths: result.paths,
      impacts: result.impacts,
      elapsed
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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
for (const weapon of WEAPONS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'weapon';
  button.dataset.weapon = weapon.id;
  const label = document.createElement('b');
  label.textContent = weapon.name;
  button.append(label, document.createElement('small'));
  button.addEventListener('click', () => {
    weaponId = weapon.id;
    weaponButtons();
    queueDraw();
  });
  $('weapons').append(button);
}
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
  options.mode = savedMode;
  prepareTurn();
  renderMatch();
  announce('Saved match resumed.');
});
$('import-button').addEventListener('click', () => {
  if (!incoming) return;
  if (match && match.winner === null && encodeTurn(match) !== encodeTurn(incoming) &&
      !window.confirm('Open this shared turn and replace your saved match?')) return;
  match = incoming;
  options.mode = 'link';
  options.count = match.players.length;
  options.map = match.map;
  waiting = false;
  clearLink();
  prepareTurn();
  renderMatch();
  const saved = saveMatch();
  announce(saved ? 'Shared match opened.' : 'Shared match opened. Progress could not be saved.');
  (match.winner === null ? field : $('rematch')).focus({preventScroll: true});
});
let savedMode = 'local';
function openMenu() {
  if (recording) return;
  savedMode = options.mode;
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
  field.focus({preventScroll: true});
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
for (const id of ['angle', 'power', 'move']) $(id).addEventListener('input', queueDraw);

function aimAt(event) {
  const rect = field.getBoundingClientRect();
  const tank = previewTank(match, Number($('move').value));
  const x = (event.clientX - rect.left) / rect.width * WIDTH;
  const y = (event.clientY - rect.top) / rect.height * HEIGHT;
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
  if (phase !== 'match' || recording || waiting || match.winner !== null ||
      event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest?.('input, button, select, a, summary')) return;
  const actions = {
    KeyA: ['move', -6], KeyD: ['move', 6], ArrowLeft: ['angle', 1],
    ArrowRight: ['angle', -1], ArrowUp: ['power', 1], ArrowDown: ['power', -1]
  };
  const action = actions[event.code];
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
window.addEventListener('hashchange', readIncomingTurn);

readSavedMatch();
savedMode = options.mode;
setSetup();
readIncomingTurn();
