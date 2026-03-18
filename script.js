const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const form = document.getElementById('spawn-form');
const liveListEl = document.getElementById('live-list');
const deathListEl = document.getElementById('death-list');

const fighters = [];
const explosions = [];
const deathOrder = [];

const CONFIG = {
  baseHp: 100,
  baseAtk: 10,
  radius: 34,
  moveSpeed: 150,
  attackCooldown: 0.72,
  collisionPadding: 2,
  attackReach: 1.9,
};

let lastTime = performance.now();
let nextId = 1;
let spawnIndex = 0;

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
  const columns = 4;
  const marginX = 110;
  const marginY = 110;
  const row = Math.floor(spawnIndex / columns);
  const col = spawnIndex % columns;
  spawnIndex += 1;

  return {
    x: marginX + col * ((canvas.width - marginX * 2) / Math.max(columns - 1, 1)),
    y: marginY + (row % 4) * 110,
  };
}

function randomBonusDistribution(totalBonus) {
  const hpUnits = Math.floor(Math.random() * (totalBonus + 1));
  const atkUnits = totalBonus - hpUnits;
  return { hpUnits, atkUnits };
}

function createFighter(name, totalBonus) {
  const spawn = randomSpawnPosition();
  const bonus = randomBonusDistribution(totalBonus);
  const maxHp = CONFIG.baseHp + bonus.hpUnits * 10;
  const atk = CONFIG.baseAtk + bonus.atkUnits;
  const angle = Math.random() * Math.PI * 2;

  fighters.push({
    id: nextId++,
    name,
    totalBonus,
    hpUnits: bonus.hpUnits,
    atkUnits: bonus.atkUnits,
    x: spawn.x,
    y: spawn.y,
    angle,
    vx: Math.cos(angle) * CONFIG.moveSpeed,
    vy: Math.sin(angle) * CONFIG.moveSpeed,
    radius: CONFIG.radius,
    maxHp,
    hp: maxHp,
    atk,
    cooldown: Math.random() * 0.3,
    alive: true,
  });

  renderLists();
}

function renderLists() {
  const living = fighters.filter((fighter) => fighter.alive);

  if (living.length === 0) {
    liveListEl.classList.add('empty-list');
    liveListEl.innerHTML = '<li>아직 생성된 원이 없습니다.</li>';
  } else {
    liveListEl.classList.remove('empty-list');
    liveListEl.innerHTML = living
      .map((fighter) => `<li>${fighter.name} · 체력 ${Math.ceil(fighter.hp)}/${fighter.maxHp} · 공격 ${fighter.atk} · 추가스탯 ${fighter.totalBonus} (체력 ${fighter.hpUnits}, 공격 ${fighter.atkUnits})</li>`)
      .join('');
  }

  if (deathOrder.length === 0) {
    deathListEl.classList.add('empty-list');
    deathListEl.innerHTML = '<li>아직 아무도 죽지 않았습니다.</li>';
  } else {
    deathListEl.classList.remove('empty-list');
    deathListEl.innerHTML = deathOrder.map((name) => `<li>${name}</li>`).join('');
  }
}

function explode(fighter) {
  if (!fighter.alive) return;

  fighter.alive = false;
  fighter.hp = 0;
  deathOrder.push(fighter.name);
  explosions.push({ x: fighter.x, y: fighter.y, age: 0, baseRadius: fighter.radius });
  renderLists();
}

function reflectAgainstWalls(fighter) {
  if (fighter.x - fighter.radius <= 0) {
    fighter.x = fighter.radius;
    fighter.vx = Math.abs(fighter.vx);
  } else if (fighter.x + fighter.radius >= canvas.width) {
    fighter.x = canvas.width - fighter.radius;
    fighter.vx = -Math.abs(fighter.vx);
  }

  if (fighter.y - fighter.radius <= 0) {
    fighter.y = fighter.radius;
    fighter.vy = Math.abs(fighter.vy);
  } else if (fighter.y + fighter.radius >= canvas.height) {
    fighter.y = canvas.height - fighter.radius;
    fighter.vy = -Math.abs(fighter.vy);
  }

  fighter.angle = Math.atan2(fighter.vy, fighter.vx);
}

