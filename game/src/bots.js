// The defenders: four bots that hold the sites, patrol routes, investigate
// gunfire, engage on sight and defuse the spike. One fixed-step brain per bot,
// driven by a small state machine; no allocations in the hot loop.
import * as THREE from 'three';
import { createBody } from './player.js';
import { BOT_COLORS } from './palette.js';

const BOT_NAMES = ['Ash', 'Bram', 'Cy', 'Dune'];
const BOT_HEALTH = 100;
const BOT_SPEED = 3.6;
const BOT_DAMAGE = 11;
const BOT_FIRE_GAP = 0.16;
const BOT_BURST = 4;
const BOT_BURST_PAUSE = 0.9;
const BOT_VIEW_DISTANCE = 42;
const BOT_FOV = 1.9; // radians of half-angle the bot can see
const BOT_HEAR_DISTANCE = 30;
const DEFUSE_SECONDS = 4;
const DEFUSE_RANGE = 2.6;

// Patrol loops per home site, as waypoint names in world.js.
const PATROLS = {
  A: ['aSite', 'aLong3', 'aLong2', 'aMid', 'aSite'],
  B: ['bSite', 'bShort3', 'bShort2', 'bMid', 'bSite'],
  MID: ['midN', 'plat', 'mid', 'midN'],
};

const _toTarget = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();

