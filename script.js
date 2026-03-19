const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const fighterForm = document.getElementById('fighter-form');
const fighterRowsEl = document.getElementById('fighter-rows');
const addRowButton = document.getElementById('add-row-button');
const speedSlider = document.getElementById('speed-slider');
const speedLabel = document.getElementById('speed-label');
const liveListEl = document.getElementById('live-list');
const deathListEl = document.getElementById('death-list');
const rowTemplate = document.getElementById('fighter-row-template');

const fighters = [];
const explosions = [];
const deathOrder = [];

const CONFIG = {
  baseHp: 100,
  baseAtk: 10,
  radius: 34,
  moveSpeed: 410,
  attackCooldown: 0.62,
  collisionPadding: 2,
  minRows: 2,
};

let lastTime = performance.now();
let nextId = 1;
let spawnIndex = 0;
let speedMultiplier = 1;
let nextDraftId = 1;

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

function updateRowRemoveButtons() {
  const rows = fighterRowsEl.querySelectorAll('.fighter-row');
  rows.forEach((row, index) => {
    const removeButton = row.querySelector('.remove-row-button');
    removeButton.disabled = rows.length <= CONFIG.minRows;
    removeButton.textContent = rows.length <= CONFIG.minRows ? `기본 입력칸 ${index + 1}` : '삭제';
  });
}

function createInputRow(initialName = '', initialBonus = 0) {
  const fragment = rowTemplate.content.cloneNode(true);
  const row = fragment.querySelector('.fighter-row');
  row.dataset.rowId = `draft-${nextDraftId++}`;

  const nameInput = fragment.querySelector('.fighter-name');
  const bonusInput = fragment.querySelector('.fighter-bonus');
  nameInput.value = initialName;
  bonusInput.value = initialBonus;

  fighterRowsEl.appendChild(fragment);
  updateRowRemoveButtons();
}

function ensureInitialRows() {
  fighterRowsEl.innerHTML = '';
  createInputRow();
  createInputRow();
}

function readDrafts() {
  return [...fighterRowsEl.querySelectorAll('.fighter-row')]
    .map((row) => ({
      rowId: row.dataset.rowId,
      name: row.querySelector('.fighter-name').value.trim(),
      totalBonus: clamp(Number(row.querySelector('.fighter-bonus').value) || 0, 0, 99),
    }))
    .filter((fighter) => fighter.name.length > 0);
}

function buildFighterFromDraft(draft) {
  const bonus = randomBonusDistribution(draft.totalBonus);
  const spawn = randomSpawnPosition();
  const angle = Math.random() * Math.PI * 2;
  return {
    id: nextId++,
    name: draft.name,
    totalBonus: draft.totalBonus,
    hpUnits: bonus.hpUnits,
    atkUnits: bonus.atkUnits,
    x: spawn.x,
    y: spawn.y,
    angle,
    vx: Math.cos(angle) * CONFIG.moveSpeed,
    vy: Math.sin(angle) * CONFIG.moveSpeed,
    radius: CONFIG.radius,
    maxHp: CONFIG.baseHp + bonus.hpUnits * 10,
    hp: CONFIG.baseHp + bonus.hpUnits * 10,
    atk: CONFIG.baseAtk + bonus.atkUnits,
    cooldown: Math.random() * 0.2,
    alive: true,
  };
}

function deployDrafts() {
  const drafts = readDrafts();
  if (drafts.length === 0) {
    return;
  }

  fighters.length = 0;
  deathOrder.length = 0;
  explosions.length = 0;
  spawnIndex = 0;

  for (const draft of drafts) {
    fighters.push(buildFighterFromDraft(draft));
  }

  renderLists();
}

function renderLists() {
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
    ctx.fillText('왼쪽 입력칸에서 공 정보를 적고 시작을 눌러주세요.', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '500 18px Pretendard, sans-serif';
    ctx.fillText('추가 스탯으로 공격이 오르면 충돌 시 그 공격력만큼 체력이 즉시 줄어듭니다.', canvas.width / 2, canvas.height / 2 + 28);
  }
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

fighterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  deployDrafts();
});

addRowButton.addEventListener('click', () => {
  createInputRow();
});

fighterRowsEl.addEventListener('click', (event) => {
  const removeButton = event.target.closest('.remove-row-button');
  if (!removeButton || removeButton.disabled) return;

  removeButton.closest('.fighter-row')?.remove();
  updateRowRemoveButtons();
});

speedSlider.addEventListener('input', () => {
  speedMultiplier = Number(speedSlider.value) || 1;
  speedLabel.textContent = `${speedMultiplier.toFixed(1)}x`;
});

ensureInitialRows();
renderLists();
requestAnimationFrame(frame);
