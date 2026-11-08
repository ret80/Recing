import type { Body } from 'cannon-es';
import { Quaternion, Vec3 } from 'cannon-es';
import type { AnyActorRef } from 'xstate';
import type { ChassisType, SurfaceType } from '../config/balance';
import type { BoostType, FrontWeaponType, RearWeaponType } from '../config/weapons';
import type { ComputedStats, Drivetrain } from '../config/cars';

export type EntityId = number;

export type ComponentClass<T extends object> = new (...args: never[]) => T;

/**
 * Минималистичная ECS. Решение и обоснование: docs/ADR-001-ecs.md.
 * Entity — это числовой id; компоненты — классы, ключ хранения — конструктор.
 */
export class World {
  private nextId = 1;
  private readonly stores = new Map<object, Map<EntityId, object>>();
  private readonly destroyListeners = new Set<(id: EntityId) => void>();
  readonly entities = new Set<EntityId>();

  createEntity(): EntityId {
    const id = this.nextId++;
    this.entities.add(id);
    return id;
  }

  destroyEntity(id: EntityId): void {
    if (!this.entities.delete(id)) return;
    for (const store of this.stores.values()) store.delete(id);
    for (const listener of this.destroyListeners) listener(id);
  }

  onDestroy(listener: (id: EntityId) => void): () => void {
    this.destroyListeners.add(listener);
    return () => this.destroyListeners.delete(listener);
  }

  add<T extends object>(id: EntityId, component: T): T {
    if (!this.entities.has(id)) throw new Error(`Entity ${id} does not exist`);
    const key = component.constructor as object;
    let store = this.stores.get(key);
    if (!store) {
      store = new Map();
      this.stores.set(key, store);
    }
    store.set(id, component);
    return component;
  }

  remove<T extends object>(id: EntityId, type: ComponentClass<T>): void {
    this.stores.get(type)?.delete(id);
  }

  get<T extends object>(id: EntityId, type: ComponentClass<T>): T | undefined {
    return this.stores.get(type)?.get(id) as T | undefined;
  }

  require<T extends object>(id: EntityId, type: ComponentClass<T>): T {
    const component = this.get(id, type);
    if (!component) throw new Error(`Entity ${id} has no component ${type.name}`);
    return component;
  }

  has<T extends object>(id: EntityId, type: ComponentClass<T>): boolean {
    return this.stores.get(type)?.has(id) ?? false;
  }

  query(...types: ComponentClass<object>[]): EntityId[] {
    if (types.length === 0) return [...this.entities];
    const [first, ...rest] = types;
    if (!first) return [...this.entities];
    const base = this.stores.get(first);
    if (!base) return [];
    const result: EntityId[] = [];
    for (const id of base.keys()) {
      let match = true;
      for (const type of rest) {
        if (!this.stores.get(type)?.has(id)) {
          match = false;
          break;
        }
      }
      if (match) result.push(id);
    }
    return result;
  }

  each<T extends object>(types: ComponentClass<T>[], callback: (id: EntityId) => void): void {
    for (const id of this.query(...types)) callback(id);
  }

  addWorldComponent<T extends object>(component: T): T {
    return component;
  }

  clear(): void {
    this.entities.clear();
    this.stores.clear();
    this.nextId = 1;
  }

  get count(): number {
    return this.entities.size;
  }
}

export class Transform {
  position: Vec3;
  rotation: Quaternion;
  scale: Vec3;

  constructor(position = new Vec3(), rotation = new Quaternion(), scale = new Vec3(1, 1, 1)) {
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
  }
}

export class Physics {
  body: Body | null;
  velocity: Vec3;
  angularVelocity: Vec3;
  onGround: boolean;
  wasOnGround: boolean;
  previousY: number;
  /** Тангаж рельефа под машиной (рад): > 0 — подъём вперёд. */
  groundPitch = 0;
  /** Крен рельефа (рад): > 0 — правый борт выше. */
  groundRoll = 0;

