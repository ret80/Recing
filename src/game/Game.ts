import { Body, Box, Quaternion, Vec3 } from 'cannon-es';
import { createActor } from 'xstate';
import {
  AI_CONFIG,
  AMMO,
  COMMENTARY,
  LIMITS,
  PHYSICS,
  PILOTS,
  RACE,
  RENDER,
  RESPAWN,
  SURFACES,
  TRACK_LAYOUTS,
  WEAPON_TUNING,
  WORLD,
  type PilotSpec,
  type SurfaceType,
  type TrackLayout,
  type ZoneId,
} from '../config/balance';
import { computeStats, getCar } from '../config/cars';
import { BOOSTS, FRONT_WEAPONS, REAR_WEAPONS } from '../config/weapons';
import {
  AI,
  CarState,
  CarStats,
  Chassis,
  Debris,
  EngineState,
  Health,
  Lap,
  Mine,
  NameTag,
  Physics,
  Pickup,
  Projectile,
  RaceStanding,
  Render,
  Slick,
  SurfaceState,
  Transform,
  VehicleInput,
  Weapon,
  World,
  type EntityId,
} from '../ecs/components';
import { PhysicsWorld, CHASSIS_REST_Y, forwardVector, rightVector, quaternionYaw } from '../physics/physicsWorld';
import { GameRenderer } from '../render/renderer';
import { ParticleSystem } from '../render/particles';
import {
  buildTrack,
  checkpointPosition,
  isLethalSurface,
  nextTrackLayout,
  startingGrid,
  surfaceAtHazard,
  waypointAt,
  type TrackDefinition,
  type Waypoint,
} from '../track/track';
import { GameStore, type HudCar, type RaceResultRow } from './GameStore';
import { InputSystem, type TouchState } from './InputSystem';
import { AudioSystem } from './AudioSystem';
import { CameraRig } from './CameraRig';
import { RaceScene } from './RaceScene';
import { spawnCar } from './CarFactory';
import { advanceLap, raceProgress } from './lapLogic';
import { applySeasonProgress, buyCar, buyUpgrade, placementReward, raceMoney } from './economy';
import {
  applyDrag,
  clampForwardSpeed,
  dampLateral,
  decomposeVelocity,
  idealCornerSpeed,
  integrateLongitudinal,
  rebuildVelocity,
  steeringYawRate,
  angleDifference,
} from './vehicleMath';
import { createVehicleState, stepVehicle, type VehicleState } from './vehicleController';
import { tickCooldown, canFire } from './weaponLogic';
import { getUpgrades, loadProfile, loadSettings, resetProfile, saveProfile, saveSettings, type GameSettings, type PlayerProfile } from './storage';
import type { GameActor, GameScreen } from './gameMachine';
import { gameMachine } from './gameMachine';

const AI_COLORS = [0x3e6fd9, 0x4c9b4c, 0x8b4fd9];
const PLAYER_COLOR = 0xd9562a;
const PICKUP_COLOR = 0xffd166;

type AIProfile = { name: string; carId: string; aggression: number; skill: number; personality: string };

export function isTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  return 'ontouchstart' in window;
}

export class Game {
  readonly store: GameStore;
  private readonly renderer: GameRenderer;
  private readonly particles: ParticleSystem;
  private physics: PhysicsWorld;
  private scene: RaceScene;
  private track: TrackDefinition;
  private readonly world = new World();
  private readonly actor: GameActor;
  private readonly input = new InputSystem();
  private readonly audio = new AudioSystem();
  private readonly cameraRig: CameraRig;
  private readonly visuals = new Map<EntityId, import('ogl').Transform>();
  private readonly vehicleStates = new Map<EntityId, VehicleState>();
  private readonly bodyToEntity = new Map<Body, EntityId>();
  private carIds: EntityId[] = [];
  private playerId = -1;
  private screen: GameScreen = 'menu';
  private profile: PlayerProfile;
  private settings: GameSettings;
  private introTimer = 0;
  private countdownTimer = 0;
  private raceTime = 0;
  private raceFinished = true;
  private hudTimer = 0;
  private finishOrder: EntityId[] = [];
  private firstFinishTime: number | null = null;
  private trophies = new Set<string>();
  private dominance = new Set<string>();
  private scrapCollected = 0;
  private lastResults: RaceResultRow[] | null = null;
  private seasonFailed = false;
  private dnf = false;
  private disposed = false;
  private fps = 60;
  private frameAccum = 0;
  private frameCount = 0;
  private lastPlayerPosition = 4;
  private commentaryCooldown = 0;
  private subtitleTimer = 0;

  constructor(canvas: HTMLCanvasElement, store: GameStore) {
    this.store = store;
    this.profile = loadProfile();
    this.settings = loadSettings();
    this.renderer = new GameRenderer(canvas);
    this.particles = new ParticleSystem(this.renderer, LIMITS.particles);
    this.particles.attach(this.renderer.scene);
    this.particles.density = this.settings.particles === 'low' ? RENDER.lowParticleDensity : 1;
    this.renderer.setQuality(this.settings.quality);
    this.physics = new PhysicsWorld();
    this.scene = new RaceScene(this.renderer, this.physics);
    this.cameraRig = new CameraRig(this.renderer);
    this.cameraRig.cameraShakeEnabled = this.settings.cameraShake;
    this.track = buildTrack(this.profile.zone, this.profile.track);
    this.audio.setVolume(this.settings.volume);
    this.audio.onSubtitle = (text) => {
      this.store.set({ subtitle: text });
      this.subtitleTimer = COMMENTARY.subtitleSec;
    };
    this.input.onPause = () => this.togglePause();

    this.actor = createActor(gameMachine);
    this.actor.subscribe((snapshot) => {
      const value = typeof snapshot.value === 'string' ? snapshot.value : 'menu';
      const screen = value as GameScreen;
      this.screen = screen;
      this.store.set({ screen, paused: screen === 'paused' });
      if (screen === 'results') this.store.set({ results: this.lastResults });
      if (screen === 'racing') this.audio.startMusic();
    });
    this.actor.start();

    this.world.onDestroy((id) => {
      const object = this.visuals.get(id);
      if (object) {
        this.renderer.remove(object);
        this.renderer.carWheels.delete(object);
        this.renderer.carWheelPivots.delete(object);
        this.renderer.carSteerPivots.delete(object);
        this.visuals.delete(id);
      }
    });

    window.addEventListener('pointerdown', this.unlockAudio, { once: true });
    window.addEventListener('keydown', this.unlockAudio, { once: true });

    this.store.set({
      profile: this.profile,
      money: this.profile.money,
      settings: this.settings,
      touchControls: isTouchCapable(),
    });
    this.buildRace(this.profile.zone);
    this.syncHud();
  }

  private unlockAudio = (): void => {
    this.audio.unlock();
    this.audio.startMusic();
  };

  // ---------------------------------------------------------------- race setup

  startRace(zone: ZoneId): void {
    this.audio.unlock();
    this.profile = { ...this.profile, zone };
    saveProfile(this.profile);
    this.buildRace(zone);
    this.introTimer = 0;
    this.countdownTimer = RACE.countdownSec;
    this.raceTime = 0;
    this.raceFinished = false;
    this.lastPlayerPosition = RACE.maxCars;
    this.commentaryCooldown = 0;
    this.subtitleTimer = 0;
    this.store.set({
      zoneId: zone,
      zoneName: this.track.zone.name,
      track: this.track.layout,
      results: null,
      seasonFailed: false,
      dnf: false,
      subtitle: '',
    });
    if (this.screen === 'results') {
      this.actor.send({ type: 'NEXT_RACE' });
    } else {
      this.actor.send({ type: 'START_RACE', zone });
    }
  }

  restartRace(): void {
    const zone = this.track.zone.id;
    if (this.screen === 'paused') this.actor.send({ type: 'QUIT' });
    this.startRace(zone);
  }

  /**
   * «Следующая трасса»: переключает конфигурацию (ровная ↔ с перепадами
   * высот) и запускает новый заезд в текущей зоне. Так после финиша игрок
   * попадает на другую трассу, а не едет тот же круг заново.
   */
  nextRace(): void {
    const track = nextTrackLayout(this.profile.track);
    if (track !== this.profile.track) {
      this.profile = { ...this.profile, track };
      saveProfile(this.profile);
      this.store.setProfile(this.profile);
    }
    // Зона могла открыться по итогам сезона — берём актуальную из профиля.
    this.startRace(this.profile.zone);
  }

  private buildRace(zone: ZoneId): void {
    for (const id of [...this.world.entities]) this.world.destroyEntity(id);
    this.bodyToEntity.clear();
    this.vehicleStates.clear();
    this.carIds = [];
    this.playerId = -1;
    this.scene.clear();
    this.particles.clear();
    this.physics.dispose();
    this.physics = new PhysicsWorld();
    this.track = buildTrack(zone, this.profile.track);
    this.scene = new RaceScene(this.renderer, this.physics);
    this.scene.build(this.track);

    this.finishOrder = [];
    this.firstFinishTime = null;
    this.trophies = new Set();
    this.dominance = new Set();
    this.scrapCollected = 0;
    this.lastResults = null;
    this.seasonFailed = false;
    this.dnf = false;
    this.raceFinished = false;

    this.spawnCars();
    this.spawnPickups();
    this.store.set({ zoneId: zone, zoneName: this.track.zone.name, track: this.track.layout });
  }

  private playerPilot(): PilotSpec {
    return PILOTS.find((p) => p.id === this.profile.pilot) ?? (PILOTS[4] as PilotSpec);
  }

