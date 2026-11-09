// Original procedural artwork. The renderer only reads match data.
import { COLORS as PLAYER_COLORS, HEIGHT, WIDTH } from './engine.js';

const TAU = 2 * Math.PI;

const SCENES = {
  badlands: {
    sky: ['#10192b', '#34455e', '#87606a', '#e9a175'],
    glow: '#efaa78',
    sun: '#ffe2b4',
    sunX: 0.72,
    far: '#7f687b',
    middle: '#514959',
    near: '#2e3545',
    rock: ['#a57055', '#58433f', '#252a35', '#171e28'],
    edge: '#f3b786',
    strata: ['#efab7340', '#1c232f4d', '#c7896d30'],
    seed: 1849,
  },
  ridge: {
    sky: ['#101828', '#2b4560', '#586682', '#c891a4'],
    glow: '#b7b9ef',
    sun: '#e4e2f5',
    sunX: 0.26,
    far: '#68698a',
    middle: '#404963',
    near: '#252f44',
    rock: ['#787387', '#49465d', '#292d43', '#181d2c'],
    edge: '#bfb7df',
    strata: ['#cec3ec3d', '#24273d4d', '#9489b536'],
    seed: 2421,
  },
  basin: {
    sky: ['#101c2c', '#284b57', '#547b73', '#d6b37a'],
    glow: '#e4bd82',
    sun: '#ffe5b0',
    sunX: 0.64,
    far: '#798b7c',
    middle: '#445d5c',
    near: '#293e44',
    rock: ['#8d8060', '#585748', '#303a3b', '#191f29'],
    edge: '#e8c79b',
    strata: ['#dac18645', '#2432394d', '#a9a87c38'],
    seed: 4180,
  },
};

const INK = '#13202d';

function randomSequence(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeLayer() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

function polygon(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

function disk(ctx, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function roundRect(ctx, x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function sampleGround(terrain, x) {
  const index = Math.max(0, Math.min(terrain.length - 1, Math.round(x)));
  return terrain[index];
}

function drawSky(ctx, scene) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(0.33, scene.sky[1]);
  sky.addColorStop(0.61, scene.sky[2]);
  sky.addColorStop(0.88, scene.sky[3]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const sunX = scene.sunX * WIDTH;
  const sunY = HEIGHT * 0.43;
  const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 235);
  halo.addColorStop(0, scene.glow + '72');
  halo.addColorStop(0.37, scene.glow + '32');
  halo.addColorStop(1, scene.glow + '00');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  disk(ctx, sunX, sunY, 47, scene.sun + 'de');
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, 46, 0, TAU);
  ctx.clip();
  for (let offset = 12; offset < 50; offset += 5) {
    ctx.fillStyle = scene.glow + '5d';
    ctx.fillRect(sunX - 48, sunY + offset, 96, 1.1 + offset / 28);
  }
  ctx.restore();

  const random = randomSequence(scene.seed);
  for (let index = 0; index < 65; index++) {
    const x = random() * WIDTH;
    const y = 12 + random() * 168;
    const radius = 0.25 + random() * 0.8;
    ctx.globalAlpha = 0.12 + random() * 0.33;
    disk(ctx, x, y, radius, '#f3e9d7');
  }
  ctx.globalAlpha = 1;

  // Thin cloud banks follow the horizon without masking the shot arc.
  for (let index = 0; index < 26; index++) {
    const x = random() * (WIDTH + 180) - 90;
    const y = 95 + random() * 258;
    const length = 22 + random() * 150;
    const band = ctx.createLinearGradient(x, 0, x + length, 0);
    band.addColorStop(0, scene.sun + '00');
    band.addColorStop(0.38, scene.sun + '1b');
    band.addColorStop(1, scene.sun + '00');
    ctx.fillStyle = band;
    ctx.fillRect(x, y, length, 1 + random() * 2);
  }
}

function drawRidge(ctx, scene, level, startY, color) {
  const random = randomSequence(scene.seed + level * 1337);
  const edge = [[-28, startY + 28]];
  let x = -28;
  while (x < WIDTH + 60) {
    const base = startY + random() * 42;
    const face = 15 + random() * 54;
    const shoulder = 16 + random() * 26;
    const top = 35 + random() * 64;
    edge.push(
      [x, base],
      [x + shoulder, base - face * 0.56],
      [x + shoulder + 9, base - face],
      [x + shoulder + top, base - face + random() * 6],
      [x + shoulder + top + 12, base - face * 0.61],
      [x + shoulder + top + 31, base + 5],
    );
    x += shoulder + top + 41 + random() * 38;
  }
  polygon(ctx, [...edge, [WIDTH + 140, HEIGHT], [-28, HEIGHT]], color);
  for (let index = 2; index + 3 < edge.length; index += 6) {
    const [topX, topY] = edge[index + 1];
    const [rightX, rightY] = edge[index + 2];
    const [baseX, baseY] = edge[index + 3];
    polygon(ctx, [[topX, topY], [rightX, rightY], [baseX, baseY], [baseX - 22, baseY + 53]], '#0d152218');
  }
}

function drawBackground(ctx, scene) {
  drawSky(ctx, scene);
  drawRidge(ctx, scene, 1, 342, scene.far);
  drawRidge(ctx, scene, 2, 387, scene.middle);
  drawRidge(ctx, scene, 3, 452, scene.near);

  const haze = ctx.createLinearGradient(0, 305, 0, HEIGHT);
  haze.addColorStop(0, scene.glow + '00');
  haze.addColorStop(0.34, scene.glow + '21');
  haze.addColorStop(1, scene.glow + '00');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 305, WIDTH, HEIGHT - 305);

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#e4eced0a';
  ctx.beginPath();
  for (let x = 60; x < WIDTH; x += 60) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, HEIGHT);
  }
  for (let y = 60; y < HEIGHT; y += 60) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(WIDTH, y + 0.5);
  }
  ctx.stroke();

  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.48, 215, WIDTH / 2, HEIGHT * 0.48, 720);
  vignette.addColorStop(0, '#050b1600');
  vignette.addColorStop(1, '#050b1666');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function traceSurface(ctx, terrain, offset = 0) {
  ctx.moveTo(0, terrain[0] + offset);
  for (let x = 1; x <= WIDTH; x++) ctx.lineTo(x, terrain[x] + offset);
}

