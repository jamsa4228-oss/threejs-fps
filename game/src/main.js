// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|buy|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, PLAYER_SPAWN, BOT_SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet, createGrenadeMesh, WEAPONS, GRENADE } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createGame, PLANT_SECONDS } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const effects = createEffects(scene);
const player = createPlayer(world.colliders, PLAYER_SPAWN.pos[0], PLAYER_SPAWN.pos[1]);
const weapons = createWeaponSet(camera);
const input = createInput(renderer.domElement, onLockChange);

// The player's hitbox: an invisible box the bots' raycasts test against.
const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.72, 0.68), new THREE.MeshBasicMaterial({ visible: false }));
hitbox.visible = false;
scene.add(hitbox);
player.hitbox = hitbox;

const bots = createBots(scene, world, onBotShot);
bots.spawnAll(BOT_SPAWNS);

const game = createGame({
  onRoundStart(round) {
    player.teleport(PLAYER_SPAWN.pos[0], PLAYER_SPAWN.pos[1], PLAYER_SPAWN.yaw);
    bots.reset(BOT_SPAWNS);
    weapons.refillAmmo();
    effects.hideSpike();
    hud.showBuy(game.state.money, game.state.owned, game.state.armor, game.state.currentWeapon);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onRoundWin() { audio.roundWin(); },
  onRoundLose() { audio.roundLose(); },
  onMatchEnd() {},
  onPlant(site) {
    audio.plant();
    effects.showSpike(game.state.spike.x, game.state.spike.z);
  },
  onSpikeDetonate(site) {
    audio.explosion();
    effects.explode(new THREE.Vector3(game.state.spike.x, 0.5, game.state.spike.z));
    effects.hideSpike();
  },
  onHurt() { hud.flashDamage(); },
  onWeaponBought(id) { weapons.switchTo(id); },
  onAmmoBought() { weapons.topUpReserve(); },
});

const hud = createHud({
  onBuy(id) {
    const result = game.buy(id);
    if (result.ok) {
      audio.buy();
      hud.refreshBuy(game.state.money, game.state.owned, game.state.armor, game.state.currentWeapon);
      hud.setMoney(game.state.money);
      hud.setGrenades(game.state.grenades);
      hud.setWeapon(weapons.current.name.toUpperCase());
    } else {
      audio.denied();
      game.say(result.reason, 1.5);
    }
  },
});

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const _point = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _eye = new THREE.Vector3();

const body = player.state;
const gstate = game.state;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let shake = 0;
let stepAccumulator = 0;
let lastFeedLength = -1;
let plantingSite = null;
let prevFiring = false;

// One live grenade at a time: position, velocity, fuse.
const grenade = { active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, mesh: null };
grenade.mesh = createGrenadeMesh(scene);

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (gstate.phase === 'menu') {
    game.startMatch();
    hud.hideOverlay();
    return;
  }
  if (gstate.phase === 'roundEnd') {
    hud.hideOverlay();
    game.nextRound();
    return;
  }
  if (gstate.phase === 'matchEnd') {
    hud.hideOverlay();
    game.startMatch();
    return;
  }
  if (gstate.phase === 'live') {
    input.requestLock();
    return;
  }
  if (gstate.phase === 'buy') {
    deploy();
  }
});

hud.onBuyClose(() => {
  if (gstate.phase === 'buy') deploy();
});

function deploy() {
  hud.hideBuy();
  game.beginLive();
  input.requestLock();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (gstate.phase === 'live' && gstate.health > 0) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  const shakeX = shake > 0 ? (random() * 2 - 1) * shake * 0.02 : 0;
  const shakeY = shake > 0 ? (random() * 2 - 1) * shake * 0.02 : 0;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + shakeX, body.yaw + shakeY, 0, 'YXZ');
  hitbox.position.set(body.position.x, body.position.y + 0.86, body.position.z);
}

function siteAt(x, z) {
  _point.set(x, 1, z);
  for (const [key, site] of Object.entries(world.sites)) {
    if (site.box.containsPoint(_point)) return key;
  }
  return null;
}

