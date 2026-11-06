import type { ChassisType, UpgradeLevel, PilotSpec } from './balance';
import { PILOTS, PILOT_MODS, UPGRADE_MODS } from './balance';

export type FrontWeaponType = 'scrapVulcan' | 'rockets' | 'heatDrones';
export type RearWeaponType = 'oilSlick' | 'spikeMine' | 'cassette';
export type BoostType = 'jumpJets' | 'nitro';

export type CarSpec = {
  id: string;
  name: string;
  price: number;
  chassis: ChassisType;
  mass: number;
  maxSpeed: number;
  acceleration: number;
  grip: number;
  health: number;
  jumpForce: number;
  bounce: number;
  front: FrontWeaponType;
  rear: RearWeaponType;
  boost: BoostType;
  description: string;
};

export const CARS: CarSpec[] = [
  {
    id: 'scrap-buggy',
    name: 'Скрап-Багги',
    price: 18000,
    chassis: 'wheeled',
    mass: 900,
    maxSpeed: 28,
    acceleration: 12,
    grip: 0.85,
    health: 100,
    jumpForce: 7,
    bounce: 0.55,
    front: 'scrapVulcan',
    rear: 'oilSlick',
    boost: 'jumpJets',
    description: 'Медленный, но верткий каркасный багги.',
  },
  {
    id: 'rust-interceptor',
    name: 'Ржавый Перехватчик',
    price: 18000,
    chassis: 'wheeled',
    mass: 1400,
    maxSpeed: 34,
    acceleration: 15,
    grip: 0.65,
    health: 120,
    jumpForce: 7,
    bounce: 0.55,
    front: 'scrapVulcan',
    rear: 'oilSlick',
    boost: 'jumpJets',
    description: 'Стартовая классика, тяжёлый маслкар. Быстрее, но скользит.',
  },
  {
    id: 'aero-collector',
    name: 'Аэро-Собиратель',
    price: 70000,
    chassis: 'wheeled',
    mass: 1200,
    maxSpeed: 40,
    acceleration: 17,
    grip: 0.8,
    health: 110,
    jumpForce: 7,
    bounce: 0.55,
    front: 'rockets',
    rear: 'spikeMine',
    boost: 'nitro',
    description: 'Аэродинамичный дальнобойщик с обтекателями.',
  },
  {
    id: 'juggernaut',
    name: 'Гусеничный Джаггернаут',
    price: 110000,
    chassis: 'tracked',
    mass: 2500,
    maxSpeed: 26,
    acceleration: 9,
    grip: 1.0,
    health: 200,
    jumpForce: 6,
    bounce: 0.4,
    front: 'rockets',
    rear: 'cassette',
    boost: 'nitro',
    description: 'Танк на гусеницах. Игнорирует нефть и слизь.',
  },
  {
    id: 'hover-rig',
    name: 'Ховер-Риг',
    price: 130000,
    chassis: 'hover',
    mass: 1600,
    maxSpeed: 38,
    acceleration: 20,
    grip: 0.9,
    health: 130,
    jumpForce: 8,
    bounce: 0.3,
    front: 'heatDrones',
    rear: 'cassette',
    boost: 'nitro',
    description: 'Ховеркрафт на воздушной подушке. Парит над рельефом.',
  },
];

export function getCar(id: string): CarSpec {
  const car = CARS.find((c) => c.id === id);
  if (!car) throw new Error(`Unknown car: ${id}`);
  return car;
}

export type UpgradeState = Record<'engine' | 'body' | 'tires' | 'suspension' | 'weapons', UpgradeLevel>;

export type ComputedStats = {
  acceleration: number;
  maxSpeed: number;
  grip: number;
  jumpForce: number;
  bounce: number;
  mass: number;
  maxHealth: number;
};

export function pilotMultipliers(pilot: PilotSpec) {
  const [accel, speed, cornering, jump] = pilot.stats;
  return {
    acceleration: 1 + PILOT_MODS.acceleration * (accel - 1),
    maxSpeed: 1 + PILOT_MODS.maxSpeed * (speed - 1),
    grip: 1 + PILOT_MODS.grip * (cornering - 1),
    jumpForce: 1 + PILOT_MODS.jumpForce * (jump - 1),
  };
}

export function computeStats(car: CarSpec, upgrades: UpgradeState, pilot: PilotSpec): ComputedStats {
  const pm = pilotMultipliers(pilot);
  const engine = UPGRADE_MODS.engine;
  const body = UPGRADE_MODS.body;
  const tires = UPGRADE_MODS.tires;
  const susp = UPGRADE_MODS.suspension;

  const engineSpeed = engine.maxSpeed[upgrades.engine] ?? 1;
  const engineAccel = engine.acceleration[upgrades.engine] ?? 1;
  const bodyHp = body.maxHealth[upgrades.body] ?? 0;
  const tireGrip = car.chassis === 'wheeled' ? (tires.grip[upgrades.tires] ?? 0) : 0;
  const suspBounce = susp.bounce[upgrades.suspension] ?? 1;

  return {
    acceleration: car.acceleration * engineAccel * pm.acceleration,
    maxSpeed: car.maxSpeed * engineSpeed * pm.maxSpeed,
    grip: car.grip * pm.grip + tireGrip,
    jumpForce: car.jumpForce * pm.jumpForce,
    bounce: car.bounce * suspBounce,
    mass: car.mass,
    maxHealth: car.health + bodyHp,
  };
}

export const PILOT_LIST = PILOTS;