function drawTerrain(ctx, terrain, scene) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  ctx.beginPath();
  traceSurface(ctx, terrain);
  ctx.lineTo(WIDTH, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.closePath();
  ctx.clip();

  const earth = ctx.createLinearGradient(0, 315, 0, HEIGHT);
  earth.addColorStop(0, scene.rock[0]);
  earth.addColorStop(0.42, scene.rock[1]);
  earth.addColorStop(0.75, scene.rock[2]);
  earth.addColorStop(1, scene.rock[3]);
  ctx.fillStyle = earth;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Strata stay in place when a shell removes the surface above them.
  for (let layer = 0; layer < 18; layer++) {
    ctx.strokeStyle = scene.strata[layer % scene.strata.length];
    ctx.lineWidth = layer % 5 === 0 ? 7 : 1.5 + layer % 3;
    ctx.beginPath();
    for (let x = 0; x <= WIDTH; x += 6) {
      const y = 340 + layer * 15 + Math.sin(x / 99 + layer * 0.18) * 9 + Math.sin(x / 260) * 17;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const random = randomSequence(scene.seed * 11);
  for (let index = 0; index < 1300; index++) {
    const x = random() * WIDTH;
    const y = 310 + random() * 290;
    const width = 1 + random() * 4;
    const height = 0.6 + random() * 1.4;
    if (y < sampleGround(terrain, x) + 4) continue;
    ctx.fillStyle = index % 3 ? '#e9c5a125' : '#10192350';
    ctx.fillRect(x, y, width, height);
  }

  ctx.beginPath();
  traceSurface(ctx, terrain, 4);
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#111d293e';
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  traceSurface(ctx, terrain, 0.5);
  ctx.lineWidth = 2.1;
  ctx.strokeStyle = scene.edge;
  ctx.lineJoin = 'round';
  ctx.stroke();

  for (let x = 12; x < WIDTH; x += 7 + Math.round(random() * 17)) {
    const y = sampleGround(terrain, x);
    const size = 1 + random() * 3;
    polygon(ctx, [[x - size, y], [x + size, y], [x + size * 0.4, y - size]], scene.edge + '8c');
  }
}

function tankAngle(tank, players) {
  const opponents = players.filter((other) => other.id !== tank.id && other.health > 0);
  const nearest = opponents.sort((a, b) => Math.abs(tank.x - a.x) - Math.abs(tank.x - b.x))[0];
  return nearest && nearest.x < tank.x ? 148 : 32;
}

function drawTank(ctx, tank, angle, terrain, active, ghost = false, tagScale = 1) {
  const color = tank.color || PLAYER_COLORS[tank.id % PLAYER_COLORS.length];
  const pitch = Math.atan2(sampleGround(terrain, tank.x + 15) - sampleGround(terrain, tank.x - 15), 30);
  const tilt = Math.max(-0.42, Math.min(0.42, pitch));

  ctx.save();
  ctx.translate(tank.x, tank.y);
  ctx.globalAlpha = ghost ? 0.22 : 1;
  ctx.fillStyle = '#07101980';
  ctx.beginPath();
  ctx.ellipse(0, 3, 28, 5, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(0, -12);
  ctx.rotate(tilt);
  roundRect(ctx, -23, 0, 46, 13, 5, '#141f2b');
  roundRect(ctx, -21, 1.5, 42, 9.4, 4, tank.health > 0 ? '#3c4f5c' : '#302c31');
  for (let index = -16; index <= 16; index += 8) {
    disk(ctx, index, 6, 3.3, '#172532');
    disk(ctx, index, 6, 1.35, tank.health > 0 ? color + '7f' : '#8d685a');
  }
  ctx.strokeStyle = '#131d286e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -19; x <= 20; x += 4) {
    ctx.moveTo(x, 0.5);
    ctx.lineTo(x, 2.4);
    ctx.moveTo(x, 9.4);
    ctx.lineTo(x, 12);
  }
  ctx.stroke();

  const body = tank.health > 0 ? color : '#695455';
  polygon(ctx, [[-22, -1], [-17, -8], [13, -8], [23, -3], [19, 1], [-20, 1]], body);
  polygon(ctx, [[-19, -1], [17, -1], [23, -3], [19, 1], [-20, 1]], '#1425338c');
  ctx.fillStyle = '#f0fff986';
  ctx.fillRect(-13, -8, 22, 1);
  ctx.fillStyle = '#111d278c';
  ctx.fillRect(-16, -5.5, 9, 1);
  ctx.fillRect(-15, -3.5, 7, 1);
  ctx.restore();

  // Keep the barrel in world space so the trajectory follows its visible aim.
  ctx.translate(0, -16);
  ctx.rotate(-angle * Math.PI / 180);
  if (tank.health > 0) {
    roundRect(ctx, 1, -3.5, 23, 7, 2, INK);
    roundRect(ctx, 3, -2.7, 17, 4.7, 1.1, color);
    roundRect(ctx, 19, -4, 5, 8, 1, '#33434f');
    ctx.fillStyle = '#f0fff9aa';
    ctx.fillRect(6, -2.7, 12, 1);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(tank.x, tank.y);
  ctx.globalAlpha = ghost ? 0.22 : 1;
  polygon(ctx, [[-12, -16], [-9, -24], [5, -25], [11, -20], [12, -16]], tank.health > 0 ? color : '#695455');
  polygon(ctx, [[-12, -16], [-9, -19], [10, -20], [12, -16]], '#15293885');
  ctx.fillStyle = '#f1ffff80';
  ctx.fillRect(-6, -24, 8, 1.2);
  if (tank.health > 0) {
    ctx.strokeStyle = '#d3f0ef95';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-12, -20);
    ctx.lineTo(-17, -34);
    ctx.stroke();
    disk(ctx, -17, -34, 1.3, color);
  }
  if (tank.shield && tank.health > 0 && !ghost) {
    ctx.strokeStyle = color + '80';
    ctx.fillStyle = color + '14';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -9, 31, Math.PI, TAU);
    ctx.stroke();
    ctx.lineTo(-31, -9);
    ctx.fill();
  }
  if (!ghost && tank.health > 0 && tagScale) drawTankTag(ctx, tank, color, active, tagScale);
  ctx.restore();
}

function drawTankTag(ctx, tank, color, active, scale) {
  const text = 'P' + (tank.id + 1);
  if (active) polygon(ctx, [[-4, -41], [4, -41], [0, -35]], color);
  const tagY = active ? -52 : -43;
  ctx.translate(0, tagY);
  ctx.scale(scale, scale);
  roundRect(ctx, -16, -16, 32, 16, 4, '#101b2ce0');
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 0, -8);
  ctx.fillStyle = '#18222e';
  ctx.fillRect(-15, 2, 30, 2.5);
  ctx.fillStyle = color;
  ctx.fillRect(-15, 2, 30 * Math.max(0, Math.min(tank.health, 100)) / 100, 2.5);
}

