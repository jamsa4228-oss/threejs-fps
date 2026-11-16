// DUSTLINE YARD — an original freight yard at dusk. Two bombsites (Silo west,
// Depot east), three lanes: A-long west, mid centre, B-short east. Every box is a
// collider for players and bots and a surface a bullet stops on. Plain geometry only.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoints the bots walk. Edges are straight, crate-free lines, so a bot walking
// one never has to path around cover.
export const WAYPOINTS = {
  spawnS: { pos: [0, 15], links: ['midS'] },
  midS: { pos: [0, 8], links: ['spawnS', 'mid', 'aLong1', 'bShort1'] },
  mid: { pos: [0, 0], links: ['midS', 'midN', 'aMid', 'bMid'] },
  midN: { pos: [0, -8], links: ['mid', 'aMid', 'bMid', 'plat'] },
  plat: { pos: [0, -12.4], links: ['midN'] },
  aLong1: { pos: [-12, 8], links: ['midS', 'aLong2'] },
  aLong2: { pos: [-16, 0], links: ['aLong1', 'aLong3', 'aMid'] },
  aLong3: { pos: [-16, -6], links: ['aLong2', 'aSite'] },
  aSite: { pos: [-12, -13], links: ['aLong3', 'aMid'] },
  aMid: { pos: [-8, -8], links: ['mid', 'midN', 'aLong2', 'aSite'] },
  bShort1: { pos: [12, 8], links: ['midS', 'bShort2'] },
  bShort2: { pos: [16, 0], links: ['bShort1', 'bShort3', 'bMid'] },
  bShort3: { pos: [16, -6], links: ['bShort2', 'bSite'] },
  bSite: { pos: [12, -13], links: ['bShort3', 'bMid'] },
  bMid: { pos: [8, -8], links: ['mid', 'midN', 'bShort2', 'bSite'] },
};

export const SITES = {
  A: { name: 'Silo', center: [-15.5, -13], half: [4.5, 4] },
  B: { name: 'Depot', center: [15.5, -13], half: [4.5, 4] },
};

export const PLAYER_SPAWN = { pos: [0, 15], yaw: 0 };
export const BOT_SPAWNS = [
  { node: 'aSite', yaw: Math.PI * 0.5 },
  { node: 'bSite', yaw: -Math.PI * 0.5 },
  { node: 'plat', yaw: 0 },
  { node: 'midN', yaw: 0 },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const rust = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a4a28'), roughness: 0.85, metalness: 0.15 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5f6b78'), roughness: 0.5, metalness: 0.55 });
  const sand = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a7a5c'), roughness: 0.95, metalness: 0.0 });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // The yard: 44 x 36 m, 5 m walls, open dusk sky.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, sand);
  box(0.4, 5, 36.4, -22.2, 2.5, 0, materials.surface);
  box(0.4, 5, 36.4, 22.2, 2.5, 0, materials.surface);
  box(44.4, 5, 0.4, 0, 2.5, -18.2, materials.surface);
  box(44.4, 5, 0.4, 0, 2.5, 18.2, materials.surface);

  // Site containers: the big rust boxes each site is built around.
  box(5, 2.6, 2.4, -16, 1.3, -13, rust);
  box(5, 2.6, 2.4, 16, 1.3, -13, rust);
  box(2.4, 2.6, 2.4, -19.5, 1.3, -16, steel);
  box(2.4, 2.6, 2.4, 19.5, 1.3, -16, steel);

  // Mid pillar and lane dividers.
  box(1.2, 3.4, 1.2, 3.5, 1.7, -2, materials.hairline);
  box(1.2, 1.1, 3.6, -10, 0.55, -4, materials.hairline);
  box(1.2, 1.1, 3.6, 10, 0.55, -4, materials.hairline);

  // Crates: crouch cover scattered through the lanes.
  box(1.6, 1.1, 1.6, -4, 0.55, 2, materials.hairline);
  box(1.6, 1.1, 1.6, 4, 0.55, 2, materials.hairline);
  box(2.4, 0.9, 1.2, -6, 0.45, 11, materials.hairline);
  box(2.4, 0.9, 1.2, 6, 0.45, 11, materials.hairline);
  box(1.6, 0.7, 1.6, -19, 0.35, -9, materials.hairline);
  box(1.6, 0.7, 1.6, 19, 0.35, -9, materials.hairline);
  box(1.6, 0.7, 1.6, -8, 0.35, -12, materials.hairline);
  box(1.6, 0.7, 1.6, 8, 0.35, -12, materials.hairline);
  box(0.9, 1.6, 0.9, -19, 0.8, 12, materials.hairline);
  box(0.9, 1.6, 0.9, 19, 0.8, 12, materials.hairline);

  // The north platform: 0.9 m high, jumpable, overlooks both sites.
  box(8, 0.9, 2.5, 0, 0.45, -15.5, steel);

  // Site decals: flat amber strips marking where the spike goes.
  const decalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  for (const site of Object.values(SITES)) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(site.half[0] * 2, site.half[1] * 2), decalMat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.center[0], 0.02, site.center[1]);
    group.add(decal);
  }

  // Light poles: thin steel masts with a warm lamp head.
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  for (const [x, z] of [[-14, 6], [14, 6], [-14, -10], [14, -10], [0, 12]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 8), steel);
    pole.position.set(x, 2.2, z);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat);
    lamp.position.set(x, 4.5, z);
    group.add(lamp);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 14, 1.6);
    light.position.set(x, 4.3, z);
    scene.add(light);
  }

  // Light: a low dusk sun from the west, a cool fill from the east, sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a3f4a'), new THREE.Color(PALETTE.canvas), 1.35);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.4);
  key.position.set(-16, 12, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.8);
  fill.position.set(14, 10, 12);
  scene.add(fill);

  const sites = {};
  for (const [keyName, site] of Object.entries(SITES)) {
    sites[keyName] = {
      ...site,
      box: new THREE.Box3(
        new THREE.Vector3(site.center[0] - site.half[0], 0, site.center[1] - site.half[1]),
        new THREE.Vector3(site.center[0] + site.half[0], 3, site.center[1] + site.half[1]),
      ),
    };
  }

  return { colliders, shootables, group, sites, waypoints: WAYPOINTS };
}