  private spawnCars(): void {
    const grid = startingGrid(this.track);
    const car = getCar(this.profile.car);
    const stats = computeStats(car, getUpgrades(this.profile, this.profile.car), this.playerPilot());
    const playerSpawn = grid[0];
    if (!playerSpawn) throw new Error('No starting grid');
    const spawnedPlayer = spawnCar({
      world: this.world,
      physics: this.physics,
      renderer: this.renderer,
      name: this.playerPilot().name,
      isPlayer: true,
      car,
      stats,
      position: playerSpawn.position,
      yaw: playerSpawn.yaw,
      ammoLevel: getUpgrades(this.profile, this.profile.car).weapons,
      mainColor: PLAYER_COLOR,
      accentColor: 0xffd08a,
    });
    this.carIds.push(spawnedPlayer.id);
    this.playerId = spawnedPlayer.id;
    this.registerCarBody(spawnedPlayer.id, spawnedPlayer.body);
    this.registerVisual(spawnedPlayer.id, spawnedPlayer.visual);

    const zone = this.track.zone;
    const bossCarId = zone.id >= 5 ? 'hover-rig' : zone.id === 4 ? 'aero-collector' : 'rust-interceptor';
    const profiles: AIProfile[] = [
      { name: zone.boss, carId: bossCarId, aggression: zone.id >= 4 ? 0.9 : 0.7, skill: 0.93, personality: 'boss' },
      { name: 'Шрак', carId: 'scrap-buggy', aggression: 0.2, skill: 0.82, personality: 'meat' },
      { name: 'Осколок', carId: 'rust-interceptor', aggression: 0.2, skill: 0.86, personality: 'meat' },
    ];

    profiles.forEach((profile, index) => {
      const gridSpot = grid[index + 1];
      if (!gridSpot) return;
      const aiCar = getCar(profile.carId);
      const pilot = PILOTS[(index + 1) % PILOTS.length] as PilotSpec;
      const upgrades = { engine: 1 as const, body: 0 as const, tires: 1 as const, suspension: 0 as const, weapons: 1 as const };
      const aiStats = computeStats(aiCar, upgrades, pilot);
      const skillFactor = 0.82 + profile.skill * 0.18;
      aiStats.maxSpeed *= skillFactor;
      aiStats.acceleration *= skillFactor;
      const spawned = spawnCar({
        world: this.world,
        physics: this.physics,
        renderer: this.renderer,
        name: profile.name,
        isPlayer: false,
        car: aiCar,
        stats: aiStats,
        position: gridSpot.position,
        yaw: gridSpot.yaw,
        ammoLevel: 1,
        mainColor: AI_COLORS[index] ?? 0x888888,
        accentColor: zone.palette.accent,
      });
      this.world.add(spawned.id, new AI(profile.aggression, profile.skill, profile.personality));
      this.carIds.push(spawned.id);
      this.registerCarBody(spawned.id, spawned.body);
      this.registerVisual(spawned.id, spawned.visual);
    });
  }

  private registerCarBody(id: EntityId, body: Body): void {
    this.bodyToEntity.set(body, id);
    PhysicsWorld.syncInterpolation(body);
    body.addEventListener('collide', (event: { body: Body }) => {
      this.onCarCollide(id, event.body);
      if (event.body.material === this.physics.wallMaterial) {
        const engine = this.world.get(id, EngineState);
        if (engine) engine.lastWallHit = this.raceTime;
      }
    });
  }

  private registerVisual(id: EntityId, object: import('ogl').Transform): void {
    this.visuals.set(id, object);
  }

  private spawnPickups(): void {
    for (const spot of this.track.pickups) {
      const id = this.world.createEntity();
      this.world.add(id, new Transform(spot.position.clone()));
      this.world.add(id, new Pickup(1000));
      const visual = this.renderer.box(0.8, 0.8, 0.8, PICKUP_COLOR, { emissive: 0.8 });
      visual.position.set(spot.position.x, spot.position.y, spot.position.z);
      this.renderer.add(visual);
      this.world.add(id, new Render('pickup', visual));
      this.registerVisual(id, visual);
    }
  }

  // ------------------------------------------------------------------- update

