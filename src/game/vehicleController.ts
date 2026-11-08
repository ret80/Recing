import { Body, Vec3 } from 'cannon-es';
import { PHYSICS } from '../config/balance';
import type { Drivetrain } from '../config/cars';
import type { PhysicsWorld } from '../physics/physicsWorld';
import { steeringAngle } from './vehicleMath';

/**
 * Собственный колёсный контроллер (без cannon-es RaycastVehicle/RigidVehicle).
 *
 * Для каждого колеса пускается луч вниз. Если луч нашёл дорогу, считается
 * сжатие пружины, к кузову прикладывается сила подвески, а в точке контакта —
 * продольная (тяга/тормоз) и поперечная (сцепление) силы шины. Тяга
 * распределяется по осям согласно приводу: FWD, RWD или AWD.
 *
 * Модель намеренно аркадная: силы ограничены сцеплением, а не точной
 * эмуляцией пятна контакта.
 */

export type WheelDefinition = {
  /** Локальное смещение по правой оси. */
  x: number;
  /** Локальное смещение по передней оси. */
  z: number;
  /** Поворачивается ли колесо рулём. */
  steer: boolean;
};

/** Порядок совпадает с порядком колёс в renderer.createCarVisual. */
export const WHEELS: readonly WheelDefinition[] = [
  { x: -PHYSICS.wheels.track / 2, z: -PHYSICS.wheels.axleZ, steer: false },
  { x: -PHYSICS.wheels.track / 2, z: PHYSICS.wheels.axleZ, steer: true },
  { x: PHYSICS.wheels.track / 2, z: -PHYSICS.wheels.axleZ, steer: false },
  { x: PHYSICS.wheels.track / 2, z: PHYSICS.wheels.axleZ, steer: true },
];

export type WheelState = {
  grounded: boolean;
  /** Расстояние от точки крепления до центра колеса (м). */
  suspensionLength: number;
  /** Сжатие пружины (м), 0 — колесо висит. */
  compression: number;
  /** Нормальная нагрузка на колесо (Н). */
  load: number;
  contactPoint: Vec3;
};

export type VehicleState = {
  wheels: WheelState[];
  /** Текущий угол поворота передних колёс (рад). */
  steerAngle: number;
  groundedWheels: number;
  /** Продольная скорость кузова (м/с). */
  speed: number;
};

export type VehicleStepParams = {
  throttle: number;
  brake: number;
  steer: number;
  acceleration: number;
  maxSpeed: number;
  mass: number;
  grip: number;
  surfaceGrip: number;
  drivetrain: Drivetrain;
  nitroMult: number;
  dt: number;
};

function makeWheelState(): WheelState {
  return {
    grounded: false,
    suspensionLength: PHYSICS.wheels.restLength + PHYSICS.wheels.travel,
    compression: 0,
    load: 0,
    contactPoint: new Vec3(),
  };
}

export function createVehicleState(): VehicleState {
  return {
    wheels: WHEELS.map(() => makeWheelState()),
    steerAngle: 0,
    groundedWheels: 0,
    speed: 0,
  };
}

