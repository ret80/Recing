import { AI_CONFIG } from '../config/balance';

/**
 * Utility AI соперников.
 *
 * Вместо жёсткой машины состояний каждый кадр считаем полезность набора
 * манёвров и выбираем лучший. Это позволяет спокойно добавлять новые
 * поведения (объезд, разворот, откат) и не тонуть в переходах состояний.
 */

export type AIManeuver = 'race' | 'reverse' | 'turnAround' | 'recover';

export type AISensors = {
  /** Полная скорость машины (м/с). */
  speed: number;
  /** Продольная скорость: > 0 — вперёд, < 0 — назад. */
  forwardSpeed: number;
  /** Ошибка курса до точки прицеливания (рад), > 0 — цель правее. */
  yawError: number;
  /** Ошибка курса относительно направления трассы (рад). */
  trackHeadingError: number;
  /** Впереди стена или другое препятствие в пределах probeDistance. */
  blockedAhead: boolean;
  /** Позади стена или другое препятствие в пределах probeDistance. */
  blockedBehind: boolean;
  /** Недавно был удар об отбойник. */
  recentWallHit: boolean;
  /** Машина лежит вверх колёсами. */
  upsideDown: boolean;
  /** Машина улетела ниже уровня смерти. */
  fell: boolean;
};

