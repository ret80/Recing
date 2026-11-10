import { Vec3 } from 'cannon-es';
import { PHYSICS } from '../config/balance';

export type VelocityDecomposition = {
  forwardSpeed: number;
  lateralSpeed: number;
};

export type GroundSlope = {
  /** Тангаж рельефа (рад): > 0 — подъём по направлению движения. */
  pitch: number;
  /** Крен рельефа (рад): > 0 — правый борт выше. */
  roll: number;
};

export function decomposeVelocity(velocity: Vec3, forward: Vec3, right: Vec3): VelocityDecomposition {
  return {
    forwardSpeed: velocity.dot(forward),
    lateralSpeed: velocity.dot(right),
  };
}

/** Полу-авторитетная модель: поперечная скорость гасится сцеплением (GDD §8). */
export function dampLateral(lateralSpeed: number, grip: number, surfaceGrip: number, dt: number): number {
  const factor = Math.exp(-Math.max(0, grip) * Math.max(0, surfaceGrip) * PHYSICS.lateralGripRate * dt);
  return lateralSpeed * factor;
}

export function applyDrag(speed: number, surfaceDrag: number, dt: number): number {
  if (surfaceDrag <= 0) return speed;
  return speed * Math.exp(-surfaceDrag * PHYSICS.dragRate * dt);
}

export function clampForwardSpeed(
  forwardSpeed: number,
  maxSpeed: number,
  nitroMult = 1,
  reverseFactor = PHYSICS.maxReverseFactor,
): number {
  const limit = maxSpeed * nitroMult;
  return Math.max(-limit * reverseFactor, Math.min(limit, forwardSpeed));
}

export function rebuildVelocity(
  forwardSpeed: number,
  lateralSpeed: number,
  forward: Vec3,
  right: Vec3,
  vertical: number,
): Vec3 {
  return new Vec3(
    forward.x * forwardSpeed + right.x * lateralSpeed,
    vertical,
    forward.z * forwardSpeed + right.z * lateralSpeed,
  );
}

/** Идеальная скорость в повороте (GDD §7). */
export function idealCornerSpeed(maxSpeed: number, skill: number, grip: number, curvature: number): number {
  if (curvature <= 0.0001) return maxSpeed * skill;
  const curveLimit = Math.sqrt(Math.max(0.01, grip * 9.82) / curvature);
  return Math.min(maxSpeed * skill, curveLimit);
}

/**
 * Угол поворота колёс (рад). На малой скорости руль выкручивается полностью,
 * на высокой — угол падает, иначе машина «складывается» на прямой.
 */
export function steeringAngle(
  steer: number,
  speed: number,
  maxAngle: number = PHYSICS.steerMaxAngle,
  falloffSpeed: number = PHYSICS.steerFalloffSpeed,
): number {
  const magnitude = Math.abs(speed);
  if (magnitude <= PHYSICS.steerDeadSpeed) return 0;
  const falloff = 1 / (1 + magnitude / Math.max(1, falloffSpeed));
  return steer * maxAngle * falloff;
}

/**
 * Угол руля с ограничением по предельному боковому ускорению.
 * Без него на 120 км/ч полный ход клавиши сразу выкручивает колёса на 20°
 * и машина уходит в снос — даже в симуляторах клавиатурный руль так
 * ограничивают. На прямой ограничение не действует.
 */
export function speedLimitedSteer(
  steer: number,
  speed: number,
  maxAngle: number,
  falloffSpeed: number,
  lateralLimit: number,
): number {
  const base = steeringAngle(steer, speed, maxAngle, falloffSpeed);
  const magnitude = Math.abs(speed);
  if (magnitude <= PHYSICS.steerDeadSpeed || lateralLimit <= 0) return base;
  const limit = Math.atan((PHYSICS.wheelbase * lateralLimit) / (magnitude * magnitude));
  const allowed = Math.max(0.02, limit);
  return Math.sign(base) * Math.min(Math.abs(base), allowed);
}

/**
 * Нормированная боковая сила шины от угла скольжения: упрощённая
 * «магическая формула» Pacejka F = sin(C · atan(B · tan α)).
 * Пик μ приходится на peakSlip, дальше сила падает до ~76% — это и есть
 * срыв в скольжение. Возвращает значение в диапазоне -1..1.
 */
export function tireLateralForce(slipAngle: number, peakSlip: number, shape: number, curve: number): number {
  if (peakSlip <= 0) return 0;
  const normalized = slipAngle / peakSlip;
  return -Math.sin(curve * Math.atan(shape * normalized));
}

/**
 * Скорость рыскания по велосипедной модели: ω = v · tan(δ) / база.
 * Поворотный радиус зависит от угла руля, а не от «магии» — машина
 * больше не разворачивается на месте на малой скорости.
 * Сверху ω ограничена сцеплением (боковое ускорение ≤ grip · g).
 */
export function steeringYawRate(steer: number, speed: number, grip = 1, surfaceGrip = 1): number {
  const magnitude = Math.abs(speed);
  if (magnitude <= PHYSICS.steerDeadSpeed) return 0;
  const angle = steeringAngle(steer, speed);
  const kinematic = (speed * Math.tan(angle)) / PHYSICS.wheelbase;
  const gripLimit = (Math.max(0.05, grip * surfaceGrip) * PHYSICS.lateralGripAccel) / magnitude;
  return Math.max(-gripLimit, Math.min(gripLimit, kinematic));
}

/** Плавно двигает значение к цели не быстрее, чем на maxDelta за шаг. */
export function approach(value: number, target: number, maxDelta: number): number {
  if (maxDelta <= 0) return target;
  const delta = target - value;
  if (Math.abs(delta) <= maxDelta) return target;
  return value + Math.sign(delta) * maxDelta;
}

/**
 * Продольная динамика машины за кадр: газ, тормоз, накат, сопротивление
 * воздуха и уклон трассы. Возвращает новую продольную скорость.
 */
export function integrateLongitudinal(params: {
  speed: number;
  throttle: number;
  brake: number;
  acceleration: number;
  maxSpeed: number;
  dt: number;
  slopePitch: number;
  nitroMult?: number;
}): number {
  const { speed, throttle, brake, acceleration, maxSpeed, dt, slopePitch } = params;
  const nitroMult = params.nitroMult ?? 1;
  let next = speed;

  if (throttle > 0) {
    // Тяга слабеет у предела скорости — разгон выходит ровным, без рывка в «стену».
    const headroom = Math.max(0, 1 - Math.abs(next) / Math.max(1, maxSpeed * nitroMult));
    next += acceleration * nitroMult * throttle * (0.35 + 0.65 * headroom) * dt;
  }
  if (brake > 0) {
    if (next > 0.3) {
      next = Math.max(0, next - acceleration * PHYSICS.brakeFactor * brake * dt);
    } else {
      next -= acceleration * PHYSICS.reverseAccelFactor * brake * dt;
    }
  }
  if (throttle <= 0 && brake <= 0) {
    // Накат: сопротивление качению + торможение двигателем.
    const decel = PHYSICS.coastDecel + PHYSICS.engineBrake * Math.min(1, Math.abs(next) / 6);
    next = approach(next, 0, decel * dt);
  }

  next -= Math.sign(next) * PHYSICS.aeroDrag * next * next * dt;
  // Уклон: подъём отбирает скорость, спуск добавляет.
  next -= 9.82 * Math.sin(slopePitch) * dt;

  return next;
}

export function angleDifference(a: number, b: number): number {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}
