import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { damp } from '../core/damp.js';

// A jointed figure built from primitives, about 1.75 m tall, standing on y = 0
// and facing +z. The same rig is dressed as a humanoid robot or as a person.
//
//   const bot = new Humanoid({ kind: 'robot' });
//   bot.pose = 'walk';          // 'idle' | 'walk' | 'carry' | 'work' | 'sweep'
//   scene.add(bot.root); bot.update(dt);

const ROBOT_PALETTES = {
  white: { shell: 0xe8e9eb, joint: 0x2b2e33, visor: 0x0b0d10, accent: 0x9aa3ad },
  graphite: { shell: 0x50555c, joint: 0x1d1f22, visor: 0x050607, accent: 0xc7ccd1 },
  safety: { shell: 0xe07a2a, joint: 0x26282b, visor: 0x0b0d10, accent: 0xf2f2f2 },
  courier: { shell: 0x2f5d8a, joint: 0x1f2226, visor: 0x07090b, accent: 0xe6e8ea },
};

const PEOPLE = [
  { skin: 0xe0b394, hair: 0x2b1d14, top: 0x7a2e2e, bottom: 0x2d3540, shoes: 0x1b1b1b },
  { skin: 0x8d5a3b, hair: 0x120c08, top: 0xd9c9a8, bottom: 0x3a3a3a, shoes: 0x3b2a1e },
  { skin: 0xc68e6a, hair: 0x5a3a22, top: 0x2f5a46, bottom: 0x1f2a3a, shoes: 0x202020 },
  { skin: 0xf0cfb4, hair: 0xb08850, top: 0x3d5f8f, bottom: 0x6b5a48, shoes: 0x151515 },
  { skin: 0x5e3b27, hair: 0x0d0907, top: 0xb8b8b8, bottom: 0x24262b, shoes: 0x2a2a2a },
];

const mat = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

export class Humanoid {
  /**
   * kind: 'robot' | 'person'
   * palette: robot palette name ('white' | 'graphite' | 'safety' | 'courier') or person index
   * scale: overall size multiplier
   */
  constructor({ kind = 'robot', palette, scale = 1, castShadow = false } = {}) {
    this.kind = kind;
    this.pose = 'idle';
    this.phase = Math.random() * Math.PI * 2;
    this.stepRate = kind === 'robot' ? 1.7 : 1.9; // strides per second
    this.lookTarget = null; // world Vector3 the head turns toward, if set
    this.headYaw = 0;
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);

