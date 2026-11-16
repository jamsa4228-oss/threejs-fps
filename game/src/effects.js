// Transient visuals: tracers, impact sparks and the spike explosion.
// Fixed pools, no allocation in the hot loop: each slot is reused in turn.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 12;

export function createEffects(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false });
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a'), transparent: true, opacity: 0.9, depthWrite: false });
  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  let sparkIndex = 0;

  const explosionLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 22);
  scene.add(explosionLight);
  const explosionMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  explosionMesh.visible = false;
  scene.add(explosionMesh);
  let explosionLife = 0;

  // A spike device mesh, shown where the spike is planted.
  const spikeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.35, metalness: 0.5, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.8 });
  const spikeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24), spikeMat);
  spikeMesh.visible = false;
  scene.add(spikeMesh);
  const spikeLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  scene.add(spikeLight);

  const _mid = new THREE.Vector3();
  const _dir = new THREE.Vector3();

  return {
    tracer(from, to) {
      const slot = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % TRACER_COUNT;
      _mid.addVectors(from, to).multiplyScalar(0.5);
      _dir.subVectors(to, from);
      const length = _dir.length();
      slot.mesh.position.copy(_mid);
      slot.mesh.lookAt(to);
      slot.mesh.scale.set(1, 1, Math.max(0.1, length));
      slot.mesh.visible = true;
      slot.life = 0.09;
    },
    sparksAt(point, count = 6) {
      for (let i = 0; i < count; i += 1) {
        const slot = sparks[sparkIndex];
        sparkIndex = (sparkIndex + 1) % SPARK_COUNT;
        slot.mesh.position.copy(point);
        slot.vel.set((Math.random() * 2 - 1) * 2.5, Math.random() * 3 + 1, (Math.random() * 2 - 1) * 2.5);
        slot.mesh.visible = true;
        slot.life = 0.35;
      }
    },
    explode(point) {
      explosionMesh.position.copy(point);
      explosionMesh.visible = true;
      explosionLife = 0.5;
      explosionLight.position.copy(point);
      explosionLight.position.y += 1;
      explosionLight.intensity = 60;
    },
    showSpike(x, z) {
      spikeMesh.position.set(x, 0.12, z);
      spikeMesh.visible = true;
      spikeLight.position.set(x, 1, z);
      spikeLight.intensity = 4;
    },
    hideSpike() {
      spikeMesh.visible = false;
      spikeLight.intensity = 0;
    },
    spikeBlink(time) {
      if (!spikeMesh.visible) return;
      spikeLight.intensity = 3 + Math.sin(time * 9) * 2;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
      for (const slot of sparks) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.vel.y -= 9 * dt;
        slot.mesh.position.addScaledVector(slot.vel, dt);
        if (slot.life <= 0) slot.mesh.visible = false;
      }
      if (explosionLife > 0) {
        explosionLife -= dt;
        const t = Math.max(0, explosionLife / 0.5);
        explosionMesh.scale.setScalar((1 - t) * 5 + 0.5);
        explosionMesh.material.opacity = t * 0.55;
        explosionLight.intensity = t * 60;
        if (explosionLife <= 0) {
          explosionMesh.visible = false;
          explosionLight.intensity = 0;
        }
      }
    },
  };
}
