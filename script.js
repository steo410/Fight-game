const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const form = document.getElementById('spawn-form');
const selectedNameEl = document.getElementById('selected-name');
const selectedStatsEl = document.getElementById('selected-stats');

const fighters = [];
const explosions = [];
const input = new Set();

const CONFIG = {
  radius: 32,
  moveSpeed: 130,
  turnSpeed: Math.PI * 1.55,
  attackCooldown: 0.7,
  attackReachMultiplier: 2,
  baseHp: 100,
  baseAtk: 10,
};

let selectedId = null;
let lastTime = performance.now();
let nextId = 1;
let nextSpawnX = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function randomSpawnPosition() {
  const margin = 90;
  const cols = 4;
  const row = Math.floor(nextSpawnX / cols);
  const col = nextSpawnX % cols;
  nextSpawnX += 1;
  return {
    x: margin + col * ((canvas.width - margin * 2) / Math.max(cols - 1, 1)),
    y: margin + (row % 4) * 110,
  };
}

function createFighter(name, hpBonus, atkBonus) {
  const { x, y } = randomSpawnPosition();
  const fighter = {
    id: nextId++,
    name,
    x,
    y,
    angle: Math.random() * Math.PI * 2,
    radius: CONFIG.radius,
    maxHp: CONFIG.baseHp + hpBonus,
    hp: CONFIG.baseHp + hpBonus,
    atk: CONFIG.baseAtk + atkBonus,
    cooldown: 0,
    attackFlash: 0,
    alive: true,
  };
  fighters.push(fighter);
  selectedId = fighter.id;
  updateHud();
}

function getSelected() {
  return fighters.find((fighter) => fighter.id === selectedId && fighter.alive) ?? null;
}

function updateHud() {
  const fighter = getSelected();
  if (!fighter) {
    selectedNameEl.textContent = '없음';
    selectedStatsEl.textContent = '소환 후 원을 클릭하거나 Tab으로 선택하세요.';
    return;
  }

  selectedNameEl.textContent = fighter.name;
  const degrees = (Math.round((fighter.angle * 180) / Math.PI) + 360) % 360;
  selectedStatsEl.textContent = `체력 ${Math.ceil(fighter.hp)} / ${fighter.maxHp} · 공격 ${fighter.atk} · 방향 ${degrees}°`;
}

function selectNext() {
  const alive = fighters.filter((fighter) => fighter.alive);
  if (alive.length === 0) {
    selectedId = null;
    updateHud();
    return;
  }

  const currentIndex = alive.findIndex((fighter) => fighter.id === selectedId);
  selectedId = alive[(currentIndex + 1 + alive.length) % alive.length].id;
  updateHud();
}

function frontVector(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function applyMovement(fighter, dt, controller) {
  const rotation = controller.turn * CONFIG.turnSpeed * dt;
  fighter.angle = normalizeAngle(fighter.angle + rotation);

  if (controller.forward > 0) {
    fighter.x += Math.cos(fighter.angle) * CONFIG.moveSpeed * dt;
    fighter.y += Math.sin(fighter.angle) * CONFIG.moveSpeed * dt;
  }

  fighter.x = clamp(fighter.x, fighter.radius, canvas.width - fighter.radius);
  fighter.y = clamp(fighter.y, fighter.radius, canvas.height - fighter.radius);
}

function tryAttack(attacker) {
  if (!attacker.alive || attacker.cooldown > 0) {
    return;
  }

  attacker.cooldown = CONFIG.attackCooldown;
  attacker.attackFlash = 0.14;

  const facing = frontVector(attacker.angle);
  const reach = (attacker.radius * CONFIG.attackReachMultiplier) ** 2;

  for (const target of fighters) {
    if (!target.alive || target.id === attacker.id) continue;

    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distanceSq = dx * dx + dy * dy;
    const maxDistance = attacker.radius + target.radius;
    if (distanceSq > Math.max(reach, maxDistance * maxDistance)) continue;

    const distance = Math.sqrt(distanceSq) || 1;
    const alignment = (dx / distance) * facing.x + (dy / distance) * facing.y;
    if (alignment < 0) continue;

    target.hp -= attacker.atk;
    if (target.hp <= 0) {
      explode(target);
    }
  }
}

function explode(fighter) {
  if (!fighter.alive) return;
  fighter.alive = false;
  fighter.hp = 0;
  explosions.push({ x: fighter.x, y: fighter.y, age: 0, radius: fighter.radius });
  if (selectedId === fighter.id) {
    selectNext();
  }
}

function aiController(fighter) {
  const enemies = fighters.filter((other) => other.alive && other.id !== fighter.id);
  if (enemies.length === 0) {
    return { turn: 0, forward: 0, attack: false };
  }

  let nearest = enemies[0];
  let nearestDistance = Infinity;
  for (const enemy of enemies) {
    const dx = enemy.x - fighter.x;
    const dy = enemy.y - fighter.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < nearestDistance) {
      nearestDistance = distanceSq;
      nearest = enemy;
    }
  }

  const desired = Math.atan2(nearest.y - fighter.y, nearest.x - fighter.x);
  const delta = normalizeAngle(desired - fighter.angle);
  const turn = clamp(delta / (Math.PI / 3), -1, 1);
  const attack = Math.abs(delta) < Math.PI / 2 && nearestDistance <= (fighter.radius * CONFIG.attackReachMultiplier) ** 2;

  return {
    turn,
    forward: 1,
    attack,
  };
}