  update(dt: number): void {
    if (this.disposed) return;
    this.cameraRig.updateTweens();
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) {
        this.subtitleTimer = 0;
        this.store.set({ subtitle: '' });
      }
    }
    if (this.commentaryCooldown > 0) this.commentaryCooldown = Math.max(0, this.commentaryCooldown - dt);
    if (this.screen === 'trackIntro') {
      this.introTimer += dt;
      if (this.introTimer >= RACE.trackIntroSec) this.actor.send({ type: 'INTRO_FINISHED' });
    } else if (this.screen === 'countdown') {
      const previous = Math.ceil(this.countdownTimer);
      this.countdownTimer -= dt;
      const next = Math.ceil(this.countdownTimer);
      if (next !== previous) this.audio.countdown(next <= 0);
      this.countdownTimer = Math.max(0, this.countdownTimer);
      if (this.countdownTimer <= 0) {
        this.raceTime = 0;
        for (const id of this.carIds) {
          const lap = this.world.get(id, Lap);
          if (lap) lap.lapStartTime = 0;
        }
        this.actor.send({ type: 'COUNTDOWN_FINISHED' });
        this.audio.say('Двигатели ревут, кровь кипит!');
      }
    } else if (this.screen === 'racing') {
      this.raceTime += dt;
      this.simulate(dt);
      this.checkRaceEnd();
    }

    if (this.screen !== 'paused') this.particles.update(dt);
    this.updateAudio();
    this.hudTimer += dt;
    if (this.hudTimer >= 0.1) {
      this.hudTimer = 0;
      this.syncHud();
    }
  }

  private updateAudio(): void {
    if (this.playerId < 0) return;
    const physics = this.world.get(this.playerId, Physics);
    const stats = this.world.get(this.playerId, CarStats);
    const input = this.world.get(this.playerId, VehicleInput);
    if (!physics?.body || !stats || !input) return;
    const speed = physics.body.velocity.length();
    const active = this.screen === 'racing';
    this.audio.updateEngine(Math.min(1, speed / Math.max(1, stats.maxSpeed)), input.throttle, active);
  }

  private simulate(dt: number): void {
    for (const id of this.carIds) {
      const ai = this.world.get(id, AI);
      if (ai) this.updateAI(id, dt);
      else if (id === this.playerId) {
        const input = this.world.get(id, VehicleInput);
        if (input) this.input.update(input);
      }
    }

    for (const id of this.carIds) this.vehiclePreStep(id, dt);
    this.physics.step(dt);
    for (const id of this.carIds) {
      this.updateGround(id);
      this.vehiclePostStep(id, dt);
      this.updateWheelVisuals(id);
      this.syncCarTransform(id);
      this.updateSurface(id, dt);
      this.updateRamps(id);
      this.updateBoostPads(id);
      this.checkCheckpoints(id);
      this.updatePickups(id);
      this.updateWeapons(id, dt);
      this.updateRespawn(id, dt);
    }
    this.updateProjectiles(dt);
    this.updateMines(dt);
    this.updateSlicks(dt);
    this.updateDebris(dt);
    this.updatePositions();
  }

  // ------------------------------------------------------------- car movement

  /**
   * Визуально поворачивает передние колёса и опускает/поднимает их
   * по ходу подвески. Состояние колёс приходит из vehicleController.
   */
  private updateWheelVisuals(id: EntityId): void {
    const visual = this.visuals.get(id);
    const input = this.world.get(id, VehicleInput);
    const carState = this.world.get(id, CarState);
    const chassis = this.world.get(id, Chassis);
    if (!visual || !input || !carState || chassis?.type !== 'wheeled') return;
    const state = this.vehicleStates.get(id);
    const steerPivots = this.renderer.carSteerPivots.get(visual);
    if (steerPivots) {
      const angle = carState.phase === 'alive' ? state?.steerAngle ?? 0 : 0;
      for (const pivot of steerPivots) pivot.rotation.y = angle;
    }
    const pivots = this.renderer.carWheelPivots.get(visual);
    if (!pivots || !state) return;
    for (let index = 0; index < pivots.length; index += 1) {
      const wheel = state.wheels[index];
      const pivot = pivots[index];
      if (!wheel || !pivot) continue;
      pivot.position.y = PHYSICS.wheels.attachY - wheel.suspensionLength;
    }
  }

  /**
   * Управление угловой скоростью до шага физики.
   * Руление — велосипедная модель: ω = v · tan(δ) / база, ограниченная сцеплением.
   * Поэтому на малой скорости машина не «разворачивается на месте».
   */
  private vehiclePreStep(id: EntityId, dt: number): void {
    const carState = this.world.get(id, CarState);
    const physics = this.world.get(id, Physics);
    const stats = this.world.get(id, CarStats);
    const chassis = this.world.get(id, Chassis);
    const input = this.world.get(id, VehicleInput);
    const engine = this.world.get(id, EngineState);
    const surface = this.world.get(id, SurfaceState);
    if (!carState || !physics?.body || !stats || !chassis || !input || !engine || !surface) return;
    if (carState.phase !== 'alive') {
      input.throttle = 0;
      input.brake = 0;
      input.steer = 0;
      return;
    }
    const body = physics.body;
    body.wakeUp();
    const stabilize = Math.exp(-PHYSICS.rollStabilization * dt);

    if (chassis.type === 'wheeled') {
      const state = this.vehicleStates.get(id) ?? createVehicleState();
      this.vehicleStates.set(id, state);
      const spinOut = engine.spinOutTimer > 0;
      stepVehicle(
        state,
        body,
        this.physics,
        {
          throttle: input.throttle,
          brake: input.brake,
          steer: input.steer,
          acceleration: stats.acceleration,
          maxSpeed: stats.maxSpeed,
          mass: stats.mass,
          grip: stats.grip * (spinOut ? 0.25 : 1),
          surfaceGrip: surface.grip,
          drivetrain: stats.drivetrain,
          nitroMult: engine.nitroTimer > 0 ? WEAPON_TUNING.nitroAccelMult : 1,
          dt,
        },
        (candidate) => this.bodyToEntity.has(candidate),
      );
      if (spinOut) body.angularVelocity.y = engine.spinOutRate;
      body.angularVelocity.x *= stabilize;
      body.angularVelocity.z *= stabilize;
      return;
    }

    const forward = forwardVector(body.quaternion);
    forward.y = 0;
    if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    const speed = body.velocity.dot(forward);
    const grounded = physics.onGround;

    if (engine.spinOutTimer > 0) {
      body.angularVelocity.y = engine.spinOutRate;
    } else {
      const target = steeringYawRate(input.steer, speed, stats.grip, surface.grip) * (grounded ? 1 : 0.4);
      // Сглаживание: угловая скорость не перескакивает за один кадр.
      const blend = 1 - Math.exp(-PHYSICS.steerSmoothing * dt);
      body.angularVelocity.y += (target - body.angularVelocity.y) * blend;
    }
    body.angularVelocity.x *= stabilize;
    body.angularVelocity.z *= stabilize;
  }

  /**
   * Продольная динамика и сцепление после шага физики.
   * Вся тяга/торможение/накат считаются в одном месте, поэтому скорость
   * меняется плавно и без дёрганья.
   */
  private vehiclePostStep(id: EntityId, dt: number): void {
    const carState = this.world.get(id, CarState);
    const physics = this.world.get(id, Physics);
    const stats = this.world.get(id, CarStats);
    const chassis = this.world.get(id, Chassis);
    const surface = this.world.get(id, SurfaceState);
    const engine = this.world.get(id, EngineState);
    const input = this.world.get(id, VehicleInput);
    if (!carState || !physics?.body || !stats || !chassis || !surface || !engine || !input) return;
    if (carState.phase !== 'alive') return;
    const body = physics.body;

    if (chassis.type === 'hover') {
      const ground = this.groundHeight(body);
      if (ground !== null) {
        body.position.y = ground + 0.75 + chassis.rideHeight;
        body.velocity.y = 0;
      }
    }

    const forward = forwardVector(body.quaternion);
    forward.y = 0;
    if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();

    if (chassis.type === 'wheeled') {
      const forwardSpeed = body.velocity.dot(forward);
      const nitroActive = engine.nitroTimer > 0;
      const speedMult = nitroActive ? WEAPON_TUNING.nitroSpeedMult : 1;
      const maxForward = stats.maxSpeed * speedMult;
      if (forwardSpeed > maxForward) body.velocity.addScaledVector(maxForward - forwardSpeed, forward);
      const minForward = -stats.maxSpeed * PHYSICS.maxReverseFactor;
      if (forwardSpeed < minForward) body.velocity.addScaledVector(minForward - forwardSpeed, forward);
      if (surface.drag > 0) {
        const dragFactor = Math.exp(-surface.drag * PHYSICS.dragRate * dt);
        body.velocity.x *= dragFactor;
        body.velocity.z *= dragFactor;
      }
      if (input.throttle <= 0 && input.brake <= 0 && Math.abs(forwardSpeed) < PHYSICS.wheels.stopSpeed) {
        body.velocity.x *= 0.85;
        body.velocity.z *= 0.85;
      }
      body.velocity.y = Math.max(-PHYSICS.maxVerticalSpeed, Math.min(PHYSICS.maxVerticalSpeed, body.velocity.y));
      this.alignToGround(id, dt);
      return;
    }

    const right = rightVector(body.quaternion);
    right.y = 0;
    if (right.lengthSquared() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const { forwardSpeed, lateralSpeed } = decomposeVelocity(body.velocity, forward, right);
    const nitroActive = engine.nitroTimer > 0;

    let newForward = integrateLongitudinal({
      speed: forwardSpeed,
      throttle: input.throttle,
      brake: input.brake,
      acceleration: stats.acceleration,
      maxSpeed: stats.maxSpeed,
      dt,
      slopePitch: physics.groundPitch,
      nitroMult: nitroActive ? WEAPON_TUNING.nitroAccelMult : 1,
    });
    newForward = applyDrag(newForward, surface.drag, dt);
    const speedMult = nitroActive ? WEAPON_TUNING.nitroSpeedMult : 1;
    newForward = clampForwardSpeed(newForward, stats.maxSpeed, speedMult);
    const lateral = dampLateral(lateralSpeed, stats.grip, surface.grip, dt);
    const vertical = Math.max(-PHYSICS.maxVerticalSpeed, Math.min(PHYSICS.maxVerticalSpeed, body.velocity.y));
    body.velocity.copy(rebuildVelocity(newForward, lateral, forward, right, vertical));

    this.alignToGround(id, dt);
  }

  /**
   * Плавно ставит кузов по нормали рельефа: на горках машина едет
   * по поверхности, а не висит горизонтально.
   */
  private alignToGround(id: EntityId, dt: number): void {
    const physics = this.world.get(id, Physics);
    const chassis = this.world.get(id, Chassis);
    const body = physics?.body;
    if (!body || chassis?.type === 'hover') return;
    if (!physics.onGround) return;

    const pitch = physics.groundPitch;
    const roll = physics.groundRoll;

    const yaw = quaternionYaw(body.quaternion);
    const yawQ = new Quaternion().setFromEuler(0, yaw, 0);
    const cp = Math.cos(pitch);
    const cr = Math.cos(roll);
    const local = new Vec3(-Math.sin(roll), cp * cr, -Math.sin(pitch) * cr);
    local.normalize();
    const normal = yawQ.vmult(local);
    if (normal.y < 0.4) return;

    const tilt = new Quaternion().setFromVectors(new Vec3(0, 1, 0), normal);
    const target = tilt.mult(yawQ);
    const alpha = 1 - Math.exp(-PHYSICS.groundAlignRate * dt);
    body.quaternion.slerp(target, alpha, body.quaternion);
    body.quaternion.normalize();
  }

  private syncCarTransform(id: EntityId): void {
    const transform = this.world.get(id, Transform);
    const physics = this.world.get(id, Physics);
    if (!transform || !physics?.body) return;
    // Интерполированное положение: физика идёт фиксированным шагом,
    // без этого картинка дёргается на мониторах с частотой не 60 Гц.
    transform.position.copy(physics.body.interpolatedPosition);
    transform.rotation.copy(physics.body.interpolatedQuaternion);
  }

  private groundHeight(body: Body): number | null {
    const hit = this.physics.raycast(
      new Vec3(body.position.x, body.position.y, body.position.z),
      new Vec3(body.position.x, body.position.y - 4, body.position.z),
      body,
    );
    if (!hit || !hit.body) return null;
    if (this.bodyToEntity.has(hit.body)) return null;
    return hit.point.y;
  }

  private updateGround(id: EntityId): void {
    const physics = this.world.get(id, Physics);
    if (!physics?.body) return;
    const body = physics.body;
    physics.previousY = body.position.y;
    physics.wasOnGround = physics.onGround;
    const hit = this.physics.raycast(
      new Vec3(body.position.x, body.position.y, body.position.z),
      new Vec3(body.position.x, body.position.y - 1.35, body.position.z),
      body,
    );
    const valid = hit !== null && hit.body !== null && !this.bodyToEntity.has(hit.body);
    physics.onGround = valid && body.velocity.y <= 2.5;
    if (this.world.get(id, Chassis)?.type === 'hover') physics.onGround = valid;

    // Уклон рельефа по четырём пробам вокруг центра машины.
    if (valid) {
      const forward = forwardVector(body.quaternion);
      forward.y = 0;
      if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);
      forward.normalize();
      const right = new Vec3(forward.z, 0, -forward.x);
      const probe = (along: number, side: number): number | null => {
        const x = body.position.x + forward.x * along + right.x * side;
        const z = body.position.z + forward.z * along + right.z * side;
        const sample = this.physics.raycast(
          new Vec3(x, body.position.y + 1.4, z),
          new Vec3(x, body.position.y - 2.6, z),
          body,
        );
        if (!sample || !sample.body || this.bodyToEntity.has(sample.body)) return null;
        return sample.point.y;
      };
      const halfWheelbase = 1.4;
      const halfTrack = 1.0;
      const front = probe(halfWheelbase, 0);
      const rear = probe(-halfWheelbase, 0);
      const rightSide = probe(0, halfTrack);
      const leftSide = probe(0, -halfTrack);
      const blend = 1 - Math.exp(-12 * WORLD.fixedDt);
      if (front !== null && rear !== null) {
        const target = Math.atan2(front - rear, halfWheelbase * 2);
        physics.groundPitch += (target - physics.groundPitch) * blend;
      } else {
        physics.groundPitch += (0 - physics.groundPitch) * blend;
      }
      if (rightSide !== null && leftSide !== null) {
        const target = Math.atan2(rightSide - leftSide, halfTrack * 2);
        physics.groundRoll += (target - physics.groundRoll) * blend;
      } else {
        physics.groundRoll += (0 - physics.groundRoll) * blend;
      }
    } else {
      physics.groundPitch *= 0.9;
      physics.groundRoll *= 0.9;
    }
  }

  private updateSurface(id: EntityId, dt: number): void {
    const surface = this.world.get(id, SurfaceState);
    const chassis = this.world.get(id, Chassis);
    const carState = this.world.get(id, CarState);
    const physics = this.world.get(id, Physics);
    const engine = this.world.get(id, EngineState);
    if (!surface || !chassis || !carState || !physics?.body || !engine) return;
    if (carState.phase !== 'alive') return;
    const position = physics.body.position;
    let type: SurfaceType = 'asphalt';
    let oilStrength = 0;
    const hazard = surfaceAtHazard(this.track, position);
    if (hazard) {
      type = hazard;
      if (hazard === 'oil') oilStrength = 1;
    }

    for (const slickId of this.world.query(Slick)) {
      const slick = this.world.get(slickId, Slick);
      const transform = this.world.get(slickId, Transform);
      if (!slick || !transform || slick.opacity <= 0) continue;
      const dx = transform.position.x - position.x;
      const dz = transform.position.z - position.z;
      if (dx * dx + dz * dz <= slick.radius * slick.radius) {
        type = 'oil';
        oilStrength = Math.max(oilStrength, slick.opacity);
      }
    }

    const immune = chassis.surfaceImmunities.includes(type);
    if (immune) {
      type = 'asphalt';
    } else if (isLethalSurface(type)) {
      this.explodeCar(id, 'hazard');
      return;
    }

    const spec = SURFACES[type];
    if (type === 'acidPuddle' && surface.type !== 'acidPuddle') {
      engine.spinOutTimer = spec.spinOutSec ?? 1.5;
      engine.spinOutRate = (Math.random() > 0.5 ? 1 : -1) * (spec.spinOut ?? Math.PI / 2);
    }
    if (type === 'oil') {
      surface.effectTimer = WEAPON_TUNING.slickEffectAfterExitSec;
      surface.effectStrength = oilStrength;
    } else if (surface.type === 'oil' && surface.effectTimer > 0) {
      type = 'oil';
      surface.effectTimer = Math.max(0, surface.effectTimer - dt);
    } else {
      surface.effectTimer = 0;
      surface.effectStrength = 0;
    }

    const effective = SURFACES[type];
    // Чем прозрачнее пятно, тем слабее эффект: сцепление и сопротивление
    // интерполируются между асфальтом и полной нефтью.
    const strength = type === 'oil' ? surface.effectStrength : 1;
    const base = SURFACES.asphalt;
    surface.type = type;
    surface.grip = immune ? 1 : base.grip + (effective.grip - base.grip) * strength;
    surface.drag = immune ? 0 : base.drag + (effective.drag - base.drag) * strength;
    engine.spinOutTimer = Math.max(0, engine.spinOutTimer - dt);
    engine.nitroTimer = Math.max(0, engine.nitroTimer - dt);
    engine.padCooldown = Math.max(0, engine.padCooldown - dt);
  }

  // ------------------------------------------------------------------ triggers

  private updateRamps(id: EntityId): void {
    const carState = this.world.get(id, CarState);
    const physics = this.world.get(id, Physics);
    const engine = this.world.get(id, EngineState);
    const stats = this.world.get(id, CarStats);
    if (!carState || !physics?.body || !engine || !stats || carState.phase !== 'alive') return;
    let inside = false;
    for (const ramp of this.track.ramps) {
      const dx = physics.body.position.x - ramp.center.x;
      const dz = physics.body.position.z - ramp.center.z;
      const forwardDist = dx * ramp.tangent.x + dz * ramp.tangent.z;
      const sideDist = dx * -ramp.tangent.z + dz * ramp.tangent.x;
      if (Math.abs(forwardDist) <= ramp.halfLength && Math.abs(sideDist) <= ramp.halfWidth) {
        inside = true;
        if (!engine.rampInside && physics.onGround && physics.body.velocity.y < 2) {
          physics.body.velocity.y = stats.jumpForce;
          this.particles.burst(physics.body.position.clone(), 'dust', 24, 3, 0.6, 0.4);
          if (id === this.playerId) this.cameraRig.addShake(0.35);
        }
        break;
      }
    }
    engine.rampInside = inside;
  }

  private updateBoostPads(id: EntityId): void {
    const carState = this.world.get(id, CarState);
    const physics = this.world.get(id, Physics);
    const engine = this.world.get(id, EngineState);
    if (!carState || !physics?.body || !engine || carState.phase !== 'alive') return;
    if (engine.padCooldown > 0) return;
    for (const pad of this.track.boostPads) {
      const dx = physics.body.position.x - pad.center.x;
      const dz = physics.body.position.z - pad.center.z;
      if (dx * dx + dz * dz > pad.radius * pad.radius) continue;
      physics.body.velocity.x += pad.tangent.x * WEAPON_TUNING.boostPadImpulse;
      physics.body.velocity.z += pad.tangent.z * WEAPON_TUNING.boostPadImpulse;
      engine.padCooldown = 1.2;
      this.particles.burst(physics.body.position.clone(), 'nitro', 18, 2, 0.5, 0.3);
      break;
    }
  }

  private checkCheckpoints(id: EntityId): void {
    const carState = this.world.get(id, CarState);
    const physics = this.world.get(id, Physics);
    const lap = this.world.get(id, Lap);
    if (!carState || !physics?.body || !lap || carState.phase !== 'alive' || lap.finished) return;
    const next = lap.nextCheckpoint;
    const wp = checkpointPosition(this.track, next);
    const dx = physics.body.position.x - wp.position.x;
    const dz = physics.body.position.z - wp.position.z;
    const radius = Math.max(RACE.checkpointRadius, this.track.width / 2 + 2);
    if (dx * dx + dz * dz > radius * radius) return;
    const event = advanceLap(lap, next, this.raceTime);
    if (event === 'none') return;
    // Боезапас НЕ восполняется на чекпоинтах: патроны, мины, масло и буст
    // кончаются, и стрельба не превращается в бесконечную очередь.
    if (event === 'lap' || event === 'finish') {
      this.resetPickups();
      if (id === this.playerId) {
        this.audio.say(event === 'finish' ? 'Финиш! Ты это сделал!' : `Круг ${lap.currentLap}! Держись!`);
        this.trackDominance(id, lap);
      }
    }
    if (event === 'finish') {
      this.finishOrder.push(id);
      lap.finishTime = this.raceTime;
      carState.phase = 'finished';
      if (this.firstFinishTime === null) this.firstFinishTime = this.raceTime;
      if (id === this.playerId) this.audio.say('Финишная черта! Отличная гонка!');
      const input = this.world.get(id, VehicleInput);
      if (input) {
        input.throttle = 0;
        input.brake = 1;
        input.fireFront = false;
        input.fireRear = false;
        input.fireBoost = false;
      }
    }
  }

  private trackDominance(playerId: EntityId, playerLap: Lap): void {
    void playerId;
    for (const id of this.carIds) {
      if (id === this.playerId) continue;
      const lap = this.world.get(id, Lap);
      const name = this.world.get(id, NameTag);
      if (lap && name && lap.currentLap < playerLap.currentLap) this.dominance.add(name.value);
    }
  }

  private resetPickups(): void {
    for (const id of this.world.query(Pickup)) {
      const pickup = this.world.get(id, Pickup);
      const render = this.world.get(id, Render);
      if (pickup) pickup.active = true;
      if (render) render.visible = true;
    }
  }

  private updatePickups(id: EntityId): void {
    if (id !== this.playerId) return;
    const carState = this.world.get(id, CarState);
    const physics = this.world.get(id, Physics);
    if (!carState || !physics?.body || carState.phase !== 'alive') return;
    for (const pickupId of this.world.query(Pickup)) {
      const pickup = this.world.get(pickupId, Pickup);
      const transform = this.world.get(pickupId, Transform);
      const render = this.world.get(pickupId, Render);
      if (!pickup?.active || !transform) continue;
      const dx = physics.body.position.x - transform.position.x;
      const dz = physics.body.position.z - transform.position.z;
      if (dx * dx + dz * dz < 3.2 * 3.2) {
        pickup.active = false;
        if (render) render.visible = false;
        this.scrapCollected += 1;
        this.resupplyWeapons(id);
        this.audio.pickup();
        this.particles.burst(transform.position.clone(), 'spark', 16, 2.5, 0.6, 0.22);
      }
    }
  }

  // ------------------------------------------------------------------ weapons

  private updateWeapons(id: EntityId, dt: number): void {
    const weapon = this.world.get(id, Weapon);
    const input = this.world.get(id, VehicleInput);
    const physics = this.world.get(id, Physics);
    const carState = this.world.get(id, CarState);
    if (!weapon || !input || !physics?.body || !carState) return;
    weapon.frontCooldown = tickCooldown(weapon.frontCooldown, dt);
    weapon.rearCooldown = tickCooldown(weapon.rearCooldown, dt);
    weapon.boostCooldown = tickCooldown(weapon.boostCooldown, dt);
    if (carState.phase !== 'alive') return;

    if (input.fireFront && canFire(weapon.frontAmmo, weapon.frontCooldown)) {
      const spec = FRONT_WEAPONS[weapon.front];
      this.spawnProjectile(id, spec.id);
      weapon.frontAmmo -= 1;
      weapon.frontCooldown = spec.cooldown;
      this.audio.shoot(spec.id === 'scrapVulcan' ? 'front' : 'rocket');
    }
    if (input.fireRearPressed && canFire(weapon.rearAmmo, weapon.rearCooldown)) {
      const spec = REAR_WEAPONS[weapon.rear];
      this.spawnRearWeapon(id, spec.id);
      weapon.rearAmmo -= 1;
      weapon.rearCooldown = spec.cooldown;
      this.audio.shoot('rear');
    }
    if (input.fireBoostPressed && canFire(weapon.boostAmmo, weapon.boostCooldown)) {
      this.activateBoost(id);
    }

    input.fireFrontPressed = false;
    input.fireRearPressed = false;
    input.fireBoostPressed = false;
  }

  private spawnProjectile(ownerId: EntityId, kind: keyof typeof FRONT_WEAPONS): void {
    const ownerPhysics = this.world.get(ownerId, Physics);
    if (!ownerPhysics?.body) return;
    const spec = FRONT_WEAPONS[kind];
    const body = ownerPhysics.body;
    const forward = forwardVector(body.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = rightVector(body.quaternion);
    const offsets = spec.twin ? [-0.65, 0.65] : [0];
    const activeProjectiles = this.world.query(Projectile);
    if (activeProjectiles.length >= LIMITS.projectiles) {
      const oldest = activeProjectiles[0];
      if (oldest !== undefined) this.world.destroyEntity(oldest);
    }
    for (const offset of offsets) {
      const id = this.world.createEntity();
      const position = body.position
        .clone()
        .vadd(forward.scale(2.2))
        .vadd(right.scale(offset))
        .vadd(new Vec3(0, 0.15, 0));
      const velocity = forward.scale(spec.speed).vadd(body.velocity.scale(0.35));
      this.world.add(id, new Transform(position.clone()));
      const physics = new Physics(null);
      physics.velocity.copy(velocity);
      this.world.add(id, physics);
      const target = spec.homing ? this.findEnemyInCone(ownerId, AI_CONFIG.raycastRange, AI_CONFIG.coneDeg) : null;
      this.world.add(
        id,
        new Projectile({
          kind,
          damage: spec.damage,
          speed: spec.speed,
          lifetime: spec.lifetime,
          ownerId,
          aoeRadius: spec.aoeRadius,
          homing: spec.homing,
        }),
      );
      const projectile = this.world.get(id, Projectile);
      if (projectile) projectile.targetId = target;
      const color = spec.color;
      const visual = spec.id === 'scrapVulcan'
        ? this.renderer.box(0.12, 0.12, 0.9, color, { emissive: 0.9 })
        : this.renderer.sphere(spec.id === 'rockets' ? 0.28 : 0.32, color, { emissive: 0.8 });
      visual.position.set(position.x, position.y, position.z);
      this.renderer.add(visual);
      this.world.add(id, new Render('projectile', visual));
      this.registerVisual(id, visual);
    }
    this.particles.burst(body.position.clone().vadd(forward.scale(2.3)), 'spark', 6, 1.4, 0.3, 0.14);
    if (ownerId === this.playerId) this.cameraRig.addShake(0.08);
  }

  private spawnRearWeapon(ownerId: EntityId, kind: keyof typeof REAR_WEAPONS): void {
    const ownerPhysics = this.world.get(ownerId, Physics);
    if (!ownerPhysics?.body) return;
    const spec = REAR_WEAPONS[kind];
    const body = ownerPhysics.body;
    const forward = forwardVector(body.quaternion);
    forward.y = 0;
    forward.normalize();
    const position = body.position.clone().vadd(forward.scale(-2.4));
    position.y = kind === 'oilSlick' ? 0.08 : 0.45;

    if (kind === 'oilSlick') {
      // При переполнении не удаляем старое пятно мгновенно, а запускаем его
      // затухание — визуально и по эффекту оно исчезает плавно.
      let activeCount = 0;
      let oldest: Slick | null = null;
      for (const slickId of this.world.query(Slick)) {
        const slick = this.world.get(slickId, Slick);
        if (!slick || slick.age >= slick.lifetime) continue;
        activeCount += 1;
        if (!oldest || slick.age > oldest.age) oldest = slick;
      }
      if (activeCount >= LIMITS.slicks && oldest) oldest.age = oldest.lifetime;

      const id = this.world.createEntity();
      this.world.add(id, new Transform(position.clone()));
      this.world.add(
        id,
        new Slick(spec.radius, ownerId, WEAPON_TUNING.slickLifetimeSec, WEAPON_TUNING.slickFadeSec),
      );
      const visual = this.renderer.cylinder(spec.radius, 0.05, 0x111111, 22, {
        emissive: 0.05,
        unique: true,
        transparent: true,
      });
      visual.position.set(position.x, 0.06, position.z);
      this.renderer.add(visual);
      this.world.add(id, new Render('slick', visual));
      this.registerVisual(id, visual);
      return;
    }

    this.spawnMine(ownerId, kind === 'cassette' ? 'cassette' : 'spikeMine', position, spec.damage, spec.radius, spec.lifetime);
    if (kind === 'cassette') {
      const last = this.world.query(Mine).at(-1);
      const mine = last !== undefined ? this.world.get(last, Mine) : undefined;
      if (mine) mine.fuse = WEAPON_TUNING.cassetteDelay;
    }
  }

  private spawnMine(
    ownerId: EntityId,
    kind: 'spikeMine' | 'cassette',
    position: Vec3,
    damage: number,
    radius: number,
    lifetime: number,
  ): EntityId | null {
    const mines = this.world.query(Mine);
    if (mines.length >= LIMITS.mines) {
      const oldest = mines[0];
      if (oldest !== undefined) this.world.destroyEntity(oldest);
    }
    const id = this.world.createEntity();
    this.world.add(id, new Transform(position.clone()));
    const mine = new Mine(kind, damage, radius, kind === 'cassette' ? WEAPON_TUNING.cassetteLifetime : lifetime, ownerId, kind === 'spikeMine' ? WEAPON_TUNING.mineArmDelay : 0);
    this.world.add(id, mine);
    const visual = this.renderer.cylinder(0.45, 0.28, kind === 'cassette' ? 0xffb347 : 0xd0d0d0, 10, { emissive: 0.15 });
    visual.position.set(position.x, position.y, position.z);
    this.renderer.add(visual);
    this.world.add(id, new Render('mine', visual));
    this.registerVisual(id, visual);
    return id;
  }

  private activateBoost(id: EntityId): void {
    const weapon = this.world.get(id, Weapon);
    const physics = this.world.get(id, Physics);
    const engine = this.world.get(id, EngineState);
    const car = this.world.get(id, CarState);
    const stats = this.world.get(id, CarStats);
    if (!weapon || !physics?.body || !engine || !car || !stats || car.phase !== 'alive') return;
    const spec = BOOSTS[weapon.boost];
    if (weapon.boost === 'jumpJets') {
      if (!physics.onGround) return;
      physics.body.velocity.y = stats.jumpForce;
      this.particles.burst(physics.body.position.clone(), 'dust', 22, 2.2, 0.6, 0.4);
    } else {
      engine.nitroTimer = WEAPON_TUNING.nitroDuration;
      this.particles.burst(physics.body.position.clone(), 'nitro', 28, 2.4, 0.7, 0.35);
    }
    weapon.boostAmmo -= 1;
    weapon.boostCooldown = spec.cooldown;
    if (id === this.playerId) this.cameraRig.addShake(0.15);
  }

  // ------------------------------------------------------------ projectiles etc.

  private updateProjectiles(dt: number): void {
    for (const id of this.world.query(Projectile)) {
      const projectile = this.world.get(id, Projectile);
      const transform = this.world.get(id, Transform);
      const physics = this.world.get(id, Physics);
      if (!projectile || !transform || !physics) continue;
      projectile.lifetime -= dt;
      if (projectile.lifetime <= 0) {
        this.world.destroyEntity(id);
        continue;
      }
      if (projectile.homing) this.homeProjectile(projectile, physics, transform.position);
      const previous = transform.position.clone();
      const next = previous.clone().vadd(physics.velocity.scale(dt));

      // Свип-луч из прошлой позиции в новую: быстрый снаряд не проскакивает
      // сквозь заборы, столбы и другие статические коллайдеры за один кадр.
      const ownerBody = this.world.get(projectile.ownerId, Physics)?.body ?? null;
      const sweep = this.physics.raycast(previous, next, ownerBody);
      if (sweep) {
        const hitCarId = sweep.body ? this.bodyToEntity.get(sweep.body) : undefined;
        const impact = sweep.point.clone();
        if (hitCarId !== undefined && hitCarId !== projectile.ownerId) {
          if (projectile.aoeRadius > 0) this.applyAoe(projectile, impact);
          else this.applyDamage(hitCarId, projectile.damage, projectile.ownerId);
        }
        if (projectile.aoeRadius > 0) {
          if (hitCarId === undefined) this.applyAoe(projectile, impact);
        } else {
          this.particles.burst(impact, 'fire', 10, 2.2, 0.35, 0.2);
          this.particles.burst(impact, 'spark', 16, 3.5, 0.35, 0.16);
        }
        this.world.destroyEntity(id);
        continue;
      }

      transform.position.copy(next);
      if (transform.position.y < WORLD.killPlaneY) {
        this.world.destroyEntity(id);
        continue;
      }
      let hit: EntityId | null = null;
      for (const carId of this.carIds) {
        if (carId === projectile.ownerId) continue;
        const carState = this.world.get(carId, CarState);
        const carPhysics = this.world.get(carId, Physics);
        if (!carState || !carPhysics?.body || carState.phase !== 'alive') continue;
        const dx = carPhysics.body.position.x - transform.position.x;
        const dy = carPhysics.body.position.y - transform.position.y;
        const dz = carPhysics.body.position.z - transform.position.z;
        if (dx * dx + dy * dy + dz * dz <= WEAPON_TUNING.projectileHitRadius * WEAPON_TUNING.projectileHitRadius + 1.2) {
          hit = carId;
          break;
        }
      }
      if (hit !== null) {
        if (projectile.aoeRadius > 0) this.applyAoe(projectile, transform.position.clone());
        else this.applyDamage(hit, projectile.damage, projectile.ownerId);
        this.particles.burst(transform.position.clone(), 'fire', 24, 3, 0.5, 0.3);
        this.particles.burst(transform.position.clone(), 'spark', 14, 4, 0.4, 0.18);
        this.world.destroyEntity(id);
      }
    }
  }

  private homeProjectile(projectile: Projectile, physics: Physics, position: Vec3): void {
    if (!projectile.targetId) {
      projectile.targetId = this.findEnemyInCone(projectile.ownerId, WEAPON_TUNING.droneLockRange, WEAPON_TUNING.droneLockConeDeg);
      if (!projectile.targetId) return;
    }
    const targetPhysics = this.world.get(projectile.targetId, Physics);
    const targetState = this.world.get(projectile.targetId, CarState);
    if (!targetPhysics?.body || !targetState || targetState.phase !== 'alive') {
      projectile.targetId = null;
      return;
    }
    const desired = targetPhysics.body.position.vsub(position);
    if (desired.lengthSquared() < 1e-6) return;
    desired.normalize();
    const current = physics.velocity.clone();
    current.normalize();
    const maxTurn = (WEAPON_TUNING.droneTurnRateDeg * Math.PI) / 180 * (1 / 60);
    const angle = Math.acos(Math.max(-1, Math.min(1, current.dot(desired))));
    if (angle <= maxTurn) {
      physics.velocity.copy(desired.scale(projectile.speed));
    } else {
      const axis = current.cross(desired);
      if (axis.lengthSquared() < 1e-5) return;
      axis.normalize();
      const q = new Quaternion().setFromAxisAngle(axis, maxTurn);
      physics.velocity.copy(q.vmult(current).scale(projectile.speed));
    }
  }

  private applyAoe(projectile: Projectile, position: Vec3): void {
    this.particles.explosion(position);
    this.cameraRig.addShake(0.9);
    this.audio.explosion();
    for (const carId of this.carIds) {
      const carState = this.world.get(carId, CarState);
      const physics = this.world.get(carId, Physics);
      if (!carState || !physics?.body || carState.phase !== 'alive') continue;
      const distance = physics.body.position.distanceTo(position);
      if (distance > projectile.aoeRadius) continue;
      const falloff = Math.max(0.25, 1 - distance / projectile.aoeRadius);
      this.applyDamage(carId, projectile.damage * falloff, projectile.ownerId);
    }
  }

  /** Старение пятен нефти: полная видимость, затем плавное затухание в альфу. */
  private updateSlicks(dt: number): void {
    for (const id of this.world.query(Slick)) {
      const slick = this.world.get(id, Slick);
      const render = this.world.get(id, Render);
      if (!slick) continue;
      slick.age += dt;
      if (slick.age >= slick.lifetime + slick.fadeDuration) {
        this.world.destroyEntity(id);
        continue;
      }
      slick.opacity =
        slick.age <= slick.lifetime
          ? 1
          : Math.max(0, 1 - (slick.age - slick.lifetime) / slick.fadeDuration);
      if (render?.object) this.renderer.setOpacity(render.object, slick.opacity);
    }
  }

  private updateMines(dt: number): void {
    for (const id of this.world.query(Mine)) {
      const mine = this.world.get(id, Mine);
      const transform = this.world.get(id, Transform);
      if (!mine || !transform) continue;
      if (mine.fuse > 0) {
        mine.fuse -= dt;
        if (mine.fuse <= 0) {
          if (mine.kind === 'cassette') {
            const origin = transform.position.clone();
            this.world.destroyEntity(id);
            for (let i = 0; i < 3; i += 1) {
              const offset = new Vec3((Math.random() - 0.5) * WEAPON_TUNING.cassetteSpread, 0, (Math.random() - 0.5) * WEAPON_TUNING.cassetteSpread);
              this.spawnMine(mine.ownerId, 'spikeMine', origin.vadd(offset), mine.damage, mine.radius, Number.POSITIVE_INFINITY);
            }
            continue;
          }
          mine.armed = true;
        }
      }
      if (Number.isFinite(mine.lifetime)) {
        mine.lifetime -= dt;
        if (mine.lifetime <= 0) {
          this.world.destroyEntity(id);
          continue;
        }
      }
      if (!mine.armed) continue;
      for (const carId of this.carIds) {
        const carState = this.world.get(carId, CarState);
        const physics = this.world.get(carId, Physics);
        if (!carState || !physics?.body || carState.phase !== 'alive') continue;
        const dx = physics.body.position.x - transform.position.x;
        const dz = physics.body.position.z - transform.position.z;
        if (dx * dx + dz * dz > (mine.radius * 0.7) * (mine.radius * 0.7)) continue;
        this.explodeMine(id, mine, transform.position.clone());
        break;
      }
    }
  }

  private explodeMine(id: EntityId, mine: Mine, position: Vec3): void {
    this.world.destroyEntity(id);
    this.particles.explosion(position);
    this.audio.explosion();
    this.cameraRig.addShake(0.5);
    for (const carId of this.carIds) {
      const carState = this.world.get(carId, CarState);
      const physics = this.world.get(carId, Physics);
      if (!carState || !physics?.body || carState.phase !== 'alive') continue;
      const distance = physics.body.position.distanceTo(position);
      if (distance > mine.radius) continue;
      const falloff = Math.max(0.3, 1 - distance / mine.radius);
      this.applyDamage(carId, mine.damage * falloff, mine.ownerId);
      const direction = physics.body.position.vsub(position);
      direction.normalize();
      const impulse = direction.scale(WEAPON_TUNING.mineTriggerRadius * 3 * falloff);
      impulse.y = 6;
      physics.body.applyImpulse(impulse);
    }
  }

  private updateDebris(dt: number): void {
    for (const id of this.world.query(Debris)) {
      const debris = this.world.get(id, Debris);
      const physics = this.world.get(id, Physics);
      if (!debris) continue;
      debris.lifetime -= dt;
      if (debris.lifetime <= 0) {
        this.world.destroyEntity(id);
        this.physics.removeBody(physics?.body ?? null);
        continue;
      }
      this.syncCarTransform(id);
    }
  }

  // -------------------------------------------------------------------- combat

  private onCarCollide(entityId: EntityId, other: Body): void {
    const otherId = this.bodyToEntity.get(other);
    if (otherId === undefined || otherId === entityId) return;
    const a = this.world.get(entityId, Physics);
    const b = this.world.get(otherId, Physics);
    const aState = this.world.get(entityId, CarState);
    const bState = this.world.get(otherId, CarState);
    if (!a?.body || !b?.body || !aState || !bState) return;
    if (aState.phase !== 'alive' || bState.phase !== 'alive') return;
    const relative = a.body.velocity.vsub(b.body.velocity).length();
    if (relative < PHYSICS.carImpactMinSpeed) return;
    const aEngine = this.world.get(entityId, EngineState);
    const bEngine = this.world.get(otherId, EngineState);
    const lastImpact = Math.max(aEngine?.lastImpact ?? 0, bEngine?.lastImpact ?? 0);
    if (this.raceTime - lastImpact < PHYSICS.carImpactCooldownSec) return;
    if (aEngine) aEngine.lastImpact = this.raceTime;
    if (bEngine) bEngine.lastImpact = this.raceTime;
    const damage = Math.min(
      PHYSICS.carImpactMaxDamage,
      ((relative - PHYSICS.carImpactMinSpeed) / PHYSICS.carImpactSpeedRange) * PHYSICS.carImpactMaxDamage,
    );
    this.applyDamage(entityId, damage, otherId);
    this.applyDamage(otherId, damage, entityId);
    this.particles.burst(a.body.position.clone(), 'spark', 10, 3, 0.35, 0.16);
    this.audio.impact();
    if (entityId === this.playerId || otherId === this.playerId) this.cameraRig.addShake(0.4);
  }

  applyDamage(victimId: EntityId, amount: number, attackerId: EntityId | null): void {
    const health = this.world.get(victimId, Health);
    const state = this.world.get(victimId, CarState);
    const physics = this.world.get(victimId, Physics);
    if (!health || !state || !physics?.body) return;
    if (state.phase !== 'alive' || health.invulnTimer > 0) return;
    health.current = Math.max(0, health.current - amount);
    health.damageLevel = health.current < health.max * 0.25 ? 2 : health.current < health.max * 0.5 ? 1 : 0;
    if (health.damageLevel === 2) {
      this.particles.trail(physics.body.position.clone().set(physics.body.position.x, physics.body.position.y + 0.3, physics.body.position.z), 'spark', 3, 0.16);
    }
    if (attackerId === this.playerId && victimId !== this.playerId) {
      const name = this.world.get(victimId, NameTag);
      if (name) this.trophies.add(name.value);
    }
    if (health.damageLevel >= 1) {
      this.particles.trail(physics.body.position.clone().set(physics.body.position.x, physics.body.position.y + 0.6, physics.body.position.z), 'smoke', 1, 0.4);
    }
    if (health.current <= 0) this.explodeCar(victimId, attackerId === this.playerId ? 'player' : 'combat');
  }

  private explodeCar(id: EntityId, source: 'combat' | 'hazard' | 'player' | 'fall'): void {
    const state = this.world.get(id, CarState);
    const physics = this.world.get(id, Physics);
    const render = this.world.get(id, Render);
    const health = this.world.get(id, Health);
    const engine = this.world.get(id, EngineState);
    if (!state || !physics?.body || state.phase !== 'alive') return;
    const position = physics.body.position.clone();
    state.phase = 'exploding';
    state.respawnTimer = RESPAWN.delaySec;
    if (health) health.current = 0;
    if (render) render.visible = false;
    if (engine) engine.nitroTimer = 0;
    this.physics.removeBody(physics.body);
    this.bodyToEntity.delete(physics.body);
    this.particles.explosion(position);
    this.spawnDebris(position);
    this.audio.explosion();
    if (id === this.playerId) {
      this.cameraRig.addShake(1.2);
      this.audio.say(source === 'hazard' ? 'Осторожно! Опасная зона!' : 'Тебя разорвало на куски!');
      this.store.set({ respawnTimer: RESPAWN.delaySec });
    }
  }

  private spawnDebris(position: Vec3): void {
    for (let i = 0; i < LIMITS.debris; i += 1) {
      const id = this.world.createEntity();
      const offset = new Vec3((Math.random() - 0.5) * 2, Math.random() * 1.2 + 0.4, (Math.random() - 0.5) * 2);
      const spawn = position.clone().vadd(offset);
      this.world.add(id, new Transform(spawn.clone()));

      const size = 0.35 + Math.random() * 0.5;
      const debrisBody = new Body({ mass: 8, linearDamping: 0.2, angularDamping: 0.4 });
      debrisBody.addShape(new Box(new Vec3(size * 0.5, size * 0.35, size * 0.6)));
      debrisBody.position.copy(spawn);
      debrisBody.velocity.set(offset.x * 5, 3 + Math.random() * 5, offset.z * 5);
      debrisBody.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      this.physics.world.addBody(debrisBody);
      PhysicsWorld.syncInterpolation(debrisBody);
      this.world.add(id, new Physics(debrisBody));

      const visual = this.renderer.box(size, size * 0.7, size * 1.2, 0x6b4a32);
      visual.position.set(spawn.x, spawn.y, spawn.z);
      this.renderer.add(visual);
      this.world.add(id, new Render('debris', visual));
      this.registerVisual(id, visual);
      this.world.add(id, new Debris(3));
    }
  }

  private updateRespawn(id: EntityId, dt: number): void {
    const state = this.world.get(id, CarState);
    if (!state) return;
    const health = this.world.get(id, Health);
    if (health && state.phase === 'alive' && health.invulnTimer > 0) {
      health.invulnTimer = Math.max(0, health.invulnTimer - dt);
    }
    if (state.phase === 'exploding') {
      state.respawnTimer = Math.max(0, state.respawnTimer - dt);
      if (id === this.playerId) this.store.set({ respawnTimer: state.respawnTimer });
      if (state.respawnTimer <= 0) {
        state.phase = 'respawning';
        this.respawnCar(id);
      }
    }
    const physics = this.world.get(id, Physics);
    if (physics?.body && physics.body.position.y < WORLD.killPlaneY && state.phase === 'alive') {
      this.explodeCar(id, 'fall');
    }
  }

  private respawnCar(id: EntityId): void {
    const state = this.world.get(id, CarState);
    const lap = this.world.get(id, Lap);
    const physics = this.world.get(id, Physics);
    const health = this.world.get(id, Health);
    const render = this.world.get(id, Render);
    const engine = this.world.get(id, EngineState);
    if (!state || !lap || !physics?.body || !health) return;
    const wp = checkpointPosition(this.track, lap.lastCheckpoint);
    const yaw = Math.atan2(wp.tangent.x, wp.tangent.z);
    const spawn = this.findRespawnPosition(id, wp);
    const body = physics.body;
    if (!this.physics.world.bodies.includes(body)) this.physics.world.addBody(body);
    this.bodyToEntity.set(body, id);
    body.position.set(spawn.x, spawn.y + CHASSIS_REST_Y + 0.2, spawn.z);
    body.quaternion.setFromEuler(0, yaw, 0);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.force.set(0, 0, 0);
    body.torque.set(0, 0, 0);
    body.wakeUp();
    PhysicsWorld.syncInterpolation(body);
    physics.groundPitch = 0;
    physics.groundRoll = 0;
    health.current = health.max;
    health.damageLevel = 0;
    health.invulnTimer = RESPAWN.invulnSec;
    if (engine) {
      engine.nitroTimer = 0;
      engine.spinOutTimer = 0;
      engine.rampInside = false;
      engine.padCooldown = 0;
      engine.lastWallHit = 0;
    }
    this.world.get(id, AI)?.brain.reset();
    this.refillWeapons(id, AMMO.respawnFrontShare, AMMO.respawnRearShare, AMMO.respawnBoostShare);
    if (render) render.visible = true;
    state.phase = 'alive';
    state.respawnTimer = 0;
    this.syncCarTransform(id);
    this.particles.burst(body.position.clone(), 'dust', 26, 2.4, 0.6, 0.35);
  }

  /**
   * Выбирает точку респауна рядом с чекпоинтом так, чтобы машины не
   * появлялись друг на друге. Сначала пробуются позиции слева и справа от
   * центра трассы, затем — со сдвигом вдоль неё.
   */
  private findRespawnPosition(id: EntityId, wp: Waypoint): Vec3 {
    const lateral = RESPAWN.lateralOffset;
    const along = RESPAWN.longitudinalOffset;
    const offsets: ReadonlyArray<readonly [number, number]> = [
      [-lateral, 0],
      [lateral, 0],
      [-lateral, -along],
      [lateral, -along],
      [-lateral, along],
      [lateral, along],
      [0, 0],
      [0, -along],
      [0, along],
    ];
    let best = wp.position.clone();
    let bestDistance = -1;
    for (const [side, forward] of offsets) {
      const candidate = wp.position.clone().vadd(wp.right.scale(side)).vadd(wp.tangent.scale(forward));
      const distance = this.minCarDistance(id, candidate);
      if (distance >= RESPAWN.minSeparation) return candidate;
      if (distance > bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  /** Минимальное горизонтальное расстояние от точки до живых машин. */
  private minCarDistance(id: EntityId, position: Vec3): number {
    let min = Number.POSITIVE_INFINITY;
    for (const otherId of this.carIds) {
      if (otherId === id) continue;
      const state = this.world.get(otherId, CarState);
      const physics = this.world.get(otherId, Physics);
      if (!state || state.phase !== 'alive' || !physics?.body) continue;
      const dx = physics.body.position.x - position.x;
      const dz = physics.body.position.z - position.z;
      min = Math.min(min, Math.hypot(dx, dz));
    }
    return min;
  }

  /** Полный боезапас — только после смерти/респауна. */
  private refillWeapons(id: EntityId, frontShare = 1, rearShare = 1, boostShare = 1): void {
    const weapon = this.world.get(id, Weapon);
    if (!weapon) return;
    weapon.frontAmmo = Math.max(weapon.frontAmmo, Math.ceil(weapon.maxFrontAmmo * frontShare));
    weapon.rearAmmo = Math.max(weapon.rearAmmo, Math.ceil(weapon.maxRearAmmo * rearShare));
    weapon.boostAmmo = Math.max(weapon.boostAmmo, Math.ceil(weapon.maxBoostAmmo * boostShare));
    weapon.frontCooldown = 0;
    weapon.rearCooldown = 0;
    weapon.boostCooldown = 0;
  }

  /** Ящик утиля даёт немного патронов, мин и зарядов буста — поштучно. */
  private resupplyWeapons(id: EntityId): void {
    const weapon = this.world.get(id, Weapon);
    if (!weapon) return;
    const front = Math.max(AMMO.pickupFrontMin, Math.ceil(weapon.maxFrontAmmo * AMMO.pickupFrontShare));
    weapon.frontAmmo = Math.min(weapon.maxFrontAmmo, weapon.frontAmmo + front);
    weapon.rearAmmo = Math.min(weapon.maxRearAmmo, weapon.rearAmmo + AMMO.pickupRear);
    weapon.boostAmmo = Math.min(weapon.maxBoostAmmo, weapon.boostAmmo + AMMO.pickupBoost);
  }

  // ----------------------------------------------------------------------- AI

  private updateAI(id: EntityId, dt: number): void {
    const ai = this.world.get(id, AI);
    const input = this.world.get(id, VehicleInput);
    const physics = this.world.get(id, Physics);
    const stats = this.world.get(id, CarStats);
    const state = this.world.get(id, CarState);
    const lap = this.world.get(id, Lap);
    const engine = this.world.get(id, EngineState);
    if (!ai || !input || !physics?.body || !stats || !state || !lap || !engine) return;
    input.throttle = 0;
    input.brake = 0;
    input.steer = 0;
    input.fireFront = false;
    input.fireRear = false;
    input.fireBoost = false;
    input.fireRearPressed = false;
    input.fireBoostPressed = false;
    if (state.phase !== 'alive' || lap.finished) return;

    const brain = ai.brain;
    const body = physics.body;
    const forward = forwardVector(body.quaternion);
    forward.y = 0;
    if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    const speed = body.velocity.length();
    const forwardSpeed = body.velocity.dot(forward);
    const currentYaw = quaternionYaw(body.quaternion);

    // Ближайшая точка трассы нужна и для прицеливания, и для понимания,
    // куда сейчас смотрит нос машины после столкновения/разворота.
    const nearest = this.nearestWaypointIndex(body.position);
    brain.targetWaypoint = nearest;
    const here = waypointAt(this.track, nearest);
    const trackHeadingError = angleDifference(
      Math.atan2(here.tangent.x, here.tangent.z),
      currentYaw,
    );

    const lookahead = Math.max(2, Math.min(5, 1 + Math.floor(Math.max(0, speed) / 8)));
    const target = waypointAt(this.track, nearest + lookahead);
    const desiredYaw = Math.atan2(
      target.racingLine.x - body.position.x,
      target.racingLine.z - body.position.z,
    );
    const yawError = angleDifference(desiredYaw, currentYaw);

    const personalityFactor =
      brain.personality === 'boss' ? 1 : brain.personality === 'meat' ? 0.86 : 0.95;
    const corner = Math.max(0.004, target.curvature);
    let targetSpeed = idealCornerSpeed(stats.maxSpeed, brain.skill, stats.grip, corner) * personalityFactor;
    if (brain.personality === 'boss' && corner > 0.02) targetSpeed *= 0.85;

    const up = body.quaternion.vmult(new Vec3(0, 1, 0));
    const decision = brain.update(
      dt,
      {
        speed,
        forwardSpeed,
        yawError,
        trackHeadingError,
        blockedAhead: this.probeObstacle(id, 1, AI_CONFIG.probeDistance),
        blockedBehind: this.probeObstacle(id, -1, AI_CONFIG.probeDistance),
        recentWallHit: this.raceTime - engine.lastWallHit < AI_CONFIG.wallHitMemorySec,
        upsideDown: up.y < 0.25,
        fell: body.position.y < WORLD.killPlaneY,
      },
      targetSpeed,
    );

    input.throttle = decision.throttle;
    input.brake = decision.brake;
    input.steer = decision.steer;
    if (decision.respawn) {
      this.forceRespawn(id);
      return;
    }

    const enemy = this.findEnemyInCone(id, AI_CONFIG.raycastRange, AI_CONFIG.coneDeg);
    if (enemy !== null) input.fireFront = true;

    const threatBehind = this.hasThreatBehind(id);
    if (
      threatBehind &&
      this.raceTime >= AI_CONFIG.rearWeaponDelaySec &&
      (this.world.get(id, Weapon)?.rearAmmo ?? 0) > 0
    ) {
      input.fireRearPressed = true;
    }

    // Объезд угрозы имеет смысл только когда ИИ едет вперёд по трассе:
    // во время отката и разворота руль занят манёвром.
    if (decision.maneuver === 'race' && this.hasThreatAhead(id)) {
      input.steer = Math.max(-1, Math.min(1, input.steer + 0.35));
      if (physics.onGround && (this.world.get(id, Weapon)?.boostAmmo ?? 0) > 0) {
        input.fireBoostPressed = true;
      }
    }
  }

  /** Индекс ближайшей точки трассы: не даём ИИ потерять курс после разворота. */
  private nearestWaypointIndex(position: Vec3): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    const waypoints = this.track.waypoints;
    for (let index = 0; index < waypoints.length; index += 1) {
      const wp = waypoints[index];
      if (!wp) continue;
      const dx = wp.position.x - position.x;
      const dz = wp.position.z - position.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }

  /** Щуп вперёд/назад: видит стены, машины и прочие твёрдые препятствия. */
  private probeObstacle(id: EntityId, direction: 1 | -1, distance: number): boolean {
    const physics = this.world.get(id, Physics);
    if (!physics?.body) return false;
    const body = physics.body;
    const forward = forwardVector(body.quaternion);
    forward.y = 0;
    if (forward.lengthSquared() < 1e-6) return false;
    forward.normalize();
    const dir = forward.scale(direction);
    const from = body.position.clone();
    const to = from.clone().vadd(dir.scale(distance));
    const hit = this.physics.raycast(from, to, body);
    if (!hit) return false;
    // Луч может зацепить полотно на подъёме — это не препятствие.
    return hit.body?.material !== this.physics.groundMaterial;
  }

  private forceRespawn(id: EntityId): void {
    const state = this.world.get(id, CarState);
    if (!state || state.phase !== 'alive') return;
    state.phase = 'respawning';
    this.respawnCar(id);
  }

  private findEnemyInCone(id: EntityId, range: number, coneDeg: number): EntityId | null {
    const physics = this.world.get(id, Physics);
    if (!physics?.body) return null;
    const forward = forwardVector(physics.body.quaternion);
    forward.y = 0;
    forward.normalize();
    let best: EntityId | null = null;
    let bestDistance = range;
    for (const otherId of this.carIds) {
      if (otherId === id) continue;
      const otherState = this.world.get(otherId, CarState);
      const otherPhysics = this.world.get(otherId, Physics);
      if (!otherState || !otherPhysics?.body || otherState.phase !== 'alive') continue;
      const to = otherPhysics.body.position.vsub(physics.body.position);
      const distance = to.length();
      if (distance > bestDistance || distance < 0.001) continue;
      to.normalize();
      const dot = forward.dot(to);
      if (Math.acos(Math.max(-1, Math.min(1, dot))) > (coneDeg * Math.PI) / 180) continue;
      best = otherId;
      bestDistance = distance;
    }
    return best;
  }

  private hasThreatAhead(id: EntityId): boolean {
    const physics = this.world.get(id, Physics);
    if (!physics?.body) return false;
    const forward = forwardVector(physics.body.quaternion);
    forward.y = 0;
    forward.normalize();
    const check = (position: Vec3): boolean => {
      const to = position.vsub(physics.body!.position);
      const distance = to.length();
      if (distance > AI_CONFIG.threatAheadRange || distance < 0.5) return false;
      to.y = 0;
      to.normalize();
      return forward.dot(to) > 0.35;
    };
    for (const mineId of this.world.query(Mine)) {
      const transform = this.world.get(mineId, Transform);
      if (transform && check(transform.position)) return true;
    }
    for (const slickId of this.world.query(Slick)) {
      const transform = this.world.get(slickId, Transform);
      if (transform && check(transform.position)) return true;
    }
    for (const hazard of this.track.hazards) {
      if (check(hazard.center)) return true;
    }
    return false;
  }

  private hasThreatBehind(id: EntityId): boolean {
    const physics = this.world.get(id, Physics);
    if (!physics?.body) return false;
    const forward = forwardVector(physics.body.quaternion);
    forward.y = 0;
    forward.normalize();
    for (const otherId of this.carIds) {
      if (otherId === id) continue;
      const otherPhysics = this.world.get(otherId, Physics);
      if (!otherPhysics?.body) continue;
      const to = otherPhysics.body.position.vsub(physics.body.position);
      const distance = to.length();
      if (distance > AI_CONFIG.threatBehindRange || distance < 1) continue;
      to.y = 0;
      to.normalize();
      if (forward.dot(to) < -0.3) return true;
    }
    return false;
  }

  // -------------------------------------------------------------- race results

  private updatePositions(): void {
    const scored = this.carIds.map((id) => {
      const lap = this.world.get(id, Lap);
      const physics = this.world.get(id, Physics);
      let progress = 0;
      if (lap && physics?.body) {
        if (lap.finished) progress = 10000 - lap.finishTime;
        else {
          const wp = checkpointPosition(this.track, lap.nextCheckpoint);
          const distance = Math.hypot(wp.position.x - physics.body.position.x, wp.position.z - physics.body.position.z);
          progress = raceProgress(lap, distance, 100);
        }
      }
      return { id, progress, finished: lap?.finished ?? false, finishTime: lap?.finishTime ?? 999999 };
    });
    scored.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    scored.forEach((entry, index) => {
      const standing = this.world.get(entry.id, RaceStanding);
      if (standing) {
        standing.position = index + 1;
        standing.progress = entry.progress;
        standing.lapsFinished = entry.finished;
      }
    });

    const playerStanding = this.world.get(this.playerId, RaceStanding);
    if (playerStanding) {
      const position = playerStanding.position;
      if (
        this.screen === 'racing' &&
        this.raceTime > COMMENTARY.overtakeGraceSec &&
        this.commentaryCooldown <= 0 &&
        position < this.lastPlayerPosition
      ) {
        this.audio.say(position === 1 ? 'Ты впереди! Пустошь смотрит на тебя!' : `Обгон! Теперь ${position}-е место!`);
        this.commentaryCooldown = COMMENTARY.overtakeCooldownSec;
      }
      this.lastPlayerPosition = position;
    }
  }

  private checkRaceEnd(): void {
    if (this.raceFinished) return;
    const allFinished = this.carIds.every((id) => this.world.get(id, Lap)?.finished ?? false);
    const timeUp = this.raceTime >= RACE.timeLimitSec;
    const graceEnd = this.firstFinishTime !== null && this.raceTime >= this.firstFinishTime + RACE.graceAfterFirstSec;
    if (allFinished || timeUp || graceEnd) this.endRace();
  }

  private endRace(): void {
    if (this.raceFinished) return;
    this.raceFinished = true;
    this.updatePositions();
    const ordered = [...this.carIds].sort((a, b) => {
      const sa = this.world.get(a, RaceStanding)?.position ?? 4;
      const sb = this.world.get(b, RaceStanding)?.position ?? 4;
      return sa - sb;
    });
    const playerLap = this.playerId >= 0 ? this.world.get(this.playerId, Lap) : undefined;
    this.dnf = !(playerLap?.finished ?? false);
    let playerPlace = ordered.findIndex((id) => id === this.playerId) + 1;
    if (this.dnf) playerPlace = RACE.maxCars;

    const rows: RaceResultRow[] = ordered.map((id, index) => {
      const name = this.world.get(id, NameTag)?.value ?? 'Неизвестный';
      const lap = this.world.get(id, Lap);
      const isPlayer = id === this.playerId;
      const place = isPlayer ? playerPlace : index + 1;
      const placement = placementReward(place, this.profile.division);
      return {
        place,
        name,
        isPlayer,
        money: isPlayer ? 0 : 0,
        points: isPlayer ? placement.points : 0,
        trophies: 0,
        dominance: 0,
        scrap: 0,
        finished: lap?.finished ?? false,
        dnf: isPlayer ? this.dnf : !(lap?.finished ?? false),
        lapTimes: lap?.lapTimes ?? [],
      };
    }).sort((a, b) => a.place - b.place);

    const money = raceMoney(playerPlace, this.profile.division, this.trophies.size, this.dominance.size, this.scrapCollected);
    const placement = placementReward(playerPlace, this.profile.division);
    const season = applySeasonProgress(this.profile, playerPlace);
    this.profile = {
      ...season.profile,
      money: season.profile.money + money,
      totalTrophies: season.profile.totalTrophies + this.trophies.size,
      totalScrap: season.profile.totalScrap + this.scrapCollected,
    };
    this.seasonFailed = season.seasonFailed;
    saveProfile(this.profile);
    const playerRow = rows.find((r) => r.isPlayer);
    if (playerRow) {
      playerRow.money = money;
      playerRow.points = placement.points;
      playerRow.trophies = this.trophies.size;
      playerRow.dominance = this.dominance.size;
      playerRow.scrap = this.scrapCollected;
    }
    this.lastResults = rows;
    this.store.set({
      profile: this.profile,
      results: rows,
      seasonFailed: this.seasonFailed,
      dnf: this.dnf,
      money: this.profile.money,
    });
    this.audio.say(this.dnf ? 'Ты не дожил до финиша...' : playerPlace === 1 ? 'Победа! Пустошь твоя!' : 'Финиш! Неплохо для выжившего.');
    this.actor.send({ type: this.dnf ? 'DNF' : 'RACE_FINISHED' });
    this.syncHud();
  }

  // ---------------------------------------------------------------------- HUD

  private syncHud(): void {
    if (this.playerId < 0) return;
    const standings: HudCar[] = this.carIds.map((id) => {
      const name = this.world.get(id, NameTag);
      const lap = this.world.get(id, Lap);
      const standing = this.world.get(id, RaceStanding);
      const health = this.world.get(id, Health);
      const physics = this.world.get(id, Physics);
      return {
        id,
        name: name?.value ?? '',
        isPlayer: name?.isPlayer ?? false,
        position: standing?.position ?? 0,
        lap: Math.min(lap?.currentLap ?? 1, lap?.totalLaps ?? RACE.totalLaps),
        health: health?.current ?? 0,
        maxHealth: health?.max ?? 1,
        damageLevel: health?.damageLevel ?? 0,
        finished: lap?.finished ?? false,
        speed: physics?.body?.velocity.length() ?? 0,
      };
    });
    standings.sort((a, b) => a.position - b.position);

    const health = this.world.get(this.playerId, Health);
    const physics = this.world.get(this.playerId, Physics);
    const lap = this.world.get(this.playerId, Lap);
    const weapon = this.world.get(this.playerId, Weapon);
    const state = this.world.get(this.playerId, CarState);
    const standing = this.world.get(this.playerId, RaceStanding);
    const engine = this.world.get(this.playerId, EngineState);
    if (!health || !physics?.body || !lap || !weapon || !state) return;

    this.store.set({
      playerPosition: standing?.position ?? 4,
      lap: Math.min(lap.currentLap, lap.totalLaps),
      totalLaps: lap.totalLaps,
      health: health.current,
      maxHealth: health.max,
      damageLevel: health.damageLevel,
      speed: physics.body.velocity.length(),
      respawnTimer: state.phase === 'exploding' ? state.respawnTimer : 0,
      invuln: health.invulnTimer > 0,
      invulnTimer: health.invulnTimer,
      nitroActive: (engine?.nitroTimer ?? 0) > 0,
      ammoFront: weapon.frontAmmo,
      ammoRear: weapon.rearAmmo,
      ammoBoost: weapon.boostAmmo,
      maxAmmoFront: weapon.maxFrontAmmo,
      maxAmmoRear: weapon.maxRearAmmo,
      maxAmmoBoost: weapon.maxBoostAmmo,
      standings,
      raceTime: this.raceTime,
      timeLeft: Math.max(0, RACE.timeLimitSec - this.raceTime),
      countdown: Math.max(0, this.countdownTimer),
      fps: this.fps,
    });
  }

  // -------------------------------------------------------------------- render

  render(dt: number): void {
    if (this.disposed) return;
    this.frameAccum += dt;
    this.frameCount += 1;
    if (this.frameAccum >= 0.5) {
      this.fps = Math.round(this.frameCount / this.frameAccum);
      this.frameAccum = 0;
      this.frameCount = 0;
    }

    for (const id of this.world.query(Render)) {
      const render = this.world.get(id, Render);
      const transform = this.world.get(id, Transform);
      if (!render?.object || !transform) continue;
      const object = render.object as import('ogl').Transform;
      object.position.set(transform.position.x, transform.position.y, transform.position.z);
      object.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
      object.visible = render.visible;
      if (render.kind === 'pickup') object.rotation.y += dt * 2.2;
    }

    // Камеру ведём по интерполированному трансформу: иначе она дрожит
    // при фиксированном шаге физики (та же причина, что и у меша машины).
    const playerPhysics = this.playerId >= 0 ? this.world.get(this.playerId, Physics) : undefined;
    const playerTransform = this.playerId >= 0 ? this.world.get(this.playerId, Transform) : undefined;
    const playerPos = playerPhysics?.body ? playerTransform?.position ?? playerPhysics.body.position : undefined;

    if (this.screen === 'trackIntro') {
      this.cameraRig.intro(dt, this.track);
    } else if (this.screen === 'menu' || this.screen === 'garage') {
      const wp = waypointAt(this.track, 0);
      this.cameraRig.orbit(dt, wp.position);
    } else if (this.screen === 'results') {
      if (playerPos) this.cameraRig.orbit(dt, playerPos);
    } else if (this.screen === 'paused') {
      // камера замирает
    } else if (playerPos) {
      const forward = forwardVector(
        playerTransform?.rotation ?? playerPhysics?.body?.quaternion ?? new Quaternion(),
      );
      forward.y = 0;
      if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);
      forward.normalize();
      this.cameraRig.follow(dt, playerPos, forward);
    }
    this.cameraRig.clampToWorld();
    this.cameraRig.renderShake();
    this.particles.render();
    this.renderer.render();
  }

  // ----------------------------------------------------------------- controls

  togglePause(): void {
    this.audio.unlock();
    if (this.screen === 'racing' || this.screen === 'countdown' || this.screen === 'trackIntro') {
      this.actor.send({ type: 'PAUSE' });
    } else if (this.screen === 'paused') {
      this.actor.send({ type: 'RESUME' });
      this.input.resetEdges();
    }
  }

  quitToGarage(): void {
    if (this.screen === 'results') this.actor.send({ type: 'GO_GARAGE' });
    else this.actor.send({ type: 'QUIT' });
    this.audio.stopMusic();
  }

  goToMenu(): void {
    this.actor.send({ type: 'BACK_TO_MENU' });
  }

  startFromMenu(): void {
    this.audio.unlock();
    this.actor.send({ type: 'START' });
  }

  loadProfile(): void {
    this.audio.unlock();
    this.profile = loadProfile();
    this.store.set({ profile: this.profile, money: this.profile.money });
    this.actor.send({ type: 'LOAD' });
  }

  newGame(): void {
    this.audio.unlock();
    this.profile = resetProfile();
    this.store.set({ profile: this.profile, money: this.profile.money });
    this.buildRace(this.profile.zone);
    this.actor.send({ type: 'START' });
  }

  setTouchInput(patch: Partial<TouchState>): void {
    this.input.setTouch(patch);
  }

  setBinding(action: import('./InputSystem').InputAction, codes: string[]): void {
    this.input.setBinding(action, codes);
  }

  getBindings(): Record<import('./InputSystem').InputAction, string[]> {
    return this.input.getBindings();
  }

  setGamepadEnabled(enabled: boolean): void {
    this.input.setGamepadEnabled(enabled);
  }

  selectCar(carId: string): void {
    if (!this.profile.carsOwned.includes(carId)) return;
    this.profile = { ...this.profile, car: carId };
    saveProfile(this.profile);
    this.store.setProfile(this.profile);
    this.buildRace(this.track.zone.id);
  }

  purchaseCar(carId: string): { ok: boolean; reason?: string } {
    const result = buyCar(this.profile, carId);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.profile = result.profile;
    saveProfile(this.profile);
    this.store.set({ profile: this.profile, money: this.profile.money });
    this.buildRace(this.track.zone.id);
    return { ok: true };
  }

  purchaseUpgrade(category: import('../config/balance').UpgradeCategory): { ok: boolean; reason?: string } {
    const result = buyUpgrade(this.profile, this.profile.car, category);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.profile = result.profile;
    saveProfile(this.profile);
    this.store.set({ profile: this.profile, money: this.profile.money });
    this.buildRace(this.track.zone.id);
    return { ok: true };
  }

  selectPilot(pilotId: PlayerProfile['pilot']): void {
    this.profile = { ...this.profile, pilot: pilotId };
    saveProfile(this.profile);
    this.store.setProfile(this.profile);
    this.buildRace(this.track.zone.id);
  }

  selectZone(zone: ZoneId): void {
    if (zone > this.profile.zone) return;
    this.profile = { ...this.profile, zone };
    saveProfile(this.profile);
    this.store.setProfile(this.profile);
    this.buildRace(zone);
  }

  selectTrack(layout: TrackLayout): void {
    if (this.profile.track === layout) return;
    this.profile = { ...this.profile, track: layout };
    saveProfile(this.profile);
    this.store.setProfile(this.profile);
    this.buildRace(this.track.zone.id);
  }

  getTrackName(layout: TrackLayout): string {
    return TRACK_LAYOUTS.find((entry) => entry.id === layout)?.name ?? 'Трасса';
  }

  setSettings(settings: GameSettings): void {
    this.settings = settings;
    saveSettings(settings);
    this.store.setSettings(settings);
    this.audio.setVolume(settings.volume);
    this.cameraRig.cameraShakeEnabled = settings.cameraShake;
    this.particles.density = settings.particles === 'low' ? RENDER.lowParticleDensity : 1;
    this.renderer.setQuality(settings.quality);
    this.renderer.resize();
  }

  getProfile(): PlayerProfile {
    return this.profile;
  }

  getSettings(): GameSettings {
    return this.settings;
  }

  refreshProfile(profile: PlayerProfile): void {
    this.profile = profile;
    saveProfile(profile);
    this.store.set({ profile, money: profile.money });
  }

  dispose(): void {
    this.disposed = true;
    this.audio.dispose();
    this.input.dispose();
    this.renderer.dispose();
    this.physics.dispose();
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
  }
}