function shoot(spread) {
  if (!weapons.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = weapons.current.range;
  const targets = bots.hitMeshes.concat(world.shootables);
  const hit = raycaster.intersectObjects(targets, false)[0];
  _from.copy(camera.position);
  if (hit) {
    _to.copy(hit.point);
    effects.sparksAt(hit.point, 4);
  } else {
    _to.copy(camera.position).addScaledVector(direction, weapons.current.range);
  }
  effects.tracer(_from, _to);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const headshot = hit.object.userData.part === 'head';
    const damage = headshot ? weapons.current.damageHead : weapons.current.damageBody;
    const killed = bots.damage(bot, damage, hit.object.userData.part);
    audio.hit(killed);
    hud.hitMarker(killed, shot ? 4000 : 90);
    if (killed) {
      game.addKill(bot.name, headshot);
      hud.setKillfeed(gstate.killfeed);
      lastFeedLength = gstate.killfeed.length;
      if (bots.aliveCount() === 0 && !gstate.spike.planted) {
        game.endRound(true, 'All defenders eliminated.');
        showRoundEnd();
      }
    }
  }
  weapons.pullTrigger();
  audio.shot(weapons.current.kind);
  player.recoil(weapons.current.recoilPitch + random() * 0.004, (random() * 2 - 1) * weapons.current.recoilYaw);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve);
  // Nearby bots hear the shot and come looking.
  bots.hearShot(body.position.x, body.position.z);
  return true;
}

function onBotShot(bot, from, to, damage) {
  effects.tracer(from, to);
  audio.shot('bot');
  if (damage > 0 && gstate.phase === 'live') {
    game.applyDamage(damage);
    shake = Math.min(1, shake + 0.4);
  }
}

function throwGrenade() {
  if (gstate.grenades <= 0 || grenade.active) return;
  gstate.grenades -= 1;
  hud.setGrenades(gstate.grenades);
  audio.pin();
  camera.getWorldDirection(direction);
  grenade.pos.copy(camera.position);
  grenade.vel.copy(direction).multiplyScalar(15);
  grenade.vel.y += 3.5;
  grenade.fuse = GRENADE.fuse;
  grenade.active = true;
  grenade.mesh.mesh.visible = true;
}

function detonateGrenade() {
  grenade.active = false;
  grenade.mesh.mesh.visible = false;
  grenade.mesh.light.intensity = 0;
  effects.explode(grenade.pos);
  audio.explosion();
  shake = 1;
  const radius = GRENADE.radius;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.body.state.position.x - grenade.pos.x, bot.body.state.position.z - grenade.pos.z);
    if (d < radius) {
      const damage = Math.round(GRENADE.damage * (1 - d / radius) + 20);
      const killed = bots.damage(bot, damage, 'torso');
      if (killed) {
        game.addKill(bot.name, false);
        hud.setKillfeed(gstate.killfeed);
        lastFeedLength = gstate.killfeed.length;
        if (bots.aliveCount() === 0 && !gstate.spike.planted) {
          game.endRound(true, 'All defenders eliminated.');
          showRoundEnd();
        }
      }
    }
  }
  const playerDistance = Math.hypot(body.position.x - grenade.pos.x, body.position.z - grenade.pos.z);
  if (playerDistance < radius && gstate.phase === 'live') {
    game.applyDamage(Math.round(GRENADE.damage * 0.6 * (1 - playerDistance / radius) + 10));
  }
}

function stepGrenade(dt) {
  if (!grenade.active) return;
  grenade.fuse -= dt;
  grenade.vel.y -= 14 * dt;
  grenade.pos.addScaledVector(grenade.vel, dt);
  // Cheap bounce: if inside any collider, reflect the dominant velocity axis.
  for (const collider of world.colliders) {
    if (grenade.pos.x > collider.min.x && grenade.pos.x < collider.max.x
      && grenade.pos.y > collider.min.y && grenade.pos.y < collider.max.y
      && grenade.pos.z > collider.min.z && grenade.pos.z < collider.max.z) {
      const dxMin = Math.min(Math.abs(grenade.pos.x - collider.min.x), Math.abs(grenade.pos.x - collider.max.x));
      const dyMin = Math.min(Math.abs(grenade.pos.y - collider.min.y), Math.abs(grenade.pos.y - collider.max.y));
      const dzMin = Math.min(Math.abs(grenade.pos.z - collider.min.z), Math.abs(grenade.pos.z - collider.max.z));
      if (dyMin <= dxMin && dyMin <= dzMin) grenade.vel.y = Math.abs(grenade.vel.y) * 0.45;
      else if (dxMin <= dzMin) grenade.vel.x *= -0.45;
      else grenade.vel.z *= -0.45;
      grenade.pos.addScaledVector(grenade.vel, dt);
      break;
    }
  }
  if (grenade.pos.y < 0.09) {
    grenade.pos.y = 0.09;
    grenade.vel.y = Math.abs(grenade.vel.y) * 0.45;
    grenade.vel.x *= 0.7;
    grenade.vel.z *= 0.7;
  }
  grenade.mesh.mesh.position.copy(grenade.pos);
  grenade.mesh.light.position.copy(grenade.pos);
  grenade.mesh.light.intensity = 2;
  if (grenade.fuse <= 0) detonateGrenade();
}

