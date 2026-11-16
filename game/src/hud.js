// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// killfeed, the buy menu and the one overlay panel. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADE, ARMOR, AMMO } from './weapons.js';

const OVERLAY_COPY = {
  start: {
    title: 'DUSTLINE',
    copy: 'A dusk freight yard, two sites, four defenders. Plant the spike at Silo or Depot — or drop them all — before the timer runs out. First to 5 rounds takes the yard.',
    action: 'Click to play',
  },
  paused: {
    title: 'DUSTLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: { title: '', copy: '', action: 'Next round' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

const BUY_ITEMS = [
  { id: 'rifle', name: WEAPONS.rifle.name, desc: '30-round automatic. 34 body / 100 head. The yard favourite.', price: WEAPONS.rifle.price, key: '1' },
  { id: 'smg', name: WEAPONS.smg.name, desc: '28-round rapid SMG. 22 body / 66 head. Close quarters.', price: WEAPONS.smg.price, key: '2' },
  { id: 'grenade', name: GRENADE.name, desc: 'Thrown explosive, 110 damage in a 6.5 m blast. Press G to throw.', price: GRENADE.price, key: '3' },
  { id: 'armor', name: ARMOR.name, desc: 'Halves all damage taken this match. One vest only.', price: ARMOR.price, key: '4' },
  { id: 'ammo', name: AMMO.name, desc: 'Full reserve ammo for your current weapon.', price: AMMO.price, key: '5' },
];

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playButton = $('play');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const buyClose = $('buy-close');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorBadge = $('armor-badge');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const grenadeValue = $('grenade-value');
  const timerValue = $('timer-value');
  const roundScore = $('round-score');
  const killfeed = $('killfeed');
  const messageBox = $('message');
  const spikeBar = $('spike-bar');
  const spikeFill = $('spike-fill');
  const spikeLabel = $('spike-label');
  const damageVignette = $('damage');
  const plantHint = $('plant-hint');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');

  let hitTimer = 0;
  let damageTimer = 0;
  let last = { mag: -1, reserve: -1, health: -1, money: -1, timer: '', score: '', weapon: '', grenades: -1 };

  // Build the buy menu once; main.js refreshes its affordability.
  for (const item of BUY_ITEMS) {
    const row = document.createElement('div');
    row.className = 'buy-item';
    row.dataset.id = item.id;
    row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => callbacks.onBuy(item.id));
    buyList.appendChild(row);
  }

  function refreshBuy(money, owned, armor, currentWeapon) {
    buyMoney.textContent = `$${money}`;
    for (const row of buyList.children) {
      const item = BUY_ITEMS.find((entry) => entry.id === row.dataset.id);
      const isOwned = item.id === 'rifle' || item.id === 'smg' ? !!owned[item.id] : false;
      const isCurrent = item.id === currentWeapon;
      row.classList.toggle('owned', isOwned || (item.id === 'armor' && armor));
      row.classList.toggle('current', isCurrent);
      row.classList.toggle('cant', money < item.price && !isOwned);
    }
  }

  function renderKillfeed(entries) {
    killfeed.innerHTML = '';
    for (const entry of entries) {
      const line = document.createElement('div');
      line.textContent = entry.text;
      killfeed.appendChild(line);
    }
  }

  return {
    setHealth(health, armor) {
      if (health === last.health) return;
      last.health = health;
      healthFill.style.width = `${Math.max(0, health)}%`;
      healthFill.classList.toggle('low', health <= 30);
      healthValue.textContent = String(Math.max(0, Math.ceil(health)));
      armorBadge.hidden = !armor;
    },
    setAmmo(mag, reserve) {
      if (mag === last.mag && reserve === last.reserve) return;
      last.mag = mag;
      last.reserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setMoney(money) {
      if (money === last.money) return;
      last.money = money;
      moneyValue.textContent = `$${money}`;
    },
    setGrenades(count) {
      if (count === last.grenades) return;
      last.grenades = count;
      grenadeValue.textContent = `◉ ${count}`;
    },
    setWeapon(name) {
      if (name === last.weapon) return;
      last.weapon = name;
      weaponName.textContent = name;
    },
    setTimer(seconds) {
      const text = seconds <= 0 ? '0:00' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      if (text === last.timer) return;
      last.timer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', seconds <= 15 && seconds > 0);
    },
    setScore(round, wins, losses) {
      const text = `ROUND ${round} · YOU ${wins} — ${losses} DEFENDERS`;
      if (text === last.score) return;
      last.score = text;
      roundScore.textContent = text;
    },
    setKillfeed(entries) {
      renderKillfeed(entries);
    },
    showMessage(text) {
      messageBox.textContent = text;
      messageBox.hidden = !text;
    },
    setSpikeBar(label, fraction) {
      if (!label) {
        spikeBar.hidden = true;
        return;
      }
      spikeBar.hidden = false;
      spikeLabel.textContent = label;
      spikeFill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    },
    setPlantHint(text) {
      plantHint.textContent = text;
      plantHint.hidden = !text;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    flashDamage() {
      damageVignette.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damageVignette.classList.remove('on'), 220);
    },
    setCrosshairGap(spread) {
      const gap = Math.round(4 + spread * 900);
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    showOverlay(mode, data = {}) {
      let text = OVERLAY_COPY[mode];
      if (mode === 'roundEnd') {
        text = {
          title: data.won ? 'Round won' : 'Round lost',
          copy: `${data.reason} Score ${data.wins}–${data.losses}. ${data.won ? `+$${data.reward}` : `+$${data.reward}`} in the bank.`,
          action: data.matchOver ? 'See the result' : 'Next round',
        };
      } else if (mode === 'matchEnd') {
        text = {
          title: data.won ? 'Match won' : 'Match lost',
          copy: `${data.reason} Final score ${data.wins}–${data.losses}, ${data.kills} eliminations.`,
          action: 'Play again',
        };
      }
      overlayTitle.textContent = text.title;
      overlayCopy.textContent = text.copy;
      playButton.textContent = text.action;
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    showBuy(money, owned, armor, currentWeapon) {
      refreshBuy(money, owned, armor, currentWeapon);
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    refreshBuy,
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
    onBuyClose(handler) {
      buyClose.addEventListener('click', handler);
    },
  };
}
