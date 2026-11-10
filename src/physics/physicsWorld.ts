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

/**
 * Равновесная высота COM кузова над плоскостью дороги: колесо касается
 * земли, подвеска сжата весом машины. Считается из геометрии подвески,
 * поэтому не зависит от массы (жёсткость пружины задана на килограмм).
 */
export const CHASSIS_REST_Y =
  PHYSICS.wheelRadius +
  PHYSICS.wheels.restLength -
  WORLD.gravity / (4 * PHYSICS.wheels.springStiffness) -
  PHYSICS.wheels.attachY;

export type RaycastHit = {
  body: Body | null;
  point: Vec3;
  /** Нормаль поверхности в точке попадания (смотрит из поверхности). */
  normal: Vec3;
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
    this.world.defaultContactMaterial.restitution = PHYSICS.restitutionBody;

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
        friction: PHYSICS.wallFriction,
        restitution: PHYSICS.wallRestitution,
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
   *
   * Бокс удлиняется на `overlap` с каждой стороны: на повороте соседние
   * сегменты расходятся клином, и без перекрытия на внешней кромке
   * поворота появлялась дыра, в которую проваливалась машина.
   */
  addTrackSegment(a: Vec3, b: Vec3, halfWidth: number, thickness = 1.2, overlap = 1.1): Body {
    const delta = b.vsub(a);
    const fullLength = delta.length();
    if (fullLength < 1e-5) return this.addGroundBox(a.x, a.z, halfWidth, 0.1, 0);
    const dir = delta.scale(1 / fullLength);
    const start = a.vsub(dir.scale(overlap));
    const end = b.vadd(dir.scale(overlap));
    const horizontal = Math.hypot(delta.x, delta.z);
    const length = Math.hypot(horizontal, delta.y) + overlap * 2;
    const yaw = Math.atan2(delta.x, delta.z);
    const pitch = Math.atan2(delta.y, Math.max(1e-4, horizontal));
    const rotation = new Quaternion().setFromEuler(0, yaw, 0);
    rotation.mult(new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), -pitch), rotation);
    rotation.normalize();
    const up = rotation.vmult(new Vec3(0, 1, 0));
    const body = new Body({ mass: 0, material: this.groundMaterial });
    body.addShape(new Box(new Vec3(halfWidth, thickness, length / 2)));
    body.position.copy(start.vadd(end).scale(0.5).vsub(up.scale(thickness)));
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

  /**
   * Отбойник между двумя точками трассы: вертикальный бокс, следующий
   * за сплайном. Соседние секции перекрываются, поэтому ограждение
   * остаётся сплошным и на внутренней, и на внешней стороне поворота.
   */
  addWallSegment(a: Vec3, b: Vec3, height = 1.35, thickness = 0.36, overlap = 0.5): Body {
    const deltaX = b.x - a.x;
    const deltaZ = b.z - a.z;
    const horizontal = Math.hypot(deltaX, deltaZ);
    const yaw = Math.atan2(deltaX, deltaZ);
    const halfLength = Math.max(0.2, horizontal / 2 + overlap);
    const baseY = Math.min(a.y, b.y) - 0.25;
    const body = new Body({ mass: 0, material: this.wallMaterial });
    body.addShape(new Box(new Vec3(thickness / 2, (height + 0.4) / 2, halfLength)));
    body.position.set((a.x + b.x) / 2, baseY + (height + 0.4) / 2, (a.z + b.z) / 2);
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
          normal: result.hitNormalWorld.clone(),
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
