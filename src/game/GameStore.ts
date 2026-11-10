import type { GameScreen } from './gameMachine';
import type { TrackLayout, ZoneId } from '../config/balance';
import type { PlayerProfile, GameSettings } from './storage';
import { defaultProfile, defaultSettings } from './storage';

export type HudCar = {
  id: number;
  name: string;
  isPlayer: boolean;
  position: number;
  lap: number;
  health: number;
  maxHealth: number;
  damageLevel: number;
  finished: boolean;
  speed: number;
};

export type RaceResultRow = {
  place: number;
  name: string;
  isPlayer: boolean;
  money: number;
  points: number;
  trophies: number;
  dominance: number;
  scrap: number;
  finished: boolean;
  dnf: boolean;
  lapTimes: number[];
};

export type AppSnapshot = {
  screen: GameScreen;
  zoneId: ZoneId;
  zoneName: string;
  track: TrackLayout;
  /** Показывать ли экранные тач-контролы. */
  touchControls: boolean;
  countdown: number;
  raceTime: number;
  timeLeft: number;
  playerPosition: number;
  lap: number;
  totalLaps: number;
  health: number;
  maxHealth: number;
  damageLevel: 0 | 1 | 2;
  speed: number;
  respawnTimer: number;
  invuln: boolean;
  invulnTimer: number;
  nitroActive: boolean;
  ammoFront: number;
  ammoRear: number;
  ammoBoost: number;
  maxAmmoFront: number;
  maxAmmoRear: number;
  maxAmmoBoost: number;
  standings: HudCar[];
  results: RaceResultRow[] | null;
  profile: PlayerProfile;
  money: number;
  settings: GameSettings;
  subtitle: string;
  seasonFailed: boolean;
  dnf: boolean;
  paused: boolean;
  fps: number;
  /** Открыт ли отладочный оверлей (?debug). */
  debug: boolean;
  /** Настройки отладочных сеток трассы. */
  debugGrid: DebugGridState;
};

export type DebugGridState = {
  road: boolean;
  roadColor: number;
  terrain: boolean;
  terrainColor: number;
};

export function createInitialSnapshot(): AppSnapshot {
  return {
    screen: 'menu',
    zoneId: 1,
    zoneName: '',
    track: 'hills',
    touchControls: false,
    countdown: 0,
    raceTime: 0,
    timeLeft: 360,
    playerPosition: 4,
    lap: 1,
    totalLaps: 4,
    health: 100,
    maxHealth: 100,
    damageLevel: 0,
    speed: 0,
    respawnTimer: 0,
    invuln: false,
    invulnTimer: 0,
    nitroActive: false,
    ammoFront: 0,
    ammoRear: 0,
    ammoBoost: 0,
    maxAmmoFront: 0,
    maxAmmoRear: 0,
    maxAmmoBoost: 0,
    standings: [],
    results: null,
    profile: defaultProfile(),
    money: defaultProfile().money,
    settings: defaultSettings(),
    subtitle: '',
    seasonFailed: false,
    dnf: false,
    paused: false,
    fps: 60,
    debug: false,
    debugGrid: { road: false, roadColor: 0x42ff5a, terrain: false, terrainColor: 0x59c8ff },
  };
}

export class GameStore {
  private snapshot: AppSnapshot = createInitialSnapshot();
  private listeners = new Set<() => void>();

  getSnapshot = (): AppSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(patch: Partial<AppSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  setProfile(profile: PlayerProfile): void {
    this.set({ profile });
  }

  setSettings(settings: GameSettings): void {
    this.set({ settings });
  }
}
