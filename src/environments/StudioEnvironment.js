import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * A dim museum "stage": floor, fog and lighting with a single spot for the cabinet.
 *
 * Every environment exposes the same shape so main.js can swap one for another:
 *   build(app)   adds its contents to app.scene
 *   anchors      named placements ({ position, rotationY }) for furniture
 *   viewpoints   named camera views ({ position, target })
 *   update(dt)   optional per-frame work
 *   dispose()    removes everything it added
 */
export class StudioEnvironment {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'StudioEnvironment';

    this.anchors = {
      cabinet: { position: new THREE.Vector3(0, 0, 0), rotationY: 0 },
    };
    this.viewpoints = {
      cabinet: {
        position: new THREE.Vector3(0.45, 2.05, 1.85),
        target: new THREE.Vector3(0, 0.74, 0.2),
      },
    };
  }

  build(app) {
    const { scene, renderer } = app;
    this.scene = scene;

    const backgroundColor = new THREE.Color(0x17120e);
    scene.background = backgroundColor;
    scene.fog = new THREE.Fog(backgroundColor, 4, 11);

    // Soft image-based lighting so metals and glass have something to reflect.
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.35;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 64),
      new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    const hemi = new THREE.HemisphereLight(0xf3e3c8, 0x1a120c, 0.5);
    this.root.add(hemi);

    const key = new THREE.SpotLight(0xffdcae, 40, 10, Math.PI / 6, 0.6, 1.6);
    key.position.set(1.4, 3.2, 2.2);
    key.target.position.set(0, 0.8, 0.1);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 8;
    this.root.add(key, key.target);

    const rim = new THREE.DirectionalLight(0x9fb4d8, 0.6);
    rim.position.set(-2.5, 2.0, -2.5);
    this.root.add(rim);

    scene.add(this.root);
    return this;
  }

  update() {}

  dispose() {
    this.scene.remove(this.root);
    this.scene.environment = null;
    this.scene.background = null;
    this.scene.fog = null;
    this.envMap?.dispose();
  }
}
