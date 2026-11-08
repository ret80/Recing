import {
  Body,
  Box,
  ContactMaterial,
  Material,
  Plane,
  Quaternion,
  Ray,
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

  /**
   * Участок дорожного полотна между двумя точками сплайна.
   * Верхняя грань бокса проходит точно через a и b — поэтому уклон
   * получается честным, без «ступенек» из горизонтальных плит.
   */
  addTrackSegment(a: Vec3, b: Vec3, halfWidth: number, thickness = 1.2): Body {
    const delta = b.vsub(a);
    const horizontal = Math.hypot(delta.x, delta.z);
    const length = Math.hypot(horizontal, delta.y);
    const yaw = Math.atan2(delta.x, delta.z);
    const pitch = Math.atan2(delta.y, Math.max(1e-4, horizontal));
    const rotation = new Quaternion().setFromEuler(0, yaw, 0);
    rotation.mult(new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), -pitch), rotation);
    rotation.normalize();
    const up = rotation.vmult(new Vec3(0, 1, 0));
    const body = new Body({ mass: 0, material: this.groundMaterial });
    body.addShape(new Box(new Vec3(halfWidth, thickness, length / 2 + 0.02)));
    body.position.copy(a.clone().vadd(b).scale(0.5).vsub(up.scale(thickness)));
    body.quaternion.copy(rotation);
    this.world.addBody(body);
    return body;
  }

  addWall(x: number, z: number, halfLength: number, yaw: number, height = 1.4, baseY = 0): Body {
    const body = new Body({ mass: 0, material: this.wallMaterial });
    body.addShape(new Box(new Vec3(0.5, height, halfLength)));
    body.position.set(x, baseY + height, z);
    body.quaternion.setFromEuler(0, yaw, 0);
    this.world.addBody(body);
    return body;
  }

  /** Статический бокс произвольного размера — препятствия, столбы, кубы. */
  addStaticBox(
    x: number,
    z: number,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
    yaw: number,
    y = halfHeight,
  ): Body {
    const body = new Body({ mass: 0, material: this.wallMaterial });
    body.addShape(new Box(new Vec3(halfWidth, halfHeight, halfDepth)));
    body.position.set(x, y, z);
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

  /**
   * Выравнивает данные интерполяции с текущим положением. Нужно после
   * телепорта/спавна: иначе первый кадр рисуется по старым значениям.
   */
  static syncInterpolation(body: Body): void {
    body.previousPosition.copy(body.position);
    body.interpolatedPosition.copy(body.position);
    body.previousQuaternion.copy(body.quaternion);
    body.interpolatedQuaternion.copy(body.quaternion);
  }

  /**
   * Ближайшее попадание луча. `skipBody` исключает корпус самой машины,
   * `ignoreBody` — например, все машины (для лучей подвески, которым нужен
   * только рельеф и препятствия).
   */
  raycast(
    from: Vec3,
    to: Vec3,
    skipBody: Body | null = null,
    ignoreBody?: (body: Body) => boolean,
  ): RaycastHit | null {
    const ray = new Ray(from, to);
    const options: { collisionFilterMask?: number; skipBackfaces: boolean; collisionFilterGroup: number } = {
      skipBackfaces: true,
      collisionFilterGroup: 1,
    };
    let best: RaycastHit | null = null;
    this.world.raycastAll(ray.from, ray.to, options, (result) => {
      if (!result.hasHit || !result.body) return;
      if (result.body === skipBody) return;
      if (ignoreBody?.(result.body)) return;
      const distance = from.distanceTo(result.hitPointWorld);
      if (!best || distance < best.distance) {
        best = {
          body: result.body,
          point: result.hitPointWorld.clone(),
          distance,
        };
      }
    });
    return best;
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
