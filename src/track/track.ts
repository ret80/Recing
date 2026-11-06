import { Vec3 } from 'cannon-es';
import { SURFACES, ZONES, type SurfaceType, type ZoneId, type ZoneSpec } from '../config/balance';

export type Waypoint = {
  index: number;
  position: Vec3;
  tangent: Vec3;
  right: Vec3;
  curvature: number;
  signedCurvature: number;
  hasWalls: boolean;
  racingLine: Vec3;
  distance: number;
};

export type HazardZone = {
  surface: SurfaceType;
  center: Vec3;
  radius: number;
};

export type BoostPad = {
  center: Vec3;
  tangent: Vec3;
  radius: number;
};

export type RampZone = {
  center: Vec3;
  tangent: Vec3;
  halfLength: number;
  halfWidth: number;
};

export type PickupSpot = {
  position: Vec3;
  active: boolean;
};

export type TrackDefinition = {
  zone: ZoneSpec;
  waypoints: Waypoint[];
  width: number;
  length: number;
  checkpoints: number[];
  hazards: HazardZone[];
  boostPads: BoostPad[];
  ramps: RampZone[];
  pickups: PickupSpot[];
};

type ControlPoint = { x: number; z: number };

const CONTROL_POINTS: Record<ZoneId, ControlPoint[]> = {
  1: [
    { x: 0, z: 0 },
    { x: 180, z: 0 },
    { x: 260, z: 40 },
    { x: 300, z: 120 },
    { x: 260, z: 200 },
    { x: 180, z: 240 },
    { x: 120, z: 200 },
    { x: 80, z: 130 },
    { x: 40, z: 160 },
    { x: -40, z: 140 },
    { x: -80, z: 60 },
    { x: -40, z: 20 },
  ],
  2: [
    { x: 0, z: 0 },
    { x: 140, z: -20 },
    { x: 240, z: 20 },
    { x: 260, z: 110 },
    { x: 180, z: 140 },
    { x: 200, z: 220 },
    { x: 280, z: 270 },
    { x: 240, z: 350 },
    { x: 120, z: 360 },
    { x: 40, z: 300 },
    { x: -40, z: 320 },
    { x: -100, z: 250 },
    { x: -60, z: 160 },
    { x: -120, z: 90 },
    { x: -60, z: 30 },
  ],
  3: [
    { x: 0, z: 0 },
    { x: 160, z: 10 },
    { x: 250, z: 80 },
    { x: 230, z: 180 },
    { x: 140, z: 210 },
    { x: 80, z: 160 },
    { x: 20, z: 220 },
    { x: -60, z: 260 },
    { x: -140, z: 200 },
    { x: -120, z: 100 },
    { x: -200, z: 40 },
    { x: -120, z: -20 },
  ],
  4: [
    { x: 0, z: 0 },
    { x: 200, z: -30 },
    { x: 320, z: 20 },
    { x: 400, z: 120 },
    { x: 360, z: 230 },
    { x: 260, z: 280 },
    { x: 180, z: 230 },
    { x: 120, z: 300 },
    { x: 20, z: 320 },
    { x: -80, z: 260 },
    { x: -60, z: 160 },
    { x: -140, z: 90 },
    { x: -80, z: 20 },
  ],
  5: [
    { x: 0, z: 0 },
    { x: 160, z: 0 },
    { x: 240, z: 60 },
    { x: 220, z: 140 },
    { x: 140, z: 160 },
    { x: 100, z: 240 },
    { x: 160, z: 300 },
    { x: 80, z: 350 },
    { x: -20, z: 320 },
    { x: -80, z: 240 },
    { x: -160, z: 220 },
    { x: -200, z: 140 },
    { x: -120, z: 80 },
    { x: -160, z: 20 },
    { x: -60, z: -30 },
  ],
  6: [
    { x: 0, z: 0 },
    { x: 150, z: -20 },
    { x: 260, z: 30 },
    { x: 300, z: 130 },
    { x: 220, z: 180 },
    { x: 260, z: 280 },
    { x: 160, z: 340 },
    { x: 40, z: 300 },
    { x: -40, z: 340 },
    { x: -140, z: 280 },
    { x: -160, z: 180 },
    { x: -240, z: 140 },
    { x: -200, z: 50 },
    { x: -120, z: 20 },
    { x: -140, z: -40 },
  ],
};

function catmullRom(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, t: number): ControlPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

function sampleCenterline(points: ControlPoint[]): ControlPoint[] {
  const out: ControlPoint[] = [];
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    const p0 = points[(i - 1 + count) % count] as ControlPoint;
    const p1 = points[i] as ControlPoint;
    const p2 = points[(i + 1) % count] as ControlPoint;
    const p3 = points[(i + 2) % count] as ControlPoint;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const segmentLength = Math.hypot(dx, dz);
    const steps = Math.max(5, Math.ceil(segmentLength / 4.5));
    for (let s = 0; s < steps; s += 1) {
      out.push(catmullRom(p0, p1, p2, p3, s / steps));
    }
  }
  return out;
}