function driveShare(drivetrain: Drivetrain, wheel: WheelDefinition): number {
  // Полный привод с лёгким перекосом назад: так машина стабильнее на разгоне,
  // но передние колёса всё равно помогают на скользком покрытии.
  if (drivetrain === 'AWD') return wheel.z > 0 ? 0.15 : 0.35;
  if (drivetrain === 'FWD') return wheel.z > 0 ? 1 / 2 : 0;
  return wheel.z < 0 ? 1 / 2 : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type WheelContact = {
  wheel: WheelDefinition;
  springForce: number;
  contactPoint: Vec3;
};

/**
 * Прикладывает к кузову силы подвески и шин на текущем шаге.
 * Вызывать до physics.step(): cannon-es интегрирует накопленные силы.
 */
export function stepVehicle(
  state: VehicleState,
  body: Body,
  physics: PhysicsWorld,
  params: VehicleStepParams,
  ignoreBody?: (body: Body) => boolean,
): void {
  const { dt, mass, acceleration, maxSpeed } = params;
  const wheelConfig = PHYSICS.wheels;
  const forward = body.quaternion.vmult(new Vec3(0, 0, 1));
  forward.y = 0;
  if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);
  forward.normalize();
  const right = body.quaternion.vmult(new Vec3(1, 0, 0));
  right.y = 0;
  if (right.lengthSquared() < 1e-6) right.set(1, 0, 0);
  right.normalize();

  const speed = body.velocity.dot(forward);
  state.speed = speed;
  state.steerAngle = steeringAngle(params.steer, speed);
  const steer = state.steerAngle;

  const springK = wheelConfig.springStiffness * mass;
  const damperC = 2 * wheelConfig.dampingRatio * Math.sqrt(springK * (mass / 4));
  const maxSpringForce = wheelConfig.maxSpringForcePerMass * mass;
  const maxRay = PHYSICS.wheelRadius + wheelConfig.restLength + wheelConfig.travel;

  const contacts: WheelContact[] = [];
  let groundedWheels = 0;

  for (let index = 0; index < WHEELS.length; index += 1) {
    const wheel = WHEELS[index] as WheelDefinition;
    const wheelState = state.wheels[index] as WheelState;
    const localAttach = new Vec3(wheel.x, wheelConfig.attachY, wheel.z);
    const attach = body.quaternion.vmult(localAttach).vadd(body.position);
    const hit = physics.raycast(attach, attach.vadd(new Vec3(0, -maxRay, 0)), body, ignoreBody);

    let grounded = false;
    let compression = 0;
    let suspensionLength = wheelConfig.restLength + wheelConfig.travel;
    let springForce = 0;
    let contactPoint = wheelState.contactPoint;

    if (hit && hit.distance <= maxRay) {
      const distance = hit.distance;
      const rawLength = distance - PHYSICS.wheelRadius;
      if (rawLength <= wheelConfig.restLength) {
        grounded = true;
        compression = Math.max(0, wheelConfig.restLength - rawLength);
        suspensionLength = Math.max(0, rawLength);
        contactPoint = hit.point;
        const contactVelocity = body.getVelocityAtWorldPoint(contactPoint, new Vec3());
        springForce = springK * compression - damperC * contactVelocity.y;
        // Отбойник: подвеска выбрана до упора, кузов не должен «проседать» в дорогу.
        if (rawLength <= 0) {
          springForce += wheelConfig.bumpStiffness * mass * -rawLength;
        }
        springForce = clamp(springForce, 0, maxSpringForce);
        if (springForce > 0) {
          body.applyForce(new Vec3(0, springForce, 0), contactPoint.vsub(body.position));
        }
      }
    }

    wheelState.grounded = grounded;
    wheelState.compression = compression;
    wheelState.suspensionLength = suspensionLength;
    wheelState.load = springForce;
    wheelState.contactPoint.copy(contactPoint);
    if (grounded && springForce > 0) {
      groundedWheels += 1;
      contacts.push({ wheel, springForce, contactPoint });
    }
  }

  state.groundedWheels = groundedWheels;
  if (groundedWheels === 0) {
    // В воздухе руль немного доворачивает кузов — так машина не «замирает»
    // после трамплина.
    body.angularVelocity.y += params.steer * wheelConfig.airSteerRate * dt;
    applyAeroDrag(body, mass);
    return;
  }

  const nitroMult = params.nitroMult;
  const headroom = clamp(1 - Math.abs(speed) / Math.max(1, maxSpeed * nitroMult), 0, 1);
  const throttle = clamp(params.throttle, 0, 1);
  const brake = clamp(params.brake, 0, 1);
  const driveForce = mass * acceleration * throttle * (0.35 + 0.65 * headroom) * nitroMult;
  const brakeForce = mass * acceleration * PHYSICS.brakeFactor * brake;
  const reverseForce = mass * acceleration * PHYSICS.reverseAccelFactor * brake;
  const rollingForce =
    mass * (PHYSICS.coastDecel + PHYSICS.engineBrake * Math.min(1, Math.abs(speed) / 6));
  const brakingForward = speed > 0.3;
  const canDrive = speed < maxSpeed * nitroMult;
  const canReverse = speed > -maxSpeed * PHYSICS.maxReverseFactor;

  const maxFrictionScale = params.grip * params.surfaceGrip * wheelConfig.tireFriction;

  for (const contact of contacts) {
    const wheelForward = contact.wheel.steer
      ? new Vec3(
          forward.x * Math.cos(steer) + right.x * Math.sin(steer),
          0,
          forward.z * Math.cos(steer) + right.z * Math.sin(steer),
        )
      : forward;
    if (contact.wheel.steer) wheelForward.normalize();
    const wheelRight = new Vec3(wheelForward.z, 0, -wheelForward.x);
    const pointVelocity = body.getVelocityAtWorldPoint(contact.contactPoint, new Vec3());
    const longSpeed = pointVelocity.dot(wheelForward);
    const lateralSpeed = pointVelocity.dot(wheelRight);

    let desiredLong = 0;
    const share = driveShare(params.drivetrain, contact.wheel);
    if (throttle > 0 && share > 0 && canDrive) desiredLong += driveForce * share;
    if (brake > 0) {
      if (brakingForward) desiredLong -= brakeForce / groundedWheels;
      else if (share > 0 && canReverse) desiredLong -= reverseForce * share;
    }
    if (throttle <= 0 && brake <= 0 && Math.abs(longSpeed) > 0.1) {
      desiredLong -= Math.sign(longSpeed) * (rollingForce / groundedWheels);
    }

    let desiredLateral = -lateralSpeed * mass * wheelConfig.corneringStiffness / groundedWheels;
    const maxFriction = contact.springForce * maxFrictionScale;
    const magnitude = Math.hypot(desiredLong, desiredLateral);
    if (magnitude > maxFriction && magnitude > 1e-6) {
      const scale = maxFriction / magnitude;
      desiredLong *= scale;
      desiredLateral *= scale;
    }

    const force = wheelForward.scale(desiredLong).vadd(wheelRight.scale(desiredLateral));
    if (force.lengthSquared() > 1e-6) {
      body.applyForce(force, contact.contactPoint.vsub(body.position));
    }
  }

  applyAeroDrag(body, mass);
}

function applyAeroDrag(body: Body, mass: number): void {
  const horizontal = new Vec3(body.velocity.x, 0, body.velocity.z);
  const horizontalSpeed = horizontal.length();
  if (horizontalSpeed <= 0.1) return;
  const drag = horizontal.scale((-mass * PHYSICS.aeroDrag * horizontalSpeed * horizontalSpeed) / horizontalSpeed);
  body.applyForce(drag);
}
