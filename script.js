const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const queueForm = document.getElementById('queue-form');
const startButton = document.getElementById('start-button');
const cancelEditButton = document.getElementById('cancel-edit-button');
const queueSubmitButton = document.getElementById('queue-submit-button');
const editStatus = document.getElementById('edit-status');
const speedButtons = document.getElementById('speed-buttons');
const queueListEl = document.getElementById('queue-list');
const liveListEl = document.getElementById('live-list');
const deathListEl = document.getElementById('death-list');
const nameInput = document.getElementById('name-input');
const bonusInput = document.getElementById('bonus-input');

const fighters = [];
const pendingQueue = [];
const explosions = [];
const deathOrder = [];

const CONFIG = {
  baseHp: 100,
  baseAtk: 10,
  radius: 34,
  moveSpeed: 205,
  attackCooldown: 0.62,
  collisionPadding: 2,
};

let lastTime = performance.now();
let nextId = 1;
let spawnIndex = 0;
let speedMultiplier = 1;
let editingQueueId = null;

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

function buildQueuedFighter(name, totalBonus, existingId = null) {
  const bonus = randomBonusDistribution(totalBonus);
  return {
    id: existingId ?? `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    totalBonus,
    hpUnits: bonus.hpUnits,
    atkUnits: bonus.atkUnits,
    maxHp: CONFIG.baseHp + bonus.hpUnits * 10,
    atk: CONFIG.baseAtk + bonus.atkUnits,
  };
}

function resetFormMode() {
  editingQueueId = null;
  queueSubmitButton.textContent = '대기열 추가';
  cancelEditButton.disabled = true;
  editStatus.textContent = '현재는 새 공을 대기열에 추가하는 모드입니다.';
  queueForm.reset();
  bonusInput.value = '0';
}

function loadQueueItemForEdit(queueId) {
  const fighter = pendingQueue.find((item) => item.id === queueId);
  if (!fighter) return;

  editingQueueId = queueId;
  nameInput.value = fighter.name;
  bonusInput.value = fighter.totalBonus;
  queueSubmitButton.textContent = '수정 저장';
  cancelEditButton.disabled = false;
  editStatus.textContent = `${fighter.name} 공을 수정 중입니다. 저장하면 스탯이 다시 무작위 배분됩니다.`;
  renderLists();
}

function queueOrUpdateFighter(name, totalBonus) {
  if (editingQueueId) {
    const index = pendingQueue.findIndex((item) => item.id === editingQueueId);
    if (index !== -1) {
      pendingQueue[index] = buildQueuedFighter(name, totalBonus, editingQueueId);
    }
    resetFormMode();
    renderLists();
    return;
  }

  pendingQueue.push(buildQueuedFighter(name, totalBonus));
  queueForm.reset();
  bonusInput.value = '0';
  renderLists();
}

function removeQueuedFighter(queueId) {
  const index = pendingQueue.findIndex((item) => item.id === queueId);
  if (index === -1) return;

  pendingQueue.splice(index, 1);
  if (editingQueueId === queueId) {
    resetFormMode();
  }
  renderLists();
}

function deployQueuedFighters() {
  if (pendingQueue.length === 0) {
    return;
  }

  fighters.length = 0;
  deathOrder.length = 0;
  explosions.length = 0;
  spawnIndex = 0;

  for (const queued of pendingQueue) {
    const spawn = randomSpawnPosition();
    const angle = Math.random() * Math.PI * 2;

    fighters.push({
      id: nextId++,
      name: queued.name,
      totalBonus: queued.totalBonus,
      hpUnits: queued.hpUnits,
      atkUnits: queued.atkUnits,
      x: spawn.x,
      y: spawn.y,
      angle,
      vx: Math.cos(angle) * CONFIG.moveSpeed,
      vy: Math.sin(angle) * CONFIG.moveSpeed,
      radius: CONFIG.radius,
      maxHp: queued.maxHp,
      hp: queued.maxHp,
      atk: queued.atk,
      cooldown: Math.random() * 0.2,
      alive: true,
    });
  }

  pendingQueue.length = 0;
  resetFormMode();
  renderLists();
}

function renderLists() {
  if (pendingQueue.length === 0) {
    queueListEl.classList.add('empty-list');
    queueListEl.innerHTML = '<li>아직 대기 중인 공이 없습니다.</li>';
  } else {
    queueListEl.classList.remove('empty-list');
    queueListEl.innerHTML = pendingQueue
      .map((fighter, index) => `
        <li class="queue-item ${fighter.id === editingQueueId ? 'active-edit' : ''}">
          <div class="queue-title">${index + 1}. ${fighter.name}</div>
          <div>체력 ${fighter.maxHp} · 공격 ${fighter.atk}</div>
          <div>추가스탯 ${fighter.totalBonus} (체력 ${fighter.hpUnits}, 공격 ${fighter.atkUnits})</div>
          <div class="queue-actions">
            <button type="button" class="ghost-button" data-action="edit" data-id="${fighter.id}">수정</button>
            <button type="button" class="ghost-button" data-action="remove" data-id="${fighter.id}">삭제</button>
          </div>
        </li>
      `)
      .join('');
  }

  const living = fighters.filter((fighter) => fighter.alive);
  if (living.length === 0) {
    liveListEl.classList.add('empty-list');
    liveListEl.innerHTML = '<li>아직 경기장에 나온 원이 없습니다.</li>';
  } else {
    liveListEl.classList.remove('empty-list');
    liveListEl.innerHTML = living
      .map((fighter) => `<li>${fighter.name} · 체력 ${Math.ceil(fighter.hp)}/${fighter.maxHp} · 공격 ${fighter.atk}</li>`)
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

function isTargetInFront(attacker, target) {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const distance = Math.hypot(dx, dy) || 1;
  const facingX = Math.cos(attacker.angle);
  const facingY = Math.sin(attacker.angle);
  const alignment = (dx / distance) * facingX + (dy / distance) * facingY;
  return alignment >= 0;
}

function resolveCombat() {
  const damageMap = new Map();

  for (let i = 0; i < fighters.length; i += 1) {
    const a = fighters[i];
    if (!a.alive) continue;

    for (let j = i + 1; j < fighters.length; j += 1) {
      const b = fighters[j];
      if (!b.alive) continue;

      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const contactRange = a.radius + b.radius + 2;
      if (distance > contactRange) continue;

      const aCanAttack = a.cooldown <= 0 && isTargetInFront(a, b);
      const bCanAttack = b.cooldown <= 0 && isTargetInFront(b, a);
      if (!aCanAttack && !bCanAttack) continue;

      if (aCanAttack) {
        damageMap.set(b.id, (damageMap.get(b.id) || 0) + a.atk);
        a.cooldown = CONFIG.attackCooldown;
      }

      if (bCanAttack) {
        damageMap.set(a.id, (damageMap.get(a.id) || 0) + b.atk);
        b.cooldown = CONFIG.attackCooldown;
      }
    }
  }

  for (const fighter of fighters) {
    if (!fighter.alive) continue;
    const damage = damageMap.get(fighter.id);
    if (!damage) continue;
    fighter.hp = clamp(fighter.hp - damage, 0, fighter.maxHp);
  }

  for (const fighter of fighters) {
    if (fighter.alive && fighter.hp <= 0) {
      explode(fighter);
    }
  }
}

function update(dt) {
  const scaledDt = dt * speedMultiplier;

  for (const fighter of fighters) {
    if (!fighter.alive) continue;

    fighter.cooldown = Math.max(0, fighter.cooldown - scaledDt);
    fighter.x += fighter.vx * scaledDt;
    fighter.y += fighter.vy * scaledDt;

    reflectAgainstWalls(fighter);
    fighter.angle = normalizeAngle(Math.atan2(fighter.vy, fighter.vx));
  }

  resolveFighterCollisions();
  resolveCombat();

  for (let i = explosions.length - 1; i >= 0; i -= 1) {
    explosions[i].age += scaledDt;
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

  if (fighters.filter((fighter) => fighter.alive).length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 28px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('대기열에 공을 추가한 뒤 시작 버튼을 눌러주세요.', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '500 18px Pretendard, sans-serif';
    ctx.fillText('대기열의 수정 버튼으로 시작 전 이름과 스탯을 바꿀 수 있습니다.', canvas.width / 2, canvas.height / 2 + 28);
  }
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

queueForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const totalBonus = clamp(Number(bonusInput.value) || 0, 0, 99);
  if (!name) return;

  queueOrUpdateFighter(name, totalBonus);
});

cancelEditButton.addEventListener('click', () => {
  resetFormMode();
  renderLists();
});

queueListEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === 'edit') {
    loadQueueItemForEdit(id);
  }

  if (action === 'remove') {
    removeQueuedFighter(id);
  }
});

startButton.addEventListener('click', () => {
  deployQueuedFighters();
});

speedButtons.addEventListener('click', (event) => {
  const button = event.target.closest('.speed-button');
  if (!button) return;

  speedMultiplier = Number(button.dataset.speed) || 1;
  document.querySelectorAll('.speed-button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
});

resetFormMode();
renderLists();
requestAnimationFrame(frame);