function showRoundEnd() {
  if (document.pointerLockElement) document.exitPointerLock();
  hud.hideBuy();
  if (gstate.phase === 'matchEnd') {
    hud.showOverlay('matchEnd', { won: gstate.wins > gstate.losses, reason: gstate.matchReason, wins: gstate.wins, losses: gstate.losses, kills: gstate.kills });
  } else {
    hud.showOverlay('roundEnd', { won: gstate.roundWon, reason: gstate.roundEndReason, wins: gstate.wins, losses: gstate.losses, reward: gstate.roundWon ? 2000 : 1400, matchOver: false });
  }
}

function step(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt * 2.2);

  if (gstate.phase === 'live') {
    player.step(dt, input.state.keys);
    weapons.step(dt);
    bots.step(dt, elapsed, { state: body, alive: gstate.health > 0, hitbox }, gstate.spike);
    stepGrenade(dt);
    game.step(dt, performance.now());

    // Footsteps.
    const speed = player.groundSpeed();
    if (speed > 1 && body.onGround) {
      stepAccumulator += speed * dt;
      if (stepAccumulator > 2.4) {
        stepAccumulator = 0;
        audio.step();
      }
    }

    // Firing: automatic weapons hold to fire; the pistol fires on the press edge.
    const triggerEdge = input.state.firing && !prevFiring;
    prevFiring = input.state.firing;
    const firing = input.state.firing && (weapons.current.auto || triggerEdge);
    if (firing && weapons.ready()) shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
    if (input.wasPressed('KeyR')) {
      weapons.reload();
      audio.reload();
    }
    if (input.wasPressed('Digit1') && gstate.owned.pistol) weapons.switchTo('pistol');
    if (input.wasPressed('Digit2') && gstate.owned.smg) weapons.switchTo('smg');
    if (input.wasPressed('Digit3') && gstate.owned.rifle) weapons.switchTo('rifle');
    if (input.wasPressed('KeyG')) throwGrenade();

    // Spike planting: hold E inside a site.
    plantingSite = siteAt(body.position.x, body.position.z);
    if (input.state.keys.has('KeyE') && plantingSite && !gstate.spike.planted) {
      gstate.planting = true;
      gstate.plantProgress += dt;
      if (gstate.plantProgress >= PLANT_SECONDS) {
        game.plantSpike(plantingSite, body.position.x, body.position.z);
      }
    } else {
      gstate.planting = false;
      gstate.plantProgress = Math.max(0, gstate.plantProgress - dt * 2);
    }

    // A defusing bot ends the round for the defenders.
    const defuser = bots.defusingBot;
    if (defuser && defuser.defuseProgress >= 4) {
      effects.hideSpike();
      game.endRound(false, `${defuser.name} defused the spike.`);
      showRoundEnd();
    }

    // Round end triggered inside game.step (timer / spike detonation).
    if (gstate.phase === 'roundEnd' || gstate.phase === 'matchEnd') showRoundEnd();
  } else if (gstate.phase === 'buy') {
    weapons.step(dt);
    if (input.wasPressed('KeyB')) deploy();
    const buyKeys = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'grenade', Digit4: 'armor', Digit5: 'ammo' };
    for (const [code, id] of Object.entries(buyKeys)) {
      if (input.wasPressed(code)) {
        const result = game.buy(id);
        if (result.ok) {
          audio.buy();
          hud.refreshBuy(gstate.money, gstate.owned, gstate.armor, gstate.currentWeapon);
        } else audio.denied();
      }
    }
  }

  effects.step(dt);
  effects.spikeBlink(elapsed);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (gstate.phase === 'live' && input.state.locked) player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    pushHud();
  }
  renderer.render(scene, camera);
}