function resolveFighterCollisions() {
  for (let i = 0; i < fighters.length; i += 1) {
    const a = fighters[i];
    if (!a.alive) continue;

    for (let j = i + 1; j < fighters.length; j += 1) {
      const b = fighters[j];
      if (!b.alive) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1;
      const minDistance = a.radius + b.radius + CONFIG.collisionPadding;
      if (distance >= minDistance) continue;

      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = minDistance - distance;

      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;

      const relativeVelocityX = b.vx - a.vx;
      const relativeVelocityY = b.vy - a.vy;
      const speedAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;
      if (speedAlongNormal > 0) continue;

      const impulse = -speedAlongNormal;
      a.vx += -impulse * nx;
      a.vy += -impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;

      a.angle = Math.atan2(a.vy, a.vx);
      b.angle = Math.atan2(b.vy, b.vx);
    }
  }
}

function frontVector(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function tryAttack(attacker) {
  if (!attacker.alive || attacker.cooldown > 0) {
    return;
  }

  attacker.cooldown = CONFIG.attackCooldown;
  const facing = frontVector(attacker.angle);
  const range = attacker.radius * CONFIG.attackReach + attacker.radius;

  for (const target of fighters) {
    if (!target.alive || target.id === attacker.id) continue;

    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distance = Math.hypot(dx, dy);
    if (distance > range) continue;

    const alignment = ((dx / (distance || 1)) * facing.x) + ((dy / (distance || 1)) * facing.y);
    if (alignment < 0) continue;

    target.hp = clamp(target.hp - attacker.atk, 0, target.maxHp);
    if (target.hp <= 0) {
      explode(target);
    }
  }
}

function update(dt) {
  for (const fighter of fighters) {
    if (!fighter.alive) continue;

    fighter.cooldown = Math.max(0, fighter.cooldown - dt);
    fighter.x += fighter.vx * dt;
    fighter.y += fighter.vy * dt;

    reflectAgainstWalls(fighter);
    fighter.angle = normalizeAngle(Math.atan2(fighter.vy, fighter.vx));
  }

  resolveFighterCollisions();

  for (const fighter of fighters) {
    if (fighter.alive) {
      tryAttack(fighter);
    }
  }

  for (let i = explosions.length - 1; i >= 0; i -= 1) {
    explosions[i].age += dt;
    if (explosions[i].age > 0.5) {
      explosions.splice(i, 1);
    }
  }

  renderLists();
}

function circleShade(fighter) {
  const hpRatio = fighter.maxHp === 0 ? 0 : fighter.hp / fighter.maxHp;
  const shade = Math.round(255 * hpRatio);
  return `rgb(${shade}, ${shade}, ${shade})`;
}

function textShade(fighter) {
  const hpRatio = fighter.maxHp === 0 ? 0 : fighter.hp / fighter.maxHp;
  return hpRatio > 0.45 ? '#111111' : '#f5f5f5';
}

function drawFighter(fighter) {
  ctx.save();
  ctx.translate(fighter.x, fighter.y);
  ctx.rotate(fighter.angle);

  ctx.beginPath();
  ctx.arc(0, 0, fighter.radius, 0, Math.PI * 2);
  ctx.fillStyle = circleShade(fighter);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, fighter.radius, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fill();

  ctx.restore();

  ctx.fillStyle = textShade(fighter);
  ctx.font = '700 14px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fighter.name, fighter.x, fighter.y);
}

function drawExplosions() {
  for (const explosion of explosions) {
    const progress = explosion.age / 0.5;
    const alpha = 1 - progress;
    const radius = explosion.baseRadius + progress * 36;

    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.22})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.82})`;
    ctx.lineWidth = 2.5;
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

  if (fighters.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 28px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('이름과 추가 스탯을 입력하면 원이 생성됩니다.', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '500 18px Pretendard, sans-serif';
    ctx.fillText('기본 스탯은 체력 100, 공격 10이며 추가 스탯은 무작위 분배됩니다.', canvas.width / 2, canvas.height / 2 + 28);
  }
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.getElementById('name-input').value.trim();
  const totalBonus = clamp(Number(document.getElementById('bonus-input').value) || 0, 0, 99);
  if (!name) return;

  createFighter(name, totalBonus);
  form.reset();
  document.getElementById('bonus-input').value = '0';
});

renderLists();
requestAnimationFrame(frame);
