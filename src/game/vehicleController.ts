import { Body, Vec3 } from 'cannon-es';
import { HANDLING, PHYSICS, type DrivingMode } from '../config/balance';
import type { Drivetrain } from '../config/cars';
import type { PhysicsWorld } from '../physics/physicsWorld';
import { speedLimitedSteer, tireLateralForce } from './vehicleMath';

/**
 * Собственный колёсный контроллер (без cannon-es RaycastVehicle/RigidVehicle).
 *
 * Для каждого колеса пускается луч вниз. Если луч нашёл дорогу, считается
 * сжатие пружины, к кузову прикладывается сила подвески, а в точке контакта —
 * продольная (тяга/тормоз) и поперечная (сцепление) силы шины. Тяга
 * распределяется по осям согласно приводу: FWD, RWD или AWD.
 *
 * Два режима (GDD §8):
 *  - `sim` — боковая сила шины по углу скольжения и упрощённой формуле
 *    Pacejka; машина поворачивает только за счёт сил в пятнах контакта,
 *    а сумма сил ограничена кругом трения (μ ≈ 1.15 на асфальте).
 *  - `arcade` — вязкая модель бокового сноса, ассист руля и стабилизации:
 *    машина цепляется за дорогу и прощает ошибки.
 *
 * Подвеска, точки приложения сил и вес машины в обоих режимах одинаковые.
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
  /** Текущая боковая сила шины (Н) с учётом релаксации. */
  lateralForce: number;
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
  mode: DrivingMode;
  dt: number;
};

function makeWheelState(): WheelState {
  return {
    grounded: false,
    suspensionLength: PHYSICS.wheels.restLength + PHYSICS.wheels.travel,
    compression: 0,
    load: 0,
    lateralForce: 0,
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
  index: number;
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
  const handling = HANDLING[params.mode];
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
  const gripLimit = Math.max(0.05, params.grip * Math.max(0.05, params.surfaceGrip));
  // Ограничение угла руля по сцеплению и скорости: без него на 120 км/ч
  // полный ход клавиши сразу срывает переднюю ось в снос.
  state.steerAngle = speedLimitedSteer(
    params.steer,
    speed,
    handling.steerMaxAngle,
    handling.steerFalloffSpeed,
    handling.lateralLimit * gripLimit,
  );
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
    if (!grounded) wheelState.lateralForce = 0;
    if (grounded && springForce > 0) {
      groundedWheels += 1;
      contacts.push({ index, wheel, springForce, contactPoint });
    }
  }

  state.groundedWheels = groundedWheels;
  if (groundedWheels === 0) {
    // В воздухе руль немного доворачивает кузов — так машина не «замирает»
    // после трамплина.
    body.angularVelocity.y += params.steer * handling.airSteerRate * dt;
    applyAeroDrag(body, mass);
    return;
  }

  // Прижимная сила: доля веса на скорости 40 м/с. Она давит на кузов,
  // подвеска сжимается, и нагрузка на шины растёт сама собой.
  const speedRatio = Math.min(1.6, Math.abs(speed) / 40);
  if (handling.downforce > 0) {
    const downforce = mass * 9.82 * handling.downforce * speedRatio * speedRatio;
    body.applyForce(new Vec3(0, -downforce, 0));
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

  const tireMu = gripLimit * handling.tireGrip;

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
    const wheelState = state.wheels[contact.index] as WheelState;

    // Круг трения: продольная и поперечная силы вместе не могут превысить
    // сцепление шины с покрытием.
    const maxFriction = contact.springForce * tireMu;

    let desiredLong = 0;
    const share = driveShare(params.drivetrain, contact.wheel);
    // Тяга снижается, когда машину уже несёт боком: так аркадный ассист
    // стабилизации не даёт «дрифту» превратиться в неуправляемый занос.
    const sliding = Math.min(1, Math.abs(lateralSpeed) / 6);
    const traction = 1 - handling.stabilityControl * 0.5 * sliding;
    if (throttle > 0 && share > 0 && canDrive) desiredLong += driveForce * share * traction;
    if (brake > 0) {
      if (brakingForward) desiredLong -= brakeForce / groundedWheels;
      else if (share > 0 && canReverse) desiredLong -= reverseForce * share;
    }
    if (throttle <= 0 && brake <= 0 && Math.abs(longSpeed) > 0.1) {
      desiredLong -= Math.sign(longSpeed) * (rollingForce / groundedWheels);
    }

    let desiredLateral: number;
    if (handling.tireModel === 'slip') {
      // Угол скольжения: atan(боковая / продольная). Пол на продольной
      // скорости убирает сингулярность на месте.
      const slipAngle = Math.atan2(lateralSpeed, Math.max(handling.slipSpeedFloor, Math.abs(longSpeed)));
      const target =
        tireLateralForce(slipAngle, handling.peakSlip, handling.tireShape, handling.tireCurve) *
        maxFriction;
      // Релаксация шины: сила нарастает не мгновенно, иначе на разбитом
      // покрытии появляется высокочастотная тряска.
      const relax = 1 - Math.exp(-handling.tireRelaxation * dt);
      wheelState.lateralForce += (target - wheelState.lateralForce) * relax;
      desiredLateral = wheelState.lateralForce;
    } else {
      desiredLateral = (-lateralSpeed * mass * handling.lateralStiffness) / groundedWheels;
      wheelState.lateralForce = desiredLateral;
    }

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

  // Аркадный руль доворачивает кузов по велосипедной модели, чтобы отклик
  // был мгновенным. В симуляции угловую скорость создают только силы шин.
  if (handling.yawAssist > 0 && Math.abs(speed) > PHYSICS.steerDeadSpeed) {
    const kinematic = (speed * Math.tan(steer)) / PHYSICS.wheelbase;
    const yawLimit = (handling.lateralLimit * gripLimit) / Math.abs(speed);
    const target = clamp(kinematic, -yawLimit, yawLimit);
    const weight = 1 - Math.exp(-handling.yawAssist * 12 * dt);
    body.angularVelocity.y += (target - body.angularVelocity.y) * weight;
  }
  // Угловая скорость не может превышать предел сцепления: без этого
  // ассист складывается с силами шин и машина закручивается юлой.
  const yawCap = (handling.lateralLimit * gripLimit) / Math.max(3, Math.abs(speed));
  body.angularVelocity.y = clamp(body.angularVelocity.y, -yawCap, yawCap);
  if (handling.yawDamping > 0) {
    body.angularVelocity.y *= Math.exp(-handling.yawDamping * dt);
  }
  if (handling.autoStraighten > 0 && Math.abs(params.steer) < 0.05) {
    body.angularVelocity.y *= Math.exp(-handling.autoStraighten * dt);
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