function pushHud() {
  hud.setHealth(gstate.health, gstate.armor);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve);
  hud.setMoney(gstate.money);
  hud.setGrenades(gstate.grenades);
  hud.setWeapon(weapons.current.name.toUpperCase());
  hud.setTimer(gstate.spike.planted ? gstate.spike.timer : gstate.roundTimeLeft);
  hud.setScore(gstate.round, gstate.wins, gstate.losses);
  hud.setCrosshairGap(weapons.spread(player.groundSpeed()));
  if (gstate.killfeed.length !== lastFeedLength) {
    hud.setKillfeed(gstate.killfeed);
    lastFeedLength = gstate.killfeed.length;
  }
  const message = performance.now() < gstate.messageUntil ? gstate.message : '';
  hud.showMessage(message);
  if (gstate.phase === 'live') {
    if (gstate.spike.planted) {
      const defuser = bots.defusingBot;
      if (defuser) hud.setSpikeBar(`DEFUSE IN PROGRESS — ${defuser.name}`, defuser.defuseProgress / 4);
      else hud.setSpikeBar('SPIKE ARMED — DETONATION', gstate.spike.timer / 35);
      hud.setPlantHint('');
    } else if (gstate.planting) {
      hud.setSpikeBar('PLANTING SPIKE — HOLD E', gstate.plantProgress / PLANT_SECONDS);
      hud.setPlantHint('');
    } else if (plantingSite) {
      hud.setSpikeBar(null, 0);
      hud.setPlantHint(`Hold E to plant the spike at Site ${plantingSite}`);
    } else {
      hud.setSpikeBar(null, 0);
      hud.setPlantHint('');
    }
  } else {
    hud.setSpikeBar(null, 0);
    hud.setPlantHint('');
  }
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    player.teleport(PLAYER_SPAWN.pos[0], PLAYER_SPAWN.pos[1], 0.35);
    bots.reset(BOT_SPAWNS);
    settle(30);
    aimAt(new THREE.Vector3(0, 1.2, -8));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    game.startMatch();
    hud.hideOverlay();
    player.teleport(PLAYER_SPAWN.pos[0], PLAYER_SPAWN.pos[1], 0);
    bots.reset(BOT_SPAWNS);
    settle(10);
    aimAt(new THREE.Vector3(0, 1.2, -8));
    gstate.money = 4500;
    hud.showBuy(gstate.money, gstate.owned, gstate.armor, gstate.currentWeapon);
  } else if (name === 'play') {
    game.startMatch();
    gstate.money = 5000;
    game.buy('rifle');
    game.beginLive();
    hud.hideOverlay();
    hud.hideBuy();
    player.teleport(0, 12, 0);
    // Stage two defenders in the open mid lane for the shot.
    const b0 = bots.bots[0];
    const b1 = bots.bots[1];
    b0.body.teleport(1.5, 0, -0.5);
    b0.body.state.yaw = Math.PI;
    b1.body.teleport(-5, 0, -6);
    b1.body.state.yaw = Math.PI * 0.75;
    settle(20);
    // Re-aim before every shot: the defenders strafe while engaging, so a
    // stale aim point would miss. Three rifle body hits drop one.
    for (let round = 0; round < 3; round += 1) {
      aimAt(bots.aimPoint(0));
      shoot(0);
      settle(6);
    }
    settle(10);
    aimAt(bots.aimPoint(1));
    shoot(0);
    settle(8); // let the muzzle flash clear before the capture freezes
  } else if (name === 'end') {
    game.startMatch();
    game.beginLive();
    gstate.round = 3;
    gstate.wins = 2;
    gstate.losses = 1;
    gstate.kills = 4;
    gstate.money = 3200;
    game.endRound(true, 'All defenders eliminated.');
    player.teleport(0, 12, 0);
    bots.reset(BOT_SPAWNS);
    settle(10);
    aimAt(new THREE.Vector3(0, 1.2, -8));
    showRoundEnd();
  }
  pushHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    pushHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Clicking the canvas while a round is live re-takes pointer lock (for example
// after the lock was dropped by the browser).
renderer.domElement.addEventListener('click', () => {
  if (!shot && gstate.phase === 'live' && !input.state.locked) input.requestLock();
});

hud.setAmmo(weapons.state.mag, weapons.state.reserve);
hud.setScore(0, 0, 0);
hud.setHealth(100, false);
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