const UNIT_LABELS = { tank: 'TNK', rifle: 'RFL', rocket: 'AT' };
const UNIT_HEALTH = { tank: 100, rifle: 65, rocket: 75 };
const OBJECTIVE_COLOR = '#fae5a8';

function factionMark(ctx, team, x, y, size, color) {
  const points = team === 0
    ? [[x, y - size], [x + size, y], [x, y + size], [x - size, y]]
    : [[x, y - size], [x + size, y + size], [x - size, y + size]];
  polygon(ctx, points, color);
}

function drawObjective(ctx, state, scale) {
  const { x, radius, owner, contested } = state.objective;
  const color = contested ? '#ffc185' : state.players[owner]?.color || OBJECTIVE_COLOR;
  const ground = sampleGround(state.terrain, x);
  const left = Math.max(0, Math.round(x - radius));
  const right = Math.min(WIDTH, Math.round(x + radius));
  ctx.save();

  // Follow the actual terrain, so the control area stays legible after a crater.
  ctx.fillStyle = color + '20';
  ctx.beginPath();
  ctx.moveTo(left, state.terrain[left] - 4);
  for (let i = left + 1; i <= right; i++) ctx.lineTo(i, state.terrain[i] - 4);
  for (let i = right; i >= left; i--) ctx.lineTo(i, state.terrain[i] + 23);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color + 'c9';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(left, state.terrain[left] - 4);
  for (let i = left + 1; i <= right; i++) ctx.lineTo(i, state.terrain[i] - 4);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const edge of [left, right]) {
    const y = state.terrain[edge];
    ctx.fillStyle = color;
    ctx.fillRect(edge - 1.6, y - 14, 3.2, 18);
    ctx.fillRect(edge - 5, y - 14, 10, 2.5);
  }

  ctx.translate(x, ground);
  ctx.strokeStyle = color + 'bd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, -50);
  ctx.stroke();
  polygon(ctx, [[0, -49], [25, -46], [20, -35], [0, -38]], color);
  if (owner != null && !contested) factionMark(ctx, owner, 10, -42, 3.5, INK);

  // Below the surface keeps the text clear of aim paths and clustered squads.
  const badgeY = Math.min(31, HEIGHT - ground - 26 * scale);
  ctx.translate(0, badgeY);
  ctx.scale(scale, scale);
  const status = contested ? 'CONTESTED' : owner == null ? 'OPEN' : 'CONTROLLED';
  const label = 'POST / ' + status;
  const controlled = owner != null && !contested;
  ctx.font = 'bold 10px system-ui, sans-serif';
  const textWidth = ctx.measureText(label).width;
  const halfWidth = Math.max(55, textWidth / 2 + (controlled ? 14 : 8));
  roundRect(ctx, -halfWidth, 0, 2 * halfWidth, 19, 4, '#152030ee');
  ctx.fillStyle = color;
  ctx.fillRect(1 - halfWidth, 1, 2 * halfWidth - 2, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (controlled) factionMark(ctx, owner, -textWidth / 2 - 5, 10.5, 3, color);
  ctx.fillText(label, controlled ? 5 : 0, 10.5);
  ctx.restore();
}