  constructor(body: Body | null = null) {
    this.body = body;
    this.velocity = body ? body.velocity.clone() : new Vec3();
    this.angularVelocity = body ? body.angularVelocity.clone() : new Vec3();
    this.onGround = false;
    this.wasOnGround = false;
    this.previousY = body ? body.position.y : 0;
  }
}

export class Chassis {
  type: ChassisType;
  rideHeight: number;
  surfaceImmunities: SurfaceType[];

  constructor(type: ChassisType, rideHeight: number, surfaceImmunities: SurfaceType[] = []) {
    this.type = type;
    this.rideHeight = rideHeight;
    this.surfaceImmunities = surfaceImmunities;
  }
}

export class Health {
  current: number;
  max: number;
  damageLevel: 0 | 1 | 2;
  invulnTimer: number;

  constructor(max: number) {
    this.current = max;
    this.max = max;
    this.damageLevel = 0;
    this.invulnTimer = 0;
  }
}

export class Weapon {
  front: FrontWeaponType;
  rear: RearWeaponType;
  boost: BoostType;
  frontAmmo: number;
  rearAmmo: number;
  boostAmmo: number;
  maxFrontAmmo: number;
  maxRearAmmo: number;
  maxBoostAmmo: number;
  frontCooldown = 0;
  rearCooldown = 0;
  boostCooldown = 0;

  constructor(
    front: FrontWeaponType,
    rear: RearWeaponType,
    boost: BoostType,
    frontAmmo: number,
    rearAmmo: number,
    boostAmmo: number,
  ) {
    this.front = front;
    this.rear = rear;
    this.boost = boost;
    this.frontAmmo = frontAmmo;
    this.rearAmmo = rearAmmo;
    this.boostAmmo = boostAmmo;
    this.maxFrontAmmo = frontAmmo;
    this.maxRearAmmo = rearAmmo;
    this.maxBoostAmmo = boostAmmo;
  }
}

export class CarStats {
  acceleration: number;
  maxSpeed: number;
  grip: number;
  jumpForce: number;
  bounce: number;
  mass: number;
  drivetrain: Drivetrain;

  constructor(stats: ComputedStats) {
    this.acceleration = stats.acceleration;
    this.maxSpeed = stats.maxSpeed;
    this.grip = stats.grip;
    this.jumpForce = stats.jumpForce;
    this.bounce = stats.bounce;
    this.mass = stats.mass;
    this.drivetrain = stats.drivetrain;
  }
}

export class SurfaceState {
  type: SurfaceType;
  grip: number;
  drag: number;
  effectTimer: number;
  /** Сила эффекта, унаследованная от пятна (0..1). */
  effectStrength: number;

  constructor(type: SurfaceType = 'asphalt', grip = 1, drag = 0) {
    this.type = type;
    this.grip = grip;
    this.drag = drag;
    this.effectTimer = 0;
    this.effectStrength = 0;
  }
}

export class CarState {
  phase: 'alive' | 'exploding' | 'respawning' | 'finished';
  respawnTimer: number;

  constructor() {
    this.phase = 'alive';
    this.respawnTimer = 0;
  }
}

export class Lap {
  currentLap = 1;
  totalLaps: number;
  nextCheckpoint = 0;
  lastCheckpoint = 0;
  lapTimes: number[] = [];
  lapStartTime = 0;
  progress = 0;
  finished = false;
  finishTime = 0;

  constructor(totalLaps: number) {
    this.totalLaps = totalLaps;
  }
}

export class RaceStanding {
  position: number;
  progress: number;
  lapsFinished: boolean;

  constructor(position = 0, progress = 0, lapsFinished = false) {
    this.position = position;
    this.progress = progress;
    this.lapsFinished = lapsFinished;
  }
}

export class AI {
  actor: AnyActorRef;
  targetWaypoint = 0;
  aggressionLevel: number;
  skill: number;
  personality: string;