function computeWaypoints(points: ControlPoint[], width: number, hasWalls: boolean): Waypoint[] {
  const count = points.length;
  const waypoints: Waypoint[] = [];
  let total = 0;
  const positions = points.map((p) => new Vec3(p.x, 0, p.z));

  for (let i = 0; i < count; i += 1) {
    const prev = positions[(i - 1 + count) % count] as Vec3;
    const current = positions[i] as Vec3;
    const next = positions[(i + 1) % count] as Vec3;
    const tangent = next.vsub(prev);
    tangent.y = 0;
    if (tangent.lengthSquared() < 1e-6) tangent.set(0, 0, 1);
    tangent.normalize();
    const right = new Vec3(tangent.z, 0, -tangent.x);
    const segmentLength = current.distanceTo(next);
    total += segmentLength;
    waypoints.push({
      index: i,
      position: current.clone(),
      tangent,
      right,
      curvature: 0,
      signedCurvature: 0,
      hasWalls,
      racingLine: current.clone(),
      distance: total,
    });
  }

  // Кривизна и «идеальная траектория» (GDD §3, §7).
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < waypoints.length; i += 1) {
      const prev = waypoints[(i - 1 + waypoints.length) % waypoints.length] as Waypoint;
      const current = waypoints[i] as Waypoint;
      const next = waypoints[(i + 1) % waypoints.length] as Waypoint;
      const ds = Math.max(0.5, current.position.distanceTo(next.position));
      const crossY = prev.tangent.z * next.tangent.x - prev.tangent.x * next.tangent.z;
      const dot = Math.max(-1, Math.min(1, prev.tangent.dot(next.tangent)));
      const angle = Math.acos(dot);
      const signed = (crossY >= 0 ? 1 : -1) * angle;
      current.signedCurvature = signed / ds;
      current.curvature = Math.abs(signed) / ds;
    }
  }

  for (const wp of waypoints) {
    const maxOffset = Math.min(4, Math.max(1.5, width / 2 - 3));
    const offset = Math.max(-maxOffset, Math.min(maxOffset, wp.signedCurvature * 60));
    wp.racingLine = wp.position.clone().vadd(wp.right.scale(offset));
  }

  return waypoints;
}

function buildHazards(zone: ZoneSpec, waypoints: Waypoint[]): HazardZone[] {
  const hazards: HazardZone[] = [];
  const count = waypoints.length;
  const at = (fraction: number) => waypoints[Math.floor(count * fraction) % count] as Waypoint;

  if (zone.id === 2) {
    for (const f of [0.14, 0.43, 0.72]) {
      const wp = at(f);
      hazards.push({ surface: 'sludge', center: wp.position.clone().vadd(wp.right.scale(2)), radius: zone.width * 0.45 });
    }
  }
  if (zone.id === 3) {
    for (const f of [0.18, 0.47, 0.79]) {
      const wp = at(f);
      hazards.push({ surface: 'acidPuddle', center: wp.position.clone(), radius: zone.width * 0.28 });
    }
    for (const f of [0.05, 0.3, 0.55, 0.85]) {
      const wp = at(f);
      hazards.push({ surface: 'acidLake', center: wp.position.clone().vadd(wp.right.scale(zone.width * 0.85)), radius: zone.width * 0.55 });
      hazards.push({ surface: 'acidLake', center: wp.position.clone().vadd(wp.right.scale(-zone.width * 0.9)), radius: zone.width * 0.5 });
    }
  }
  if (zone.id === 4) {
    for (const f of [0.12, 0.36, 0.61, 0.86]) {
      const wp = at(f);
      hazards.push({ surface: 'oil', center: wp.position.clone(), radius: zone.width * 0.3 });
    }
  }
  if (zone.id === 5) {
    for (const f of [0.1, 0.4, 0.7, 0.9]) {
      const wp = at(f);
      hazards.push({ surface: 'snow', center: wp.position.clone().vadd(wp.right.scale(-2)), radius: zone.width * 0.4 });
    }
    for (const f of [0.25, 0.55, 0.8]) {
      const wp = at(f);
      hazards.push({ surface: 'ice', center: wp.position.clone(), radius: zone.width * 0.3 });
    }
  }
  if (zone.id === 6) {
    for (const f of [0.08, 0.28, 0.52, 0.76]) {
      const wp = at(f);
      hazards.push({ surface: 'lava', center: wp.position.clone().vadd(wp.right.scale(zone.width * 0.9)), radius: zone.width * 0.5 });
      hazards.push({ surface: 'lava', center: wp.position.clone().vadd(wp.right.scale(-zone.width * 0.9)), radius: zone.width * 0.5 });
    }
  }
  return hazards;
}

