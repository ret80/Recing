import { Vec3 } from 'cannon-es';
import { RACE } from '../config/balance';
import type { CarSpec, ComputedStats } from '../config/cars';
import type { UpgradeLevel } from '../config/balance';
import { ammoForBoost, ammoForFront, ammoForRear } from '../config/weapons';
import {
  CarState,
  CarStats,
  Chassis,
  EngineState,
  Health,
  Lap,
  NameTag,
  Physics,
  RaceStanding,
  Render,
  SurfaceState,
  Transform,
  VehicleInput,
  Weapon,
  type EntityId,
  type World,
} from '../ecs/components';
import { CHASSIS_REST_Y, PhysicsWorld } from '../physics/physicsWorld';
import type { GameRenderer } from '../render/renderer';

export type CarSpawnOptions = {
  world: World;
  physics: PhysicsWorld;
  renderer: GameRenderer;
  name: string;
  isPlayer: boolean;
  car: CarSpec;
  stats: ComputedStats;
  position: { x: number; y: number; z: number };
  yaw: number;
  ammoLevel: UpgradeLevel;
  mainColor: number;
  accentColor: number;
};

export type SpawnedCar = {
  id: EntityId;
  visual: import('ogl').Transform;
  body: import('cannon-es').Body;
};

const IMMUNITIES: Record<string, import('../config/balance').SurfaceType[]> = {
  wheeled: [],
  tracked: ['oil', 'sludge'],
  hover: ['oil', 'sludge', 'acidPuddle', 'acidLake', 'snow', 'ice'],
};

export function spawnCar(options: CarSpawnOptions): SpawnedCar {
  const { world, physics, renderer, car, stats } = options;
  const id = world.createEntity();
  const position = new Vec3(options.position.x, options.position.y, options.position.z);
  const body = physics.createCarBody(stats, position, options.yaw);
  body.collisionFilterGroup = 2;
  body.collisionFilterMask = -1;

  const transform = new Transform(new Vec3(position.x, CHASSIS_REST_Y, position.z));
  world.add(id, transform);
  world.add(id, new Physics(body));
  world.add(id, new Chassis(car.chassis, car.chassis === 'hover' ? car.bounce * 1.2 + 0.6 : 0, IMMUNITIES[car.chassis] ?? []));
  const health = new Health(stats.maxHealth);
  world.add(id, health);
  world.add(id, new CarStats(stats));
  world.add(id, new SurfaceState());
  world.add(id, new CarState());
  const lap = new Lap(RACE.totalLaps);
  lap.nextCheckpoint = 1;
  lap.lastCheckpoint = 0;
  world.add(id, lap);
  world.add(id, new RaceStanding());
  world.add(id, new EngineState());
  world.add(id, new VehicleInput());
  world.add(id, new NameTag(options.name, options.isPlayer));
  const maxFront = ammoForFront(car.front, options.ammoLevel);
  const maxRear = ammoForRear(car.rear, options.ammoLevel);
  const maxBoost = ammoForBoost(car.boost, options.ammoLevel);
  world.add(id, new Weapon(car.front, car.rear, car.boost, maxFront, maxRear, maxBoost));

  const visual = renderer.createCarVisual(options.mainColor, options.accentColor, car.chassis);
  visual.position.set(position.x, CHASSIS_REST_Y, position.z);
  renderer.add(visual);
  const render = new Render('car', visual);
  world.add(id, render);

  return { id, visual, body };
}