  constructor(actor: AnyActorRef, aggressionLevel: number, skill: number, personality: string) {
    this.actor = actor;
    this.aggressionLevel = aggressionLevel;
    this.skill = skill;
    this.personality = personality;
  }
}

export class Render {
  object: object | null;
  visible = true;
  kind: string;

  constructor(kind: string, object: object | null = null) {
    this.kind = kind;
    this.object = object;
  }
}

export class VehicleInput {
  throttle = 0;
  brake = 0;
  steer = 0;
  fireFront = false;
  fireRear = false;
  fireBoost = false;
  /** Однократные нажатия (edge-trigger) для прыжков/мин. */
  fireFrontPressed = false;
  fireRearPressed = false;
  fireBoostPressed = false;
}

export class EngineState {
  nitroTimer = 0;
  spinOutTimer = 0;
  spinOutRate = 0;
  rampInside = false;
  jumpQueued = false;
  stuckTimer = 0;
  lastImpact = 0;
  padCooldown = 0;

  constructor() {
    this.nitroTimer = 0;
    this.spinOutTimer = 0;
    this.spinOutRate = 0;
    this.rampInside = false;
    this.jumpQueued = false;
    this.stuckTimer = 0;
    this.lastImpact = 0;
    this.padCooldown = 0;
  }
}

export class NameTag {
  value: string;
  isPlayer: boolean;

  constructor(value: string, isPlayer: boolean) {
    this.value = value;
    this.isPlayer = isPlayer;
  }
}

export class Projectile {
  kind: FrontWeaponType;
  damage: number;
  speed: number;
  lifetime: number;
  maxLifetime: number;
  ownerId: EntityId;
  aoeRadius: number;
  homing: boolean;
  targetId: EntityId | null;
  active = true;

  constructor(params: {
    kind: FrontWeaponType;
    damage: number;
    speed: number;
    lifetime: number;
    ownerId: EntityId;
    aoeRadius?: number;
    homing?: boolean;
  }) {
    this.kind = params.kind;
    this.damage = params.damage;
    this.speed = params.speed;
    this.lifetime = params.lifetime;
    this.maxLifetime = params.lifetime;
    this.ownerId = params.ownerId;
    this.aoeRadius = params.aoeRadius ?? 0;
    this.homing = params.homing ?? false;
    this.targetId = null;
  }
}

export class Mine {
  kind: 'spikeMine' | 'cassette';
  damage: number;
  radius: number;
  lifetime: number;
  ownerId: EntityId;
  armed = false;
  fuse: number;

  constructor(kind: 'spikeMine' | 'cassette', damage: number, radius: number, lifetime: number, ownerId: EntityId, fuse = 0) {
    this.kind = kind;
    this.damage = damage;
    this.radius = radius;
    this.lifetime = lifetime;
    this.ownerId = ownerId;
    this.fuse = fuse;
  }
}

export class Slick {
  radius: number;
  ownerId: EntityId;
  /** Возраст пятна (с). */
  age = 0;
  /** Время полной видимости до начала затухания (с). */
  lifetime: number;
  /** Длительность затухания в альфу (с). */
  fadeDuration: number;
  /** Текущая прозрачность 0..1. Она же — сила эффекта на машину. */
  opacity = 1;

  constructor(radius: number, ownerId: EntityId, lifetime: number, fadeDuration: number) {
    this.radius = radius;
    this.ownerId = ownerId;
    this.lifetime = lifetime;
    this.fadeDuration = fadeDuration;
  }
}

export class Pickup {
  value: number;
  active = true;

  constructor(value: number) {
    this.value = value;
  }
}

export class Debris {
  lifetime: number;

  constructor(lifetime = 3) {
    this.lifetime = lifetime;
  }
}

export class TriggerTag {
  type: 'boost' | 'ramp' | 'hazard' | 'pickup';
  index: number;

  constructor(type: 'boost' | 'ramp' | 'hazard' | 'pickup', index: number) {
    this.type = type;
    this.index = index;
  }
}