function update(dt) {
  const selected = getSelected();

  for (const fighter of fighters) {
    if (!fighter.alive) continue;

    fighter.cooldown = Math.max(0, fighter.cooldown - dt);
    fighter.attackFlash = Math.max(0, fighter.attackFlash - dt);

    if (selected && fighter.id === selected.id) {
      const controller = {
        turn: (input.has('arrowright') || input.has('d') ? 1 : 0) - (input.has('arrowleft') || input.has('a') ? 1 : 0),
        forward: input.has('arrowup') || input.has('w') ? 1 : 0,
        attack: input.has(' '),
      };
      applyMovement(fighter, dt, controller);
      if (controller.attack) {
        tryAttack(fighter);
      }
    } else {
      const controller = aiController(fighter);
      applyMovement(fighter, dt, controller);
      if (controller.attack) {
        tryAttack(fighter);
      }
    }
  }

  for (let i = explosions.length - 1; i >= 0; i -= 1) {
    explosions[i].age += dt;
    if (explosions[i].age > 0.55) {
      explosions.splice(i, 1);
    }
  }

  resolveCollisions();
  updateHud();
}

function resolveCollisions() {
  for (let i = 0; i < fighters.length; i += 1) {
    const a = fighters[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < fighters.length; j += 1) {
      const b = fighters[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1;
      const minDistance = a.radius + b.radius + 4;
      if (distance >= minDistance) continue;
      const overlap = (minDistance - distance) / 2;
      const nx = dx / distance;
      const ny = dy / distance;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
    }
  }
}

function drawFighter(fighter) {
  const healthRatio = fighter.maxHp === 0 ? 0 : fighter.hp / fighter.maxHp;
  const shade = Math.round(255 * healthRatio);
  const fill = `rgb(${shade}, ${shade}, ${shade})`;
  const selected = fighter.id === selectedId;

  ctx.save();
  ctx.translate(fighter.x, fighter.y);
  ctx.rotate(fighter.angle);

  if (fighter.attackFlash > 0) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, fighter.radius * CONFIG.attackReachMultiplier, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 120, 120, 0.20)';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(0, 0, fighter.radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.strokeStyle = selected ? '#6ea8ff' : 'rgba(255,255,255,0.32)';
  ctx.lineWidth = selected ? 4 : 2;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, fighter.radius, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = selected ? 'rgba(110, 168, 255, 0.26)' : 'rgba(255, 80, 80, 0.18)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(fighter.radius * 0.15, 0);
  ctx.lineTo(fighter.radius * 0.95, 0);
  ctx.strokeStyle = healthRatio > 0.4 ? '#111827' : '#f8fafc';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.restore();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 14px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(fighter.name, fighter.x, fighter.y - fighter.radius - 16);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '12px Pretendard, sans-serif';
  ctx.fillText(`HP ${Math.ceil(fighter.hp)} · ATK ${fighter.atk}`, fighter.x, fighter.y + fighter.radius + 20);
}

function drawExplosions() {
  for (const explosion of explosions) {
    const t = explosion.age / 0.55;
    const radius = explosion.radius + t * 42;
    const alpha = 1 - t;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, ${180 - t * 80}, 80, ${alpha * 0.35})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius * 0.65, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const fighter of fighters) {
    if (fighter.alive) {
      drawFighter(fighter);
    }
  }

  drawExplosions();

  if (fighters.filter((fighter) => fighter.alive).length <= 1 && fighters.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 26px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    const winner = fighters.find((fighter) => fighter.alive);
    ctx.fillText(winner ? `${winner.name} 승리!` : '모두 폭발!', canvas.width / 2, 48);
  }
}

function frame(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.033);
  lastTime = time;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.getElementById('name-input').value.trim();
  const hpBonus = Number(document.getElementById('hp-input').value) || 0;
  const atkBonus = Number(document.getElementById('atk-input').value) || 0;
  if (!name) return;
  createFighter(name, Math.max(0, hpBonus), Math.max(0, atkBonus));
  form.reset();
  document.getElementById('hp-input').value = 0;
  document.getElementById('atk-input').value = 0;
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    selectNext();
    return;
  }

  if (['ArrowUp', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
    event.preventDefault();
  }

  input.add(event.key.toLowerCase());
});

window.addEventListener('keyup', (event) => {
  input.delete(event.key.toLowerCase());
});

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const target = fighters.find((fighter) => fighter.alive && Math.hypot(fighter.x - x, fighter.y - y) <= fighter.radius);
  if (target) {
    selectedId = target.id;
    updateHud();
  }
});

createFighter('Alpha', 0, 0);
createFighter('Bravo', 20, 2);
createFighter('Charlie', 40, 0);
requestAnimationFrame(frame);