    const m = kind === 'robot' ? this.#robotMaterials(palette) : this.#personMaterials(palette);
    this.#build(m);
    if (castShadow) this.root.traverse((o) => o.isMesh && (o.castShadow = true));
  }

  /** Adds an object (e.g. a parcel) held in front of the chest. Use with pose 'carry'. */
  hold(object) {
    object.position.set(0, -0.05, 0.3);
    this.chest.add(object);
    this.held = object;
  }

  update(dt) {
    const j = this.joints;
    const walking = this.pose === 'walk' || this.pose === 'carry' || this.pose === 'sweep';
    if (walking) this.phase += dt * this.stepRate * Math.PI * 2;
    else this.phase += dt * 1.2;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    // Legs.
    if (walking) {
      j.lHip.rotation.x = -0.42 * s;
      j.rHip.rotation.x = 0.42 * s;
      j.lKnee.rotation.x = 0.1 + 0.7 * Math.max(0, c);
      j.rKnee.rotation.x = 0.1 + 0.7 * Math.max(0, -c);
      j.hips.position.y = this.hipHeight + 0.02 * Math.cos(this.phase * 2);
    } else {
      j.lHip.rotation.x = j.rHip.rotation.x = 0;
      j.lKnee.rotation.x = j.rKnee.rotation.x = 0.04;
      j.hips.position.y = this.hipHeight - 0.005 + 0.004 * Math.sin(this.phase);
    }

    // Arms.
    switch (this.pose) {
      case 'walk':
        j.lShoulder.rotation.set(0.35 * s, 0, 0.06);
        j.rShoulder.rotation.set(-0.35 * s, 0, -0.06);
        j.lElbow.rotation.x = j.rElbow.rotation.x = -0.3;
        break;
      case 'carry':
        j.lShoulder.rotation.set(-0.9, 0, 0.12);
        j.rShoulder.rotation.set(-0.9, 0, -0.12);
        j.lElbow.rotation.x = j.rElbow.rotation.x = -0.75;
        break;
      case 'sweep':
        j.lShoulder.rotation.set(-0.7 + 0.25 * s, 0, 0.1);
        j.rShoulder.rotation.set(-0.5 + 0.25 * s, 0, -0.1);
        j.lElbow.rotation.x = j.rElbow.rotation.x = -0.5;
        break;
      case 'work': {
        const hammer = Math.sin(this.phase * 3.5);
        j.rShoulder.rotation.set(-1.5 + 0.45 * hammer, 0, -0.1);
        j.rElbow.rotation.x = -0.9 - 0.3 * hammer;
        j.lShoulder.rotation.set(-0.8, 0, 0.15);
        j.lElbow.rotation.x = -0.9;
        break;
      }
      default:
        j.lShoulder.rotation.set(0.02 * s, 0, 0.08);
        j.rShoulder.rotation.set(-0.02 * s, 0, -0.08);
        j.lElbow.rotation.x = j.rElbow.rotation.x = -0.12;
    }

    // Head turns toward a target, within a natural range.
    let yaw = 0;
    if (this.lookTarget) {
      const local = this.root.worldToLocal(this.lookTarget.clone());
      yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.1, 1.1);
    }
    this.headYaw = damp(this.headYaw, yaw, 4, dt);
    j.neck.rotation.y = this.headYaw;
  }

  // ---------------------------------------------------------------- build

  #robotMaterials(name = 'white') {
    const p = ROBOT_PALETTES[name] ?? ROBOT_PALETTES.white;
    return {
      robot: true,
      torso: mat(p.shell, 0.35, 0.1),
      upper: mat(p.shell, 0.35, 0.1),
      lower: mat(p.shell, 0.35, 0.1),
      limbUpper: mat(p.shell, 0.35, 0.1),
      joint: mat(p.joint, 0.4, 0.6),
      hand: mat(p.joint, 0.4, 0.6),
      head: mat(p.shell, 0.3, 0.1),
      visor: mat(p.visor, 0.08, 0.4),
      accent: mat(p.accent, 0.3, 0.8),
      foot: mat(p.joint, 0.5, 0.4),
    };
  }

  #personMaterials(index) {
    const p = PEOPLE[(index ?? Math.floor(Math.random() * PEOPLE.length)) % PEOPLE.length];
    const skin = mat(p.skin, 0.7);
    return {
      robot: false,
      torso: mat(p.top, 0.85),
      upper: mat(p.top, 0.85),
      limbUpper: mat(p.top, 0.85),
      lower: mat(p.bottom, 0.85),
      joint: mat(p.bottom, 0.85),
      hand: skin,
      head: skin,
      hair: mat(p.hair, 0.9),
      foot: mat(p.shoes, 0.6),
      forearm: skin,
    };
  }

  #build(m) {
    const robot = m.robot;
    const j = (this.joints = {});
    const add = (parent, geometry, material, y = 0, x = 0, z = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const group = (parent, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    this.hipHeight = 0.93;
    j.hips = group(this.root, 0, this.hipHeight, 0);
    add(j.hips, new RoundedBoxGeometry(0.3, 0.14, 0.18, 2, 0.04), robot ? m.joint : m.lower, 0.02);

    // Legs.
    for (const side of ['l', 'r']) {
      const x = side === 'l' ? 0.095 : -0.095;
      const hip = (j[`${side}Hip`] = group(j.hips, x, -0.04, 0));
      add(hip, new THREE.CapsuleGeometry(robot ? 0.06 : 0.065, 0.32, 4, 10), m.lower, -0.22);
      const knee = (j[`${side}Knee`] = group(hip, 0, -0.44, 0));
      if (robot) add(knee, new THREE.SphereGeometry(0.055, 12, 8), m.joint);
      add(knee, new THREE.CapsuleGeometry(robot ? 0.05 : 0.055, 0.32, 4, 10), robot ? m.upper : m.lower, -0.22);
      add(knee, new RoundedBoxGeometry(0.1, 0.06, 0.22, 2, 0.02), m.foot, -0.44, 0, 0.04);
    }

    // Torso.
    const chest = (this.chest = group(j.hips, 0, 0.08, 0));
    if (robot) {
      add(chest, new THREE.CylinderGeometry(0.08, 0.1, 0.12, 12), m.joint, 0.06);
      add(chest, new RoundedBoxGeometry(0.38, 0.36, 0.22, 3, 0.07), m.torso, 0.3);
      add(chest, new RoundedBoxGeometry(0.2, 0.12, 0.02, 2, 0.01), m.accent, 0.34, 0, 0.11);
    } else {
      add(chest, new RoundedBoxGeometry(0.36, 0.5, 0.21, 3, 0.08), m.torso, 0.24);
    }

    // Neck and head.
    j.neck = group(chest, 0, 0.5, 0);
    add(j.neck, new THREE.CylinderGeometry(0.04, 0.045, 0.08, 10), robot ? m.joint : m.head, 0.03);
    if (robot) {
      const head = add(j.neck, new THREE.SphereGeometry(0.11, 24, 16), m.head, 0.17);
      head.scale.set(0.95, 1.12, 1);
      // Wraparound visor: a slightly larger slice of sphere across the face.
      const visor = add(
        j.neck,
        new THREE.SphereGeometry(0.113, 24, 8, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.24),
        m.visor,
        0.17
      );
      visor.scale.set(0.95, 1.12, 1);
    } else {
      const head = add(j.neck, new THREE.SphereGeometry(0.105, 16, 12), m.head, 0.17);
      head.scale.set(0.92, 1.08, 1);
      const hair = add(j.neck, new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), m.hair, 0.19, 0, -0.01);
      hair.scale.set(0.95, 1, 1.02);
    }

    // Arms.
    for (const side of ['l', 'r']) {
      const x = side === 'l' ? 0.225 : -0.225;
      const shoulder = (j[`${side}Shoulder`] = group(chest, x, 0.44, 0));
      if (robot) add(shoulder, new THREE.SphereGeometry(0.06, 12, 8), m.joint);
      add(shoulder, new THREE.CapsuleGeometry(0.048, 0.2, 4, 10), m.limbUpper, -0.15);
      const elbow = (j[`${side}Elbow`] = group(shoulder, 0, -0.3, 0));
      if (robot) add(elbow, new THREE.SphereGeometry(0.042, 10, 8), m.joint);
      add(elbow, new THREE.CapsuleGeometry(0.04, 0.18, 4, 10), robot ? m.upper : m.forearm, -0.13);
      add(elbow, new THREE.SphereGeometry(0.045, 10, 8), m.hand, -0.28);
    }
  }
}