function drawInfantry(ctx, unit, angle, terrain, ghost) {
  const rocket = unit.type === 'rocket';
  const color = unit.color || PLAYER_COLORS[unit.team];
  const direction = angle > 90 ? -1 : 1;
  const soldiers = rocket ? [-9, 4] : [-11, 0, 11];
  ctx.save();
  ctx.translate(unit.x, unit.y);
  ctx.globalAlpha = ghost ? 0.25 : 1;
  for (const offset of soldiers) {
    const groundOffset = sampleGround(terrain, unit.x + offset) - unit.y;
    const height = rocket ? 16 : 21;
    ctx.save();
    ctx.translate(offset, Math.max(-6, Math.min(6, groundOffset)));
    ctx.scale(direction, 1);
    ctx.fillStyle = '#0c162ab0';
    ctx.beginPath();
    ctx.ellipse(0, 1.5, 7, 2.8, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#172636';
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -height + 11);
    ctx.lineTo(-4, -1);
    ctx.moveTo(1, -height + 11);
    ctx.lineTo(4, -1);
    ctx.stroke();
    polygon(ctx, [[-5, -height + 4], [2, -height + 3], [5, -height + 12], [-4, -height + 13]], color);
    roundRect(ctx, -7, -height + 5, 4, 8, 1.3, '#243647');
    disk(ctx, 0, -height + 1, 3.8, '#c7aa94');
    polygon(ctx, [[-4, -height + 1], [-3, -height - 4], [2, -height - 4], [5, -height + 1]], color);
    if (!rocket && offset !== 0) {
      roundRect(ctx, 2, -14, 10, 3.6, 1.1, INK);
      ctx.fillStyle = '#e2e6dd';
      ctx.fillRect(5, -14, 7, 0.9);
    }
    ctx.restore();
  }
  // Match the projectile's starting point to the selected squad's weapon.
  ctx.translate(0, rocket ? -14 : -12);
  ctx.rotate(-angle * Math.PI / 180);
  if (rocket) {
    roundRect(ctx, -6, -3.2, 25, 6.4, 2, INK);
    roundRect(ctx, -5, -2.2, 20, 3.5, 1.2, color);
    roundRect(ctx, 14, -4, 5, 8, 1.3, '#475867');
  } else {
    roundRect(ctx, -2, -2.1, 17, 4.2, 1.2, INK);
    ctx.fillStyle = '#e2e6dd';
    ctx.fillRect(5, -1.6, 9, 1);
  }
  ctx.restore();
}

