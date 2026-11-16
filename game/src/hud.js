// DOM HUD: health/ammo/timer, killfeed, buy menu, scoreboard, minimap.
// One job: read the sim and paint the DOM; no game logic lives here.
import { WEAPONS, GRENADES, ARMOR, ROUND } from './config.js';

export function createHud(sim, els) {
  const feed = [];
  let bannerUntil = 0;
  let lastRound = 0;
  let minimized = false;

  // --- buy menu ---
  const buyMenu = els.buyMenu;
  const buyGrid = buyMenu.querySelector('.buy-grid');
  const items = [];
  for (const id of Object.keys(WEAPONS)) {
    if (id !== 'p250') items.push({ id, name: WEAPONS[id].name, price: WEAPONS[id].price, desc: `${WEAPONS[id].damage} dmg · ${WEAPONS[id].mag} rnd mag` });
  }
  for (const id of Object.keys(GRENADES)) items.push({ id, name: GRENADES[id].name, price: GRENADES[id].price, desc: GRENADES[id].desc });
  items.push({ id: 'vest', name: ARMOR.vest.name, price: ARMOR.vest.price, desc: 'Absorbs 45% of damage.' });
  items.push({ id: 'helmet', name: ARMOR.helmet.name, price: ARMOR.helmet.price, desc: 'Headshots hurt less.' });
  items.push({ id: 'kit', name: ARMOR.kit.name, price: ARMOR.kit.price, desc: 'Defuse in 2.5 s instead of 5 s.' });
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'buy-item';
    b.dataset.id = it.id;
    b.innerHTML = `<b>${it.name}</b><span>$${it.price}</span><i>${it.desc}</i>`;
    b.addEventListener('click', () => {
      const res = sim.buyItem(sim.player(), it.id);
      if (!res.ok) flashHint(res.why);
      refreshBuy();
    });
    buyGrid.appendChild(b);
  }
  function refreshBuy() {
    const p = sim.player();
    buyMenu.querySelectorAll('.buy-item').forEach((b) => {
      const id = b.dataset.id;
      const price = WEAPONS[id]?.price ?? GRENADES[id]?.price ?? ARMOR[id]?.price ?? 0;
      const owned = (WEAPONS[id] && (p.weapons.primary === id || p.weapons.pistol === id)) ||
        (GRENADES[id] && p.grenades.includes(id)) ||
        (id === 'vest' && p.armor >= 100) || (id === 'helmet' && p.helmet) || (id === 'kit' && p.hasKit);
      b.disabled = owned || p.money < price;
      b.classList.toggle('owned', !!owned);
    });
    buyMenu.querySelector('.buy-money').textContent = `$${p.money}`;
  }

  // --- killfeed ---
  function pushFeed(html) {
    const div = document.createElement('div');
    div.className = 'feed-item';
    div.innerHTML = html;
    els.killfeed.prepend(div);
    feed.push({ el: div, until: performance.now() + 5000 });
    while (feed.length > 5) feed.shift().el.remove();
  }

  function flashHint(text) {
    els.hint.textContent = text;
    els.hint.classList.add('show');
    setTimeout(() => els.hint.classList.remove('show'), 1600);
  }

  function showBanner(text, sub, good) {
    els.banner.querySelector('h2').textContent = text;
    els.banner.querySelector('p').textContent = sub;
    els.banner.classList.toggle('good', !!good);
    els.banner.classList.toggle('bad', !good);
    els.banner.hidden = false;
    bannerUntil = performance.now() + 4200;
  }

  // --- scoreboard ---
  function renderScoreboard() {
    const rows = [...sim.fighters].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    let html = '<table><tr><th>Player</th><th>K</th><th>D</th><th>$</th></tr>';
    for (const f of rows) {
      html += `<tr class="${f.team === 'A' ? 'ta' : 'tb'}${f.id === 0 ? ' you' : ''}"><td>${f.id === 0 ? 'You' : f.name}</td><td>${f.kills}</td><td>${f.deaths}</td><td>${f.money}</td></tr>`;
    }
    html += '</table>';
    els.scoreboardBody.innerHTML = html;
  }

  // --- minimap ---
  const mm = els.minimap.getContext('2d');
  function drawMinimap() {
    const W = 176; const H = 128;
    mm.clearRect(0, 0, W, H);
    mm.fillStyle = 'rgba(20,14,10,0.82)';
    mm.fillRect(0, 0, W, H);
    const sx = (x) => (x + 36) / 72 * W;
    const sz = (z) => (z + 26) / 52 * H;
    // Walls/cover top-down.
    mm.fillStyle = 'rgba(200,170,120,0.35)';
    for (const b of sim.map.colliders) {
      if (b.maxY > 3) continue; // skip tall walls/bridge clutter
      mm.fillRect(sx(b.minX), sz(b.minZ), Math.max(1, sx(b.maxX) - sx(b.minX)), Math.max(1, sz(b.maxZ) - sz(b.minZ)));
    }
    // Sites.
    for (const key of ['A', 'B']) {
      const s = sim.map.sites[key];
      mm.strokeStyle = key === 'A' ? '#ffb347' : '#7fd4ff';
      mm.lineWidth = 1.5;
      mm.beginPath(); mm.arc(sx(s.x), sz(s.z), 9, 0, Math.PI * 2); mm.stroke();
      mm.fillStyle = mm.strokeStyle;
      mm.font = 'bold 11px system-ui';
      mm.fillText(key, sx(s.x) - 3.5, sz(s.z) + 4);
    }
    // Bomb.
    const bomb = sim.bomb.bomb;
    if (bomb.state === 'planted') {
      mm.fillStyle = '#ff4d4d';
      mm.beginPath(); mm.arc(sx(bomb.x), sz(bomb.z), 4, 0, Math.PI * 2); mm.fill();
    }
    // Recent enemy gunfire pings.
    const now = sim.time;
    for (const n of sim.noiseLog) {
      if (n.team === 'A' || now - n.at > 3) continue;
      mm.fillStyle = 'rgba(255,77,77,0.9)';
      mm.beginPath(); mm.arc(sx(n.x), sz(n.z), 3, 0, Math.PI * 2); mm.fill();
    }
    // Fighters.
    for (const f of sim.fighters) {
      if (!f.alive) continue;
      mm.fillStyle = f.id === 0 ? '#ffffff' : f.team === 'A' ? '#ffb347' : '#7fd4ff';
      mm.beginPath(); mm.arc(sx(f.x), sz(f.z), f.id === 0 ? 4 : 3, 0, Math.PI * 2); mm.fill();
    }
    // Player facing arrow.
    const p = sim.player();
    mm.strokeStyle = '#ffffff'; mm.lineWidth = 2;
    mm.beginPath();
    mm.moveTo(sx(p.x), sz(p.z));
    mm.lineTo(sx(p.x) + -Math.sin(p.yaw) * 9, sz(p.z) + -Math.cos(p.yaw) * 9);
    mm.stroke();
  }

  function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'kill') {
        pushFeed(`<span class="ta">${e.killer.name}</span> <span class="w">${WEAPONS[e.killer.weapon]?.name || ''}</span> <span class="tb">${e.victim.name}</span>`);
      } else if (e.type === 'bombPlanted') {
        pushFeed(`<span class="warn">Bomb planted at site ${e.site}!</span>`);
        flashHint('Bomb planted — defend it!');
      } else if (e.type === 'bombDefused') {
        pushFeed(`<span class="good">Bomb defused by ${e.fighter.name}</span>`);
      } else if (e.type === 'roundEnd') {
        const won = e.winner === 'A';
        showBanner(won ? 'Attackers win the round' : 'Defenders win the round', `${e.reason} — ${e.score.A} : ${e.score.B}`, won);
      } else if (e.type === 'matchEnd') {
        const won = e.winner === 'A';
        showBanner(e.winner ? (won ? 'VICTORY — Attackers take the match' : 'Defeat — Defenders take the match') : 'Draw', `Final score ${e.score.A} : ${e.score.B}`, won);
      } else if (e.type === 'buy' && e.fighter.id === 0) {
        refreshBuy();
      }
    }
  }

  function update(dt) {
    const p = sim.player();
    const now = performance.now();
    if (now > bannerUntil) els.banner.hidden = true;
    // Prune feed.
    for (let i = feed.length - 1; i >= 0; i--) {
      if (now > feed[i].until) { feed[i].el.remove(); feed.splice(i, 1); }
    }
    // Health / armor / ammo.
    els.health.textContent = Math.max(0, Math.ceil(p.hp));
    els.health.classList.toggle('low', p.hp <= 30);
    els.armor.textContent = Math.ceil(p.armor);
    const ammo = p.ammo[p.weapon];
    els.ammoMag.textContent = ammo ? ammo.mag : 0;
    els.ammoReserve.textContent = ammo ? `/ ${ammo.reserve}` : '';
    els.ammoBox.classList.toggle('empty', !ammo || ammo.mag === 0);
    els.ammoBox.classList.toggle('reloading', p.reloading > 0);
    els.weaponName.textContent = WEAPONS[p.weapon].name + (p.reloading > 0 ? ' — reloading' : '');
    els.money.textContent = `$${p.money}`;
    // Timer + score.
    const t = Math.max(0, Math.ceil(sim.phaseT));
    els.timer.textContent = sim.phase === 'live' ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` :
      sim.phase === 'buy' ? `BUY ${t}` : sim.phase === 'round_end' ? '—' : '';
    els.timer.classList.toggle('urgent', sim.phase === 'live' && t <= 15);
    els.scoreA.textContent = sim.score.A;
    els.scoreB.textContent = sim.score.B;
    els.roundLabel.textContent = `ROUND ${Math.max(1, sim.round)} / 13`;
    els.callout.textContent = sim.map.zoneAt(p.x, p.z);
    // Bomb status.
    const bomb = sim.bomb.bomb;
    if (bomb.state === 'planted') {
      const left = Math.max(0, ROUND.bombSeconds - (sim.time - bomb.plantedAt));
      els.bombStatus.textContent = `BOMB PLANTED — ${left.toFixed(0)}s`;
      els.bombStatus.classList.add('planted');
    } else if (bomb.carrier === p) {
      els.bombStatus.textContent = 'YOU CARRY THE BOMB — plant at A or B (hold E)';
      els.bombStatus.classList.remove('planted');
    } else if (bomb.state === 'carried' || bomb.state === 'dropped') {
      els.bombStatus.textContent = bomb.state === 'dropped' ? 'BOMB DROPPED — pick it up' : 'Bomb with ' + (bomb.carrier ? bomb.carrier.name : '—');
      els.bombStatus.classList.remove('planted');
    } else {
      els.bombStatus.textContent = '';
    }
    // Plant/defuse progress.
    const prog = bomb.planter === p ? bomb.plantProgress : bomb.defuser === p ? bomb.defuseProgress : 0;
    els.plantBar.style.width = `${Math.round(prog * 100)}%`;
    els.plantWrap.hidden = prog <= 0;
    els.plantLabel.textContent = bomb.planter === p ? 'PLANTING…' : 'DEFUSING…';
    // Grenade belt.
    els.grenades.innerHTML = p.grenades.map((g) => `<span class="g">${GRENADES[g].name} [${GRENADES[g].key}]</span>`).join('') ||
      '<span class="g dim">No grenades — buy with B</span>';
    // Crosshair spread.
    const w = WEAPONS[p.weapon];
    const gap = 6 + (w.spread + (p.moving ? w.moveSpread : 0) + p.bloom) * 900;
    els.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    // Flash + damage vignette.
    const flashLeft = Math.max(0, p.flashUntil - sim.time);
    els.flashOverlay.style.opacity = flashLeft > 0 ? (flashLeft / 2.6).toFixed(2) : 0;
    els.vignette.style.opacity = p.hp < 100 ? ((100 - p.hp) / 100 * 0.55).toFixed(2) : 0;
    // Buy menu visibility (B minimizes it during the buy phase).
    const showBuy = sim.phase === 'buy';
    if (!showBuy) minimized = false;
    buyMenu.hidden = !showBuy || minimized;
    if (showBuy) refreshBuy();
    // Round change resets the banner timer.
    if (sim.round !== lastRound) { lastRound = sim.round; }
    drawMinimap();
    if (!els.scoreboard.hidden) renderScoreboard();
  }

  function toggleMinimize() { minimized = !minimized; }

  return { update, handleEvents, refreshBuy, showBanner, flashHint, renderScoreboard, toggleMinimize };
}
