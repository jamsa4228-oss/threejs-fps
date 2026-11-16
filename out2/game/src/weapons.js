// Weapons: three guns and one grenade, each with its own numbers, view model and
// sound. A weapon owns its magazine, cooldown, reload and kick; main.js owns the
// ray and the damage. Spread grows with movement and with sustained fire, so
// stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, slot: '1',
    magSize: 12, reserve: 48, fireGap: 0.16, reloadTime: 1.4,
    damageBody: 26, damageHead: 78, spreadStill: 0.003, spreadMove: 0.02,
    recoilPitch: 0.011, recoilYaw: 0.005, auto: false, kind: 'pistol',
    range: 60,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', price: 1500, slot: '2',
    magSize: 28, reserve: 112, fireGap: 0.075, reloadTime: 1.7,
    damageBody: 22, damageHead: 66, spreadStill: 0.006, spreadMove: 0.03,
    recoilPitch: 0.007, recoilYaw: 0.004, auto: true, kind: 'smg',
    range: 55,
  },
  rifle: {
    id: 'rifle', name: 'Rook Rifle', price: 2500, slot: '3',
    magSize: 30, reserve: 90, fireGap: 0.096, reloadTime: 1.9,
    damageBody: 34, damageHead: 100, spreadStill: 0.0022, spreadMove: 0.028,
    recoilPitch: 0.013, recoilYaw: 0.005, auto: true, kind: 'rifle',
    range: 90,
  },
};

export const GRENADE = { id: 'grenade', name: 'Spark Grenade', price: 300, damage: 110, radius: 6.5, fuse: 1.6 };
export const ARMOR = { id: 'armor', name: 'Plated Vest', price: 650, absorb: 0.5 };
export const AMMO = { id: 'ammo', name: 'Ammo Pack', price: 200 };

const MUZZLE_TIME = 0.06;

function buildViewModel(camera, def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const model = new THREE.Group();
  if (def.id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3), body);
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), grip);
    gripMesh.position.set(0, -0.09, 0.1);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), accent);
    sight.position.set(0, 0.05, -0.12);
    model.add(slide, gripMesh, sight);
  } else if (def.id === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.28), grip);
    barrel.position.set(0, 0.02, -0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.07), accent);
    mag.position.set(0, -0.13, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), grip);
    stock.position.set(0, -0.01, 0.24);
    model.add(receiver, barrel, mag, stock);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), accent);
    sight.position.set(0, 0.07, -0.05);
    model.add(receiver, barrel, stock, sight);
  }
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);
  return { model, flash, flashLight };
}

export function createWeaponSet(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) models[def.id] = buildViewModel(camera, def);

  // Ammo is tracked per weapon, so switching guns never refills one.
  const ammoByWeapon = {};
  for (const def of Object.values(WEAPONS)) ammoByWeapon[def.id] = { mag: def.magSize, reserve: def.reserve };

  let current = WEAPONS.pistol;
  const state = {
    mag: current.magSize, reserve: current.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0,
  };

  function showCurrent() {
    for (const [id, parts] of Object.entries(models)) {
      const visible = id === current.id;
      parts.model.visible = visible;
      parts.flash.visible = false;
    }
    state.flash = 0;
  }
  showCurrent();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const parts = models[current.id];
    parts.model.position.z = -0.42 + state.kick;
    parts.model.rotation.x = state.kick * 2.2;
    parts.flash.visible = state.flash > 0;
    parts.flash.rotation.z = state.flash * 30;
    parts.flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      parts.model.rotation.x = -0.55 * Math.min(1, (current.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = current.magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    get current() {
      return current;
    },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    canFire() {
      return state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current.fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
      state.bloom = Math.min(0.05, state.bloom + (current.id === 'rifle' ? 0.008 : 0.005));
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === current.magSize || state.reserve === 0) return;
      state.reloadLeft = current.reloadTime;
    },
    spread(speed) {
      const moving = Math.min(1, speed / 5.2) * current.spreadMove;
      return current.spreadStill + moving + state.bloom;
    },
    switchTo(id) {
      if (!WEAPONS[id] || id === current.id) return false;
      ammoByWeapon[current.id].mag = state.mag;
      ammoByWeapon[current.id].reserve = state.reserve;
      current = WEAPONS[id];
      state.mag = ammoByWeapon[id].mag;
      state.reserve = ammoByWeapon[id].reserve;
      state.cooldown = 0.25;
      state.reloadLeft = 0;
      state.bloom = 0;
      showCurrent();
      return true;
    },
    refillAmmo() {
      // A new round tops the magazine up; the reserve stays as it was.
      state.mag = current.magSize;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    topUpReserve() {
      state.reserve = current.reserve;
    },
  };
}

// A thrown grenade: a small amber sphere on a ballistic arc. It bounces once off
// the world (a cheap reflect) and detonates on its fuse. No new objects per frame:
// one mesh, one light, reused from a small pool by main.js.
export function createGrenadeMesh(scene) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.6 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  scene.add(light);
  return { mesh, light };
}