function placeUnitBadges(units, activeUnit, scale) {
  const occupied = [];
  const living = units.filter(({ health }) => health > 0);
  living.sort((a, b) => Number(b.id === activeUnit?.id) - Number(a.id === activeUnit?.id) || a.x - b.x);
  for (const unit of living) {
    const selected = unit.id === activeUnit?.id;
    const x = Math.max(21 * scale, Math.min(WIDTH - 21 * scale, unit.x));
    const baseY = unit.y - (selected ? 49 : 35);
    let y = baseY;
    while (occupied.some((badge) => Math.abs(badge.x - x) < 41 * scale && Math.abs(badge.y - y) < 23 * scale)) {
      y -= 23 * scale;
    }
    occupied.push({ unit, selected, x, y, moved: x !== unit.x || y !== baseY });
  }
  return occupied;
}

function drawBadgeLeader(ctx, { unit, x, y, moved }, scale) {
  if (!moved) return;
  const color = unit.color || PLAYER_COLORS[unit.team];
  ctx.strokeStyle = color + '8c';
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.moveTo(unit.x, unit.y - 28);
  ctx.lineTo(x, y + 5 * scale);
  ctx.stroke();
}

function drawUnitBadge(ctx, { unit, selected, x, y }, scale) {
  const color = unit.color || PLAYER_COLORS[unit.team];
  ctx.save();
  if (selected) {
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.strokeStyle = '#f5fbf1';
    ctx.lineWidth = 2 * scale;
    const size = unit.type === 'tank' ? 29 : 25;
    ctx.beginPath();
    ctx.moveTo(-size, -10);
    ctx.lineTo(-size, 5);
    ctx.lineTo(-size + 8, 5);
    ctx.moveTo(size, -10);
    ctx.lineTo(size, 5);
    ctx.lineTo(size - 8, 5);
    ctx.stroke();
    polygon(ctx, [[-4 * scale, -44], [4 * scale, -44], [0, -36]], '#f5fbf1');
    ctx.restore();
  }
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  roundRect(ctx, -19, -16, 38, 16, 4, selected ? '#e2eee9' : '#101b2cf4');
  factionMark(ctx, unit.team, -11.5, -8, 3.5, selected ? INK : color);
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = selected ? INK : color;
  ctx.fillText(UNIT_LABELS[unit.type] || '', 5, -8);
  ctx.fillStyle = '#18222e';
  ctx.fillRect(-18, 2, 36, 2.5);
  ctx.fillStyle = color;
  const maxHealth = unit.maxHealth ?? UNIT_HEALTH[unit.type] ?? 100;
  ctx.fillRect(-18, 2, 36 * Math.max(0, Math.min(unit.health / maxHealth, 1)), 2.5);
  ctx.restore();
}

