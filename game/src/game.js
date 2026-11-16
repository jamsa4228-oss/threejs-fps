// The match: one state object, phases, the economy and the spike objective.
// No DOM here; main.js pushes events out and the HUD reads this state.
// A match is first to 5 round wins, at most 9 rounds.
import { WEAPONS, GRENADE, ARMOR, AMMO } from './weapons.js';

export const START_MONEY = 1000;
export const KILL_REWARD = 300;
export const WIN_REWARD = 2000;
export const LOSS_REWARD = 1400;
export const PLANT_REWARD = 300;
export const ROUND_TIME = 100;
export const SPIKE_TIME = 35;
export const PLANT_SECONDS = 3;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createGame(events) {
  const state = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 0,
    wins: 0,
    losses: 0,
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    health: 100,
    armor: false,
    roundTimeLeft: ROUND_TIME,
    roundEndAt: 0,
    roundEndReason: '',
    roundWon: false,
    matchReason: '',
    owned: { pistol: true, smg: false, rifle: false },
    currentWeapon: 'pistol',
    grenades: 0,
    plantProgress: 0,
    planting: false,
    plantSite: null,
    spike: { planted: false, x: 0, z: 0, site: null, timer: 0 },
    killfeed: [],
    message: '',
    messageUntil: 0,
  };

  function feed(text) {
    state.killfeed.unshift({ text, at: performance.now() });
    if (state.killfeed.length > 5) state.killfeed.length = 5;
  }

  function say(text, seconds = 2.5) {
    state.message = text;
    state.messageUntil = performance.now() + seconds * 1000;
  }

  function startMatch() {
    state.round = 0;
    state.wins = 0;
    state.losses = 0;
    state.money = START_MONEY;
    state.kills = 0;
    state.deaths = 0;
    state.owned = { pistol: true, smg: false, rifle: false };
    state.currentWeapon = 'pistol';
    state.grenades = 0;
    state.armor = false;
    state.killfeed = [];
    state.spike = { planted: false, x: 0, z: 0, site: null, timer: 0 };
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.health = 100;
    state.roundTimeLeft = ROUND_TIME;
    state.plantProgress = 0;
    state.planting = false;
    state.plantSite = null;
    state.spike = { planted: false, x: 0, z: 0, site: null, timer: 0 };
    state.phase = 'buy';
    events.onRoundStart(state.round);
  }

  function beginLive() {
    state.phase = 'live';
  }

  function addKill(botName, headshot) {
    state.kills += 1;
    state.money += KILL_REWARD;
    feed(`You eliminated ${botName}${headshot ? ' — headshot' : ''}  +$${KILL_REWARD}`);
  }

  function applyDamage(amount) {
    if (state.phase !== 'live' || state.health <= 0) return false;
    const taken = state.armor ? Math.round(amount * (1 - ARMOR.absorb)) : amount;
    state.health = Math.max(0, state.health - taken);
    events.onHurt();
    if (state.health <= 0) {
      state.deaths += 1;
      endRound(false, 'You were eliminated.');
    }
    return true;
  }

  function plantSpike(site, x, z) {
    state.spike = { planted: true, x, z, site, timer: SPIKE_TIME };
    state.money += PLANT_REWARD;
    state.plantProgress = 0;
    state.planting = false;
    feed(`Spike planted at ${site}  +$${PLANT_REWARD}`);
    say(`Spike planted at Site ${site} — defend it!`, 4);
    events.onPlant(site);
  }

  function endRound(won, reason) {
    if (state.phase !== 'live' && state.phase !== 'buy') return;
    state.phase = 'roundEnd';
    state.roundWon = won;
    state.roundEndReason = reason;
    if (won) {
      state.wins += 1;
      state.money += WIN_REWARD;
      feed(`Round ${state.round} won  +$${WIN_REWARD}`);
      events.onRoundWin();
    } else {
      state.losses += 1;
      state.money += LOSS_REWARD;
      feed(`Round ${state.round} lost  +$${LOSS_REWARD}`);
      events.onRoundLose();
    }
    state.roundEndAt = performance.now();
    if (state.wins >= WIN_ROUNDS || state.losses >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      state.matchReason = state.wins > state.losses
        ? `Match won ${state.wins}–${state.losses}. Dustline is yours.`
        : `Match lost ${state.wins}–${state.losses}. The yard keeps its secrets.`;
      events.onMatchEnd(state.wins > state.losses);
    }
  }

  function nextRound() {
    if (state.phase === 'matchEnd') {
      startMatch();
      return;
    }
    startRound();
  }

  function buy(id) {
    const price = id === 'grenade' ? GRENADE.price : id === 'armor' ? ARMOR.price : id === 'ammo' ? AMMO.price : WEAPONS[id].price;
    if (state.money < price) return { ok: false, reason: 'Not enough money' };
    if (id === 'grenade') {
      state.grenades += 1;
    } else if (id === 'armor') {
      if (state.armor) return { ok: false, reason: 'Vest already worn' };
      state.armor = true;
    } else if (id === 'ammo') {
      events.onAmmoBought();
    } else {
      if (state.owned[id]) return { ok: false, reason: 'Already owned' };
      state.owned[id] = true;
      state.currentWeapon = id;
      events.onWeaponBought(id);
    }
    state.money -= price;
    return { ok: true };
  }

  function step(dt, now) {
    if (state.phase !== 'live') return;
    state.roundTimeLeft -= dt;
    if (state.spike.planted) {
      state.spike.timer -= dt;
      if (state.spike.timer <= 0) {
        events.onSpikeDetonate(state.spike.site);
        endRound(true, 'The spike detonated. Site cleared.');
        return;
      }
    } else if (state.roundTimeLeft <= 0) {
      endRound(false, 'Time expired — the spike was never planted.');
    }
  }

  return {
    state,
    startMatch,
    startRound,
    beginLive,
    nextRound,
    addKill,
    applyDamage,
    plantSpike,
    endRound,
    buy,
    feed,
    say,
    step,
  };
}