export function createBots(scene, world, onBotShot) {
  const torsoMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(BOT_COLORS.torso), roughness: 0.6, metalness: 0.1 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(BOT_COLORS.head), roughness: 0.45, metalness: 0.1 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(BOT_COLORS.visor), roughness: 0.3, metalness: 0.4, emissive: new THREE.Color(BOT_COLORS.visor), emissiveIntensity: 0.4 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e343c'), roughness: 0.8 });
  const gunMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1f24'), roughness: 0.5, metalness: 0.4 });

  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeometry = new THREE.BoxGeometry(0.18, 0.5, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const visorGeometry = new THREE.BoxGeometry(0.2, 0.05, 0.02);

  const raycaster = new THREE.Raycaster();
  const bots = [];
  const hitMeshes = [];
  let time = 0;
  let seedState = 1234567;

  function rand() {
    seedState = (seedState * 1664525 + 1013904223) >>> 0;
    return seedState / 4294967296;
  }

  function buildBot(index, spawn, home) {
    const spawnPos = world.waypoints[spawn.node].pos;
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.53;
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.set(0, 1.55, -0.14);
    const legL = new THREE.Mesh(legGeometry, legMaterial);
    legL.position.set(-0.14, 0.25, 0);
    const legR = new THREE.Mesh(legGeometry, legMaterial);
    legR.position.set(0.14, 0.25, 0);
    const gun = new THREE.Mesh(gunGeometry, gunMaterial);
    gun.position.set(0.2, 1.15, -0.35);
    group.add(torso, head, visor, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const body = createBody(world.colliders, spawnPos[0], spawnPos[1]);
    body.state.yaw = spawn.yaw;

    const bot = {
      name: BOT_NAMES[index],
      index,
      group, torso, head, legL, legR, gun,
      body,
      home,
      patrol: PATROLS[home],
      patrolIndex: index % PATROLS[home].length,
      health: BOT_HEALTH,
      alive: true,
      state: 'hold',
      targetNode: null,
      investigateAt: null,
      investigateUntil: 0,
      holdUntil: time + 1 + rand() * 2,
      lastSeen: null, // {x, y, z, at}
      reactionUntil: 0,
      aimError: 0.06,
      burstLeft: 0,
      fireCooldown: 0,
      burstPauseUntil: 0,
      losCooldown: rand() * 0.15,
      canSee: false,
      defuseProgress: 0,
      fall: 0,
      walkPhase: rand() * 6,
      strafeDir: 1,
      strafeUntil: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    return bot;
  }

  function spawnAll(spawns) {
    const homes = ['A', 'B', 'MID', 'A'];
    for (let i = 0; i < 4; i += 1) {
      bots.push(buildBot(i, spawns[i], homes[i]));
    }
  }

  function reset(spawns) {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      const spawn = spawns[i];
      const spawnPos = world.waypoints[spawn.node].pos;
      bot.body.teleport(spawnPos[0], spawnPos[1], spawn.yaw);
      bot.health = BOT_HEALTH;
      bot.alive = true;
      bot.state = 'hold';
      bot.targetNode = null;
      bot.investigateAt = null;
      bot.holdUntil = time + 1 + rand() * 2;
      bot.lastSeen = null;
      bot.defuseProgress = 0;
      bot.fall = 0;
      bot.group.rotation.set(0, spawn.yaw, 0);
      bot.group.position.set(spawnPos[0], 0, spawnPos[1]);
      bot.group.visible = true;
    }
  }

  // True line of sight from the bot's eye to a point: nothing solid in between.
  function hasLineOfSight(bot, point) {
    _eye.set(bot.body.state.position.x, bot.body.state.position.y + 1.5, bot.body.state.position.z);
    _dir.subVectors(point, _eye);
    const distance = _dir.length();
    if (distance > BOT_VIEW_DISTANCE) return false;
    _dir.normalize();
    raycaster.set(_eye, _dir);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function inFov(bot, point) {
    _toTarget.set(point.x - bot.body.state.position.x, 0, point.z - bot.body.state.position.z);
    const distance = _toTarget.length();
    if (distance < 1.2) return true;
    _toTarget.normalize();
    const forwardX = -Math.sin(bot.body.state.yaw);
    const forwardZ = -Math.cos(bot.body.state.yaw);
    return _toTarget.x * forwardX + _toTarget.z * forwardZ > Math.cos(BOT_FOV);
  }

  function nearestNode(x, z) {
    let best = null;
    let bestDistance = Infinity;
    for (const [name, node] of Object.entries(world.waypoints)) {
      const dx = node.pos[0] - x;
      const dz = node.pos[1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestDistance) {
        bestDistance = d;
        best = name;
      }
    }
    return best;
  }

  // Breadth-first route over the waypoint graph, returned as a list of node names.
  function route(from, to) {
    if (from === to) return [to];
    const previous = { [from]: null };
    const queue = [from];
    while (queue.length) {
      const current = queue.shift();
      for (const link of world.waypoints[current].links) {
        if (link in previous) continue;
        previous[link] = current;
        if (link === to) {
          const path = [to];
          let node = current;
          while (node) {
            path.unshift(node);
            node = previous[node];
          }
          return path;
        }
        queue.push(link);
      }
    }
    return [to];
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.defuseProgress = 0;
    if (bot.health > 0) {
      // Being shot at snaps the bot's attention to the shooter.
      if (bot.state !== 'engage') {
        bot.state = 'investigate';
        bot.investigateUntil = time + 5;
      }
      return false;
    }
    bot.alive = false;
    bot.state = 'dead';
    bot.fall = 0;
    return true;
  }

  function hearShot(x, z) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const dx = bot.body.state.position.x - x;
      const dz = bot.body.state.position.z - z;
      if (dx * dx + dz * dz > BOT_HEAR_DISTANCE * BOT_HEAR_DISTANCE) continue;
      if (bot.state === 'engage' || bot.state === 'defuse') continue;
      bot.state = 'investigate';
      bot.investigateAt = { x, z };
      bot.investigateUntil = time + 5;
      bot.targetNode = null;
    }
  }

  // Steer the body toward a world point; returns true when close enough.
  function steerToward(bot, dt, x, z, speedScale = 1) {
    const body = bot.body.state;
    const dx = x - body.position.x;
    const dz = z - body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.4) return true;
    const targetYaw = Math.atan2(-dx, -dz);
    let yawDiff = targetYaw - body.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    body.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, yawDiff));
    const wishX = -Math.sin(body.yaw) * speedScale;
    const wishZ = -Math.cos(body.yaw) * speedScale;
    bot.body.move(dt, wishX, wishZ, false, false);
    return false;
  }

  function followRoute(bot, dt) {
    if (!bot.targetNode) return true;
    const node = world.waypoints[bot.targetNode];
    if (steerToward(bot, dt, node.pos[0], node.pos[1])) {
      bot.targetNode = null;
      return true;
    }
    return false;
  }

  function stepBot(bot, dt, player, spike) {
    const body = bot.body.state;
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
    bot.losCooldown -= dt;

    const playerPos = player.state.position;
    const playerChest = { x: playerPos.x, y: playerPos.y + player.state.eye - 0.25, z: playerPos.z };

    // Vision refresh, staggered per bot.
    if (bot.losCooldown <= 0) {
      bot.losCooldown = 0.15 + rand() * 0.05;
      const seen = player.alive && inFov(bot, playerChest) && hasLineOfSight(bot, playerChest);
      bot.canSee = seen;
      if (seen) {
        if (!bot.lastSeen) bot.reactionUntil = time + 0.45 + rand() * 0.25;
        bot.lastSeen = { x: playerChest.x, y: playerChest.y, z: playerChest.z, at: time };
      } else if (bot.lastSeen && time - bot.lastSeen.at > 2.5) {
        bot.lastSeen = null;
      }
    }

    // State transitions.
    if (bot.canSee && bot.lastSeen) {
      if (bot.state !== 'engage') bot.state = 'engage';
    } else if (bot.state === 'engage') {
      bot.state = 'investigate';
      bot.investigateAt = bot.lastSeen ? { x: bot.lastSeen.x, z: bot.lastSeen.z } : null;
      bot.investigateUntil = time + 4;
      bot.targetNode = null;
    }
    if (spike.planted && bot.state !== 'engage') {
      // The closest living bot goes for the defuse; the rest hunt.
      const closest = bots.filter((b) => b.alive).sort((a, b2) => {
        const da = Math.hypot(a.body.state.position.x - spike.x, a.body.state.position.z - spike.z);
        const db = Math.hypot(b2.body.state.position.x - spike.x, b2.body.state.position.z - spike.z);
        return da - db;
      })[0];
      if (closest === bot) {
        bot.state = 'defuse';
        bot.targetNode = null;
      } else if (bot.state === 'defuse') {
        bot.state = 'investigate';
        bot.investigateAt = { x: spike.x, z: spike.z };
        bot.investigateUntil = time + 6;
      }
    }
    if (bot.state === 'investigate' && time > bot.investigateUntil) {
      bot.state = 'hold';
      bot.holdUntil = time + 2 + rand() * 3;
      bot.targetNode = null;
    }
    if (bot.state === 'hold' && time > bot.holdUntil) {
      bot.state = 'patrol';
      bot.patrolIndex = (bot.patrolIndex + 1) % bot.patrol.length;
      bot.targetNode = bot.patrol[bot.patrolIndex];
    }

    // Behaviour per state.
    if (bot.state === 'engage' && bot.lastSeen) {
      // Face the player, strafe to be a harder target, burst fire after reacting.
      const dx = bot.lastSeen.x - body.position.x;
      const dz = bot.lastSeen.z - body.position.z;
      const targetYaw = Math.atan2(-dx, -dz);
      let yawDiff = targetYaw - body.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      body.yaw += Math.max(-4 * dt, Math.min(4 * dt, yawDiff));
      if (time > bot.strafeUntil) {
        bot.strafeDir = rand() > 0.5 ? 1 : -1;
        bot.strafeUntil = time + 0.7 + rand() * 0.9;
      }
      const strafeX = Math.cos(body.yaw) * bot.strafeDir;
      const strafeZ = -Math.sin(body.yaw) * bot.strafeDir;
      bot.body.move(dt, strafeX * 0.45, strafeZ * 0.45, false, false);
      bot.aimError = Math.max(0.012, bot.aimError - dt * 0.02);

      if (time >= bot.reactionUntil && bot.fireCooldown === 0 && time >= bot.burstPauseUntil) {
        if (bot.burstLeft === 0) bot.burstLeft = BOT_BURST;
        bot.burstLeft -= 1;
        bot.fireCooldown = BOT_FIRE_GAP;
        if (bot.burstLeft === 0) bot.burstPauseUntil = time + BOT_BURST_PAUSE;
        fireAtPlayer(bot, player);
      }
    } else if (bot.state === 'defuse') {
      const distance = Math.hypot(spike.x - body.position.x, spike.z - body.position.z);
      if (distance > DEFUSE_RANGE) {
        // Walk the route to the spike's nearest node, then straight at the spike.
        const nodeName = nearestNode(spike.x, spike.z);
        const node = world.waypoints[nodeName];
        const nodeDistance = Math.hypot(node.pos[0] - body.position.x, node.pos[1] - body.position.z);
        if (nodeDistance < 1.5) {
          steerToward(bot, dt, spike.x, spike.z);
        } else {
          if (!bot.targetNode) bot.targetNode = nodeName;
          followRoute(bot, dt);
        }
      } else {
        bot.defuseProgress += dt;
        // Face the spike while channeling.
        const dx = spike.x - body.position.x;
        const dz = spike.z - body.position.z;
        body.yaw = Math.atan2(-dx, -dz);
      }
    } else if (bot.state === 'investigate') {
      if (bot.investigateAt) {
        const node = nearestNode(bot.investigateAt.x, bot.investigateAt.z);
        if (!bot.targetNode) bot.targetNode = node;
        if (followRoute(bot, dt)) {
          steerToward(bot, dt, bot.investigateAt.x, bot.investigateAt.z);
        }
        // Scan around while investigating.
        body.yaw += Math.sin(time * 0.8 + bot.index) * dt * 0.9;
      } else {
        body.yaw += dt * 0.7;
      }
    } else if (bot.state === 'patrol') {
      if (followRoute(bot, dt)) {
        bot.state = 'hold';
        bot.holdUntil = time + 1.5 + rand() * 2.5;
      }
    } else {
      // hold: scan the lane slowly.
      body.yaw += Math.sin(time * 0.5 + bot.index * 1.3) * dt * 0.8;
    }

    // Walk cycle and mesh sync.
    const speed = bot.body.groundSpeed();
    bot.walkPhase += dt * (2 + speed * 2.2);
    const swing = Math.min(0.5, speed * 0.12) * Math.sin(bot.walkPhase);
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
    bot.group.position.set(body.position.x, body.position.y, body.position.z);
    bot.group.rotation.y = body.yaw;
  }

  function fireAtPlayer(bot, player) {
    const body = bot.body.state;
    _rayOrigin.set(body.position.x + Math.sin(body.yaw) * -0.2, body.position.y + 1.35, body.position.z + Math.cos(body.yaw) * -0.2);
    const target = bot.lastSeen || { x: player.state.position.x, y: player.state.position.y + 1.2, z: player.state.position.z };
    _dir.set(
      target.x - _rayOrigin.x + (rand() * 2 - 1) * bot.aimError,
      target.y - _rayOrigin.y + (rand() * 2 - 1) * bot.aimError,
      target.z - _rayOrigin.z + (rand() * 2 - 1) * bot.aimError,
    ).normalize();
    raycaster.set(_rayOrigin, _dir);
    raycaster.far = 80;
    const targets = [player.hitbox].concat(world.shootables);
    const hit = raycaster.intersectObjects(targets, false)[0];
    const end = hit ? hit.point : _rayOrigin.clone().add(_dir.clone().multiplyScalar(40));
    const hitPlayer = hit && hit.object === player.hitbox;
    onBotShot(bot, _rayOrigin, end, hitPlayer ? BOT_DAMAGE : 0);
  }

  function step(dt, elapsed, player, spike) {
    time = elapsed;
    for (const bot of bots) stepBot(bot, dt, player, spike);
  }

  function aliveCount() {
    return bots.filter((b) => b.alive).length;
  }

  function aimPoint(index) {
    const bot = bots[index % bots.length];
    return new THREE.Vector3(bot.body.state.position.x, bot.body.state.position.y + 1.0, bot.body.state.position.z);
  }

  return {
    bots,
    hitMeshes,
    spawnAll,
    reset,
    step,
    damage,
    hearShot,
    aliveCount,
    aimPoint,
    get defusingBot() {
      return bots.find((b) => b.alive && b.state === 'defuse' && b.defuseProgress > 0) ?? null;
    },
  };
}