function drawFrontlineUnit(ctx, unit, angle, terrain, ghost) {
  if (unit.type === 'tank') drawTank(ctx, unit, angle, terrain, false, ghost, 0);
  else if (unit.health > 0) drawInfantry(ctx, unit, angle, terrain, ghost);
}

function drawFrontline(ctx, state, { angle, selectedUnit, previewTank, elapsed, tagScale }) {
  const units = state.units;
  const activeUnit = units.find((unit) => unit.id === selectedUnit && unit.health > 0 && unit.team === state.active);
  const onField = [];
  for (const unit of units) {
    const isActive = unit === activeUnit;
    const moved = isActive && previewTank ? { ...unit, ...previewTank } : unit;
    const opponents = units.filter((other) => other.team !== unit.team);
    const aim = isActive && Number.isFinite(angle) ? angle : tankAngle(moved, opponents);
    if (Math.abs(moved.x - unit.x) > 1) drawFrontlineUnit(ctx, unit, aim, state.terrain, true);
    drawFrontlineUnit(ctx, moved, aim, state.terrain, false);
    onField.push(moved);
  }
  const badges = placeUnitBadges(onField, Number.isFinite(elapsed) ? null : activeUnit, tagScale);
  for (const badge of badges) drawBadgeLeader(ctx, badge, tagScale);
  for (const badge of badges) drawUnitBadge(ctx, badge, tagScale);
}

function drawActionTarget(ctx, x, terrain, action, scale) {
  if (!Number.isFinite(x) || (action !== 'air-raid' && action !== 'air-drop')) return;
  const y = sampleGround(terrain, x);
  const color = action === 'air-drop' ? '#8af0d0' : '#ffb38b';
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2 * scale;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(0, -93 * scale);
  ctx.lineTo(0, -14 * scale);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, -1, 10, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-15, -1);
  ctx.lineTo(-6, -1);
  ctx.moveTo(15, -1);
  ctx.lineTo(6, -1);
  ctx.stroke();
  const label = action === 'air-drop' ? 'DROP ZONE' : 'RAID TARGET';
  const labelX = Math.max(39 - x / scale, Math.min(0, (WIDTH - x) / scale - 39));
  roundRect(ctx, labelX - 39, -113, 78, 18, 4, '#101b2cf4');
  ctx.fillStyle = color;
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, labelX, -104);
  ctx.restore();
}

function drawAimPreview(ctx, paths, impacts, color, lineScale) {
  ctx.save();
  ctx.lineWidth = 1.9 * lineScale;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.74;
  ctx.setLineDash([3, 9]);
  ctx.lineCap = 'round';
  for (const path of paths) {
    if (!path.length) continue;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (const point of path.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const impact of impacts) {
    if (impact.y < 0 || impact.y > HEIGHT) continue;
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, 8, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(impact.x - 12, impact.y);
    ctx.lineTo(impact.x - 5, impact.y);
    ctx.moveTo(impact.x + 5, impact.y);
    ctx.lineTo(impact.x + 12, impact.y);
    ctx.moveTo(impact.x, impact.y - 12);
    ctx.lineTo(impact.x, impact.y - 5);
    ctx.stroke();
  }
  ctx.restore();
}

function shellAt(path, elapsed) {
  const first = path[0];
  const last = path[path.length - 1];
  if (!first || elapsed < first.t || elapsed > last.t) return null;
  const nextIndex = path.findIndex((point) => point.t >= elapsed);
  if (nextIndex <= 0) return first;
  const previous = path[nextIndex - 1];
  const next = path[nextIndex];
  const progress = (elapsed - previous.t) / (next.t - previous.t || 1);
  return {x: previous.x + (next.x - previous.x) * progress, y: previous.y + (next.y - previous.y) * progress};
}

function drawCargo(ctx, x, y, parachute = false) {
  ctx.save();
  ctx.translate(x, y);
  if (parachute) {
    ctx.strokeStyle = '#c4f4e5b5';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-17, -22);
    ctx.lineTo(-6, -5);
    ctx.moveTo(17, -22);
    ctx.lineTo(6, -5);
    ctx.moveTo(0, -25);
    ctx.lineTo(0, -5);
    ctx.stroke();
    ctx.fillStyle = '#92e1c9';
    ctx.beginPath();
    ctx.moveTo(-17, -22);
    ctx.quadraticCurveTo(-12, -42, 0, -39);
    ctx.quadraticCurveTo(12, -42, 17, -22);
    ctx.quadraticCurveTo(8, -27, 0, -22);
    ctx.quadraticCurveTo(-8, -27, -17, -22);
    ctx.fill();
    ctx.fillStyle = '#dfefe4';
    ctx.beginPath();
    ctx.moveTo(-6, -23);
    ctx.quadraticCurveTo(-5, -36, 0, -39);
    ctx.quadraticCurveTo(5, -36, 6, -23);
    ctx.lineTo(0, -22);
    ctx.closePath();
    ctx.fill();
  }
  roundRect(ctx, -9, -7, 18, 13, 2, '#152638');
  roundRect(ctx, -7.5, -5.5, 15, 10, 1, '#8ed0b8');
  ctx.fillStyle = '#304f50';
  ctx.fillRect(-5, -5.5, 2, 10);
  ctx.fillRect(3, -5.5, 2, 10);
  ctx.restore();
}