export type AIDecision = {
  maneuver: AIManeuver;
  throttle: number;
  brake: number;
  steer: number;
  /** Пора вернуть машину на чекпоинт. */
  respawn: boolean;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export class AIBrain {
  readonly aggression: number;
  readonly skill: number;
  readonly personality: string;

  /** Индекс ближайшей точки трассы (обновляет Game перед вызовом update). */
  targetWaypoint = 0;
  maneuver: AIManeuver = 'race';

  private maneuverTime = 0;
  private stuckTime = 0;
  private upsideDownTime = 0;
  private turnPhase: 'reverse' | 'forward' = 'reverse';
  private turnPhaseTime = 0;

  constructor(aggression: number, skill: number, personality: string) {
    this.aggression = aggression;
    this.skill = skill;
    this.personality = personality;
  }

  /** Сброс после респауна: машина снова стоит ровно на трассе. */
  reset(): void {
    this.maneuver = 'race';
    this.maneuverTime = 0;
    this.stuckTime = 0;
    this.upsideDownTime = 0;
    this.turnPhase = 'reverse';
    this.turnPhaseTime = 0;
  }

  update(dt: number, sensors: AISensors, targetSpeed: number): AIDecision {
    this.maneuverTime += dt;

    if (sensors.upsideDown) this.upsideDownTime += dt;
    else this.upsideDownTime = 0;

    // Застревание — это долгая езда на околонулевой скорости. Считаем его
    // независимо от манёвра, чтобы серия неудачных откатов всё-таки привела
    // к респауну, а не к бесконечному циклу.
    if (sensors.speed < AI_CONFIG.stuckSpeed) this.stuckTime += dt;
    else this.stuckTime = 0;

    const next = this.chooseManeuver(sensors);
    if (next !== this.maneuver) this.enter(next, sensors);
    return this.control(dt, sensors, targetSpeed);
  }

  private chooseManeuver(sensors: AISensors): AIManeuver {
    const heading = Math.abs(sensors.trackHeadingError);
    const slow = sensors.speed < AI_CONFIG.stuckSpeed;
    const wrongWay = heading > AI_CONFIG.wrongWayAngle;
    const canReverse = !sensors.blockedBehind;

    const scores: Record<AIManeuver, number> = {
      race: 1,
      reverse: 0,
      turnAround: 0,
      recover: 0,
    };

    // Откат назад: упёрлись в стену/препятствие или только что врезались.
    if (slow && canReverse) {
      if (sensors.blockedAhead) scores.reverse += 3.2;
      if (sensors.recentWallHit) scores.reverse += 2.2;
    }

    // Разворот: едем против трассы, зажаты с двух сторон или откат не помог.
    if (wrongWay) scores.turnAround += slow ? 4 : 3;
    if (slow && sensors.blockedAhead && sensors.blockedBehind) scores.turnAround += 3.4;
    if (
      this.maneuver === 'reverse' &&
      this.maneuverTime >= AI_CONFIG.reverseBurstSec &&
      sensors.blockedAhead
    ) {
      scores.turnAround += 2.5;
    }

    // Респаун — крайняя мера.
    if (sensors.fell) scores.recover += 100;
    if (this.stuckTime > AI_CONFIG.recoverStuckSec) scores.recover += 10;
    if (this.upsideDownTime > AI_CONFIG.flippedRecoverSec) scores.recover += 20;
    // Не смогли развернуться за отведённое время — лучше вернуть на трассу,
    // чем бесконечно нарезать круги.
    if (
      this.maneuver === 'turnAround' &&
      this.maneuverTime > AI_CONFIG.turnAroundTimeoutSec
    ) {
      scores.recover += 15;
    }

    // Гистерезис: не дёргаемся между манёврами каждый кадр.
    if (this.maneuver !== 'race') {
      scores[this.maneuver] += this.maneuverTime < AI_CONFIG.minManeuverTime ? 5 : 0.6;
    }

    // Удержание уже начатого манёвра.
    if (this.maneuver === 'reverse' && canReverse && this.maneuverTime < AI_CONFIG.reverseBurstSec) {
      scores.reverse += 6;
    }
    if (this.maneuver === 'turnAround') {
      const done = heading < AI_CONFIG.turnDoneAngle;
      const timedOut = this.maneuverTime > AI_CONFIG.turnAroundTimeoutSec;
      if (!done && !timedOut) scores.turnAround += 8;
    }

    let best: AIManeuver = 'race';
    let bestScore = scores.race;
    for (const candidate of ['reverse', 'turnAround', 'recover'] as const) {
      if (scores[candidate] > bestScore) {
        best = candidate;
        bestScore = scores[candidate];
      }
    }
    return best;
  }

  private enter(next: AIManeuver, sensors: AISensors): void {
    this.maneuver = next;
    this.maneuverTime = 0;
    this.turnPhaseTime = 0;
    // Если сзади стена — трёхточечный разворот начинаем с движения вперёд.
    this.turnPhase = sensors.blockedBehind ? 'forward' : 'reverse';
  }

  private control(dt: number, sensors: AISensors, targetSpeed: number): AIDecision {
    const decision: AIDecision = {
      maneuver: this.maneuver,
      throttle: 0,
      brake: 0,
      steer: 0,
      respawn: false,
    };

    switch (this.maneuver) {
      case 'race': {
        decision.throttle = sensors.speed < targetSpeed ? 1 : 0;
        decision.brake = sensors.speed > targetSpeed * 1.18 ? 1 : 0;
        decision.steer = clamp(sensors.yawError * 1.8, -1, 1);
        break;
      }
      case 'reverse': {
        // Руль работает от знака продольной скорости: пока машина ещё катится
        // вперёд, он поворачивает нос в нужную сторону, а после перехода на
        // задний ход — наоборот. Так откат не «отменяет» уже начатый доворот.
        const turn = Math.sign(sensors.trackHeadingError) * AI_CONFIG.reverseSteer;
        const travel = Math.sign(sensors.forwardSpeed) || -1;
        decision.brake = 1;
        decision.steer = clamp(turn * travel, -1, 1);
        break;
      }
      case 'turnAround': {
        this.turnPhaseTime += dt;
        const sign = Math.sign(sensors.trackHeadingError) || 1;
        const travel = Math.sign(sensors.forwardSpeed) || 1;

        if (sensors.blockedBehind && !sensors.blockedAhead) this.turnPhase = 'forward';
        else if (sensors.blockedAhead && !sensors.blockedBehind) this.turnPhase = 'reverse';
        else if (this.turnPhaseTime > AI_CONFIG.turnPhaseSec) {
          this.turnPhase = this.turnPhase === 'reverse' ? 'forward' : 'reverse';
          this.turnPhaseTime = 0;
        }

        // Направление руля зависит от того, куда машина реально катится:
        // yawRate = v · tan(steer), поэтому знак руля = знак ошибки · знак v.
        decision.steer = clamp(sign * travel * AI_CONFIG.turnSteer, -1, 1);
        if (this.turnPhase === 'reverse') decision.brake = 1;
        else decision.throttle = 1;
        break;
      }
      case 'recover': {
        decision.respawn = true;
        break;
      }
    }

    return decision;
  }
}