function buildBoostPads(zone: ZoneSpec, waypoints: Waypoint[]): BoostPad[] {
  if (zone.id === 1) return [];
  const count = waypoints.length;
  const fractions = zone.id === 2 ? [0.08, 0.34, 0.62, 0.9] : [0.15, 0.5, 0.83];
  return fractions.map((f) => {
    const wp = waypoints[Math.floor(count * f) % count] as Waypoint;
    return { center: wp.position.clone(), tangent: wp.tangent.clone(), radius: 3.4 };
  });
}

function buildRamps(zone: ZoneSpec, waypoints: Waypoint[]): RampZone[] {
  if (!zone.hasCliffs) return [];
  const count = waypoints.length;
  const fractions = zone.id === 6 ? [0.2, 0.45, 0.66, 0.88] : [0.27, 0.6];
  return fractions.map((f) => {
    const wp = waypoints[Math.floor(count * f) % count] as Waypoint;
    return {
      center: wp.position.clone(),
      tangent: wp.tangent.clone(),
      halfLength: 6,
      halfWidth: Math.min(6, zone.width / 2 - 1),
    };
  });
}

function buildPickups(waypoints: Waypoint[], width: number): PickupSpot[] {
  const spots: PickupSpot[] = [];
  const count = waypoints.length;
  for (let i = 0; i < 8; i += 1) {
    const wp = waypoints[Math.floor((count * (i + 0.5)) / 8) % count] as Waypoint;
    const side = i % 2 === 0 ? 1 : -1;
    const position = wp.position.clone().vadd(wp.right.scale(side * (width / 2 - 2)));
    position.y = 0.6;
    spots.push({ position, active: true });
  }
  return spots;
}

export function buildTrack(zoneId: ZoneId): TrackDefinition {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) throw new Error(`Unknown zone ${zoneId}`);
  const controls = CONTROL_POINTS[zoneId];
  const samples = sampleCenterline(controls);
  const waypoints = computeWaypoints(samples, zone.width, true);
  let length = 0;
  for (let i = 0; i < waypoints.length; i += 1) {
    const a = waypoints[i] as Waypoint;
    const b = waypoints[(i + 1) % waypoints.length] as Waypoint;
    length += a.position.distanceTo(b.position);
  }

  // В зонах с обрывами стены только на отдельных участках (GDD §6).
  if (zone.hasCliffs) {
    for (const wp of waypoints) {
      wp.hasWalls = wp.index % 11 < 2;
    }
  }

  // 12 чекпоинтов на круг, старт/финиш — индекс 0.
  const checkpointStep = Math.max(1, Math.floor(waypoints.length / 12));
  const checkpoints: number[] = [];
  for (let i = 0; i < 12; i += 1) checkpoints.push((i * checkpointStep) % waypoints.length);

  const hazards = buildHazards(zone, waypoints);
  const boostPads = buildBoostPads(zone, waypoints);
  const ramps = buildRamps(zone, waypoints);
  const pickups = buildPickups(waypoints, zone.width);

  return {
    zone,
    waypoints,
    width: zone.width,
    length,
    checkpoints,
    hazards,
    boostPads,
    ramps,
    pickups,
  };
}

export function waypointAt(track: TrackDefinition, index: number): Waypoint {
  const count = track.waypoints.length;
  const wp = track.waypoints[((index % count) + count) % count];
  if (!wp) throw new Error('Track has no waypoints');
  return wp;
}

export function checkpointPosition(track: TrackDefinition, checkpointIndex: number): Waypoint {
  const wpIndex = track.checkpoints[((checkpointIndex % 12) + 12) % 12];
  if (wpIndex === undefined) throw new Error('Track has no checkpoints');
  return waypointAt(track, wpIndex);
}

export function surfaceAtHazard(track: TrackDefinition, position: Vec3): SurfaceType | null {
  for (const hazard of track.hazards) {
    const dx = hazard.center.x - position.x;
    const dz = hazard.center.z - position.z;
    if (dx * dx + dz * dz <= hazard.radius * hazard.radius) return hazard.surface;
  }
  return null;
}

export function isLethalSurface(surface: SurfaceType): boolean {
  return SURFACES[surface].lethal;
}

export function startingGrid(track: TrackDefinition): { position: Vec3; yaw: number }[] {
  const start = waypointAt(track, 0);
  const yaw = Math.atan2(start.tangent.x, start.tangent.z);
  const grid: { position: Vec3; yaw: number }[] = [];
  const rowSpacing = 6.5;
  const sideSpacing = 3.4;
  for (let i = 0; i < 4; i += 1) {
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    const position = start.position
      .clone()
      .vadd(start.tangent.scale(-(6 + row * rowSpacing)))
      .vadd(start.right.scale(side * sideSpacing));
    grid.push({ position: new Vec3(position.x, 0.8, position.z), yaw });
  }
  return grid;
}