function drawBomb(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  polygon(ctx, [[-7, -13], [-3, -10], [3, -10], [7, -13], [5, -4], [-5, -4]], '#c86f58');
  roundRect(ctx, -4.8, -11, 9.6, 20, 4, '#263340');
  roundRect(ctx, -3, -5, 6, 13, 3, '#ffab77');
  ctx.fillStyle = '#ffe0b4';
  ctx.fillRect(-3, 0, 6, 2);
  ctx.restore();
}

function drawShells(ctx, paths, elapsed, color, action) {
  for (const path of paths) {
    const shell = shellAt(path, elapsed);
    if (!shell) continue;
    if (action === 'air-drop') {
      drawCargo(ctx, shell.x, shell.y, true);
      continue;
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    const trail = path.filter((point) => point.t < elapsed && point.t > elapsed - 0.28);
    if (trail.length) {
      ctx.moveTo(trail[0].x, trail[0].y);
      for (const point of trail.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.lineTo(shell.x, shell.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (action === 'air-raid') drawBomb(ctx, shell.x, shell.y);
    else {
      disk(ctx, shell.x, shell.y, 7, color + '49');
      disk(ctx, shell.x, shell.y, 3.5, '#fff4cf');
    }
    ctx.restore();
  }
}

function drawImpacts(ctx, impacts, elapsed, reducedMotion) {
  for (const impact of impacts) {
    const age = elapsed - impact.t;
    if (age < 0 || age > 0.72) continue;
    const life = 1 - age / 0.72;
    const radius = Math.max(12, impact.radius || 18);
    ctx.save();

    if (impact.weapon === 'air-drop') {
      ctx.globalAlpha = 0.45 + life * 0.55;
      drawCargo(ctx, impact.x, impact.y - 6);
      if (!reducedMotion) {
        ctx.globalAlpha = life * 0.32;
        for (const offset of [-13, -7, 8, 15]) {
          disk(ctx, impact.x + offset * (0.75 + age * 3), impact.y - age * 14, 3 + age * 16, '#d1b59c');
        }
      }
      ctx.restore();
      continue;
    }

    if (impact.weapon === 'rifle') {
      ctx.globalAlpha = life * 0.85;
      polygon(ctx, [
        [impact.x, impact.y - 8], [impact.x + 2, impact.y - 2], [impact.x + 8, impact.y],
        [impact.x + 2, impact.y + 2], [impact.x, impact.y + 8], [impact.x - 2, impact.y + 2],
        [impact.x - 8, impact.y], [impact.x - 2, impact.y - 2],
      ], '#ffe8a4');
      ctx.restore();
      continue;
    }

    ctx.strokeStyle = impact.weapon === 'shield' ? '#90eafa' : '#ffc587';
    ctx.globalAlpha = life * 0.78;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, reducedMotion ? radius : Math.max(5, radius * (0.2 + age * 1.7)), 0, TAU);
    ctx.stroke();

    if (!reducedMotion) {
      const bloom = ctx.createRadialGradient(impact.x, impact.y, 0, impact.x, impact.y, radius * 1.35);
      bloom.addColorStop(0, '#fff2b9aa');
      bloom.addColorStop(0.28, '#ffc27391');
      bloom.addColorStop(1, '#fd985600');
      ctx.globalAlpha = life * life;
      ctx.fillStyle = bloom;
      ctx.fillRect(impact.x - radius * 1.35, impact.y - radius * 1.35, radius * 2.7, radius * 2.7);

      const random = randomSequence(Math.floor(impact.x * 37 + impact.y * 11));
      for (let index = 0; index < 22; index++) {
        const velocityX = (random() - 0.5) * radius * 5;
        const velocityY = -(0.7 + random() * 2.4) * radius;
        const x = impact.x + velocityX * age;
        const y = impact.y + velocityY * age + 110 * age * age;
        ctx.globalAlpha = life * (0.43 + random() * 0.52);
        disk(ctx, x, y, 0.7 + random() * 2.4, index % 3 ? '#e9a66f' : '#fff1ae');
      }
    }
    ctx.restore();
  }
}

export class BattlefieldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.sky = makeLayer();
    this.ground = makeLayer();
    this.scene = null;
    this.terrain = null;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  }

  draw(state, {
    angle,
    previewTank,
    selectedUnit,
    target,
    action,
    paths = [],
    impacts = [],
    elapsed,
    color,
    reducedMotion = this.reducedMotion.matches,
  } = {}) {
    const ctx = this.context;
    if (!ctx || !state?.terrain) return;
    const scene = SCENES[state.map] || SCENES.badlands;
    if (scene !== this.scene) {
      this.scene = scene;
      this.terrain = null;
      drawBackground(this.sky.getContext('2d'), scene);
    }
    if (this.terrain !== state.terrain) {
      this.terrain = state.terrain;
      drawTerrain(this.ground.getContext('2d'), state.terrain, scene);
    }

    const width = this.canvas.clientWidth || WIDTH;
    const height = this.canvas.clientHeight || HEIGHT;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const canvasWidth = Math.round(width * ratio);
    const canvasHeight = Math.round(height * ratio);
    if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
      this.canvas.width = canvasWidth;
      this.canvas.height = canvasHeight;
    }

    ctx.setTransform(canvasWidth / WIDTH, 0, 0, canvasHeight / HEIGHT, 0, 0);
    ctx.drawImage(this.sky, 0, 0);
    ctx.drawImage(this.ground, 0, 0);

    const active = state.players[state.active];
    const supportColor = action === 'air-raid' ? '#ffb38b' : action === 'air-drop' ? '#8af0d0' : null;
    const shotColor = color || supportColor || active?.color || PLAYER_COLORS[active?.id || 0];
    const tagScale = Math.max(1, Math.min(2.2, 850 / width));
    const playingBack = Number.isFinite(elapsed);
    const frontline = state.scenario === 'frontline';
    if (frontline) drawObjective(ctx, state, tagScale);
    if (!playingBack) {
      drawAimPreview(ctx, paths, impacts, shotColor, Math.max(1, Math.min(2, 620 / width)));
    }
    if (frontline) {
      drawFrontline(ctx, state, { angle, selectedUnit, previewTank, elapsed, tagScale });
      if (!playingBack) drawActionTarget(ctx, target, state.terrain, action, tagScale);
    } else {
      for (const tank of state.players) {
        const isActive = tank.id === active?.id;
        const visibleTank = isActive && previewTank ? previewTank : tank;
        const aim = isActive && Number.isFinite(angle) ? angle : tankAngle(visibleTank, state.players);
        if (visibleTank !== tank && Math.abs(visibleTank.x - tank.x) > 1) {
          drawTank(ctx, tank, aim, state.terrain, false, true);
        }
        drawTank(ctx, visibleTank, aim, state.terrain, isActive && !playingBack, false, tagScale);
      }
    }

    if (playingBack) {
      drawShells(ctx, paths, elapsed, shotColor, action);
      drawImpacts(ctx, impacts, elapsed, reducedMotion);
    }
  }
}

export default BattlefieldRenderer;
