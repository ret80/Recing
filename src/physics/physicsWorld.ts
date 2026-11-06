import {
  Body,
  Box,
  ContactMaterial,
  Material,
  Plane,
  Quaternion,
  Ray,
  RaycastResult,
  SAPBroadphase,
  Vec3,
  World as CannonWorld,
} from 'cannon-es';
import { PHYSICS, WORLD } from '../config/balance';
import type { ComputedStats } from '../config/cars';

/** Высота COM кузова над плоскостью дороги. */
export const CHASSIS_REST_Y = PHYSICS.chassis.height / 2 - PHYSICS.chassis.shapeOffsetY;

export type RaycastHit = {
  body: Body | null;
  point: Vec3;
  distance: number;
};

export class PhysicsWorld {
  readonly world: CannonWorld;
  readonly groundMaterial: Material;
  readonly carMaterial: Material;
  readonly wallMaterial: Material;

  constructor() {
    this.world = new CannonWorld({
      gravity: new Vec3(0, -WORLD.gravity, 0),
      allowSleep: true,
    });
    this.world.broadphase = new SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = PHYSICS.groundFriction;
    this.world.defaultContactMaterial.restitution = 0.05;

    this.groundMaterial = new Material('ground');
    this.carMaterial = new Material('car');
    this.wallMaterial = new Material('wall');

    this.world.addContactMaterial(
      new ContactMaterial(this.groundMaterial, this.carMaterial, {
        friction: PHYSICS.carGroundFriction,
        restitution: PHYSICS.restitutionBody,
      }),
    );
    this.world.addContactMaterial(
      new ContactMaterial(this.wallMaterial, this.carMaterial, {
        friction: 0.05,
        restitution: 0.35,
      }),
    );
    this.world.addContactMaterial(
      new ContactMaterial(this.carMaterial, this.carMaterial, {
        friction: 0.1,
        restitution: 0.4,
      }),
    );
  }

  step(dt: number): void {
    this.world.step(WORLD.fixedDt, dt, WORLD.maxSubSteps);
  }

  addGroundPlane(y = 0): Body {
    const body = new Body({ mass: 0, material: this.groundMaterial });
    body.addShape(new Plane());
    body.position.set(0, y, 0);
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(body);
    return body;
  }

  addGroundBox(x: number, z: number, halfWidth: number, halfLength: number, yaw: number, y = 0): Body {
    const body = new Body({ mass: 0, material: this.groundMaterial });
    body.addShape(new Box(new Vec3(halfWidth, 0.5, halfLength)));
    body.position.set(x, y - 0.5, z);
    body.quaternion.setFromEuler(0, yaw, 0);
    this.world.addBody(body);
    return body;
  }

  addWall(x: number, z: number, halfLength: number, yaw: number, height = 1.4): Body {
    const body = new Body({ mass: 0, material: this.wallMaterial });
    body.addShape(new Box(new Vec3(0.5, height, halfLength)));
    body.position.set(x, height, z);
    body.quaternion.setFromEuler(0, yaw, 0);
    this.world.addBody(body);
    return body;
  }

  createCarBody(stats: ComputedStats, position: Vec3, yaw: number): Body {
    const { width, height, length, shapeOffsetY } = PHYSICS.chassis;
    const body = new Body({
      mass: stats.mass,
      material: this.carMaterial,
      linearDamping: 0.02,
      angularDamping: 0.35,
      allowSleep: false,
    });
    body.addShape(
      new Box(new Vec3(width / 2, height / 2, length / 2)),
      new Vec3(0, shapeOffsetY, 0),
    );
    body.position.copy(position);
    body.quaternion.setFromEuler(0, yaw, 0);
    body.updateMassProperties();
    this.world.addBody(body);
    return body;
  }

  removeBody(body: Body | null): void {
    if (!body) return;
    this.world.removeBody(body);
  }

  raycast(from: Vec3, to: Vec3, skipBody: Body | null = null): RaycastHit | null {
    const ray = new Ray(from, to);
    const result = new RaycastResult();
    const options: { collisionFilterMask?: number; skipBackfaces: boolean; collisionFilterGroup: number } = {
      skipBackfaces: true,
      collisionFilterGroup: 1,
    };
    this.world.raycastClosest(ray.from, ray.to, options, result);
    if (!result.hasHit || !result.body || result.body === skipBody) return null;
    return {
      body: result.body,
      point: result.hitPointWorld.clone(),
      distance: from.distanceTo(result.hitPointWorld),
    };
  }

  /** Рэйкаст вниз для поиска высоты поверхности под точкой. */
  groundHeightAt(x: number, z: number, fromY = 50): number | null {
    const hit = this.raycast(new Vec3(x, fromY, z), new Vec3(x, -WORLD.killPlaneY - 5, z));
    return hit ? hit.point.y : null;
  }

  dispose(): void {
    for (const body of [...this.world.bodies]) this.world.removeBody(body);
  }
}

export function quaternionYaw(q: Quaternion): number {
  const forward = new Vec3(0, 0, 1);
  const rotated = q.vmult(forward);
  return Math.atan2(rotated.x, rotated.z);
}

export function yawQuaternion(yaw: number): Quaternion {
  return new Quaternion().setFromEuler(0, yaw, 0);
}

export function forwardVector(quaternion: Quaternion): Vec3 {
  return quaternion.vmult(new Vec3(0, 0, 1));
}

export function rightVector(quaternion: Quaternion): Vec3 {
  return quaternion.vmult(new Vec3(1, 0, 0));
}
