import { Quaternion, Vec3 } from 'cannon-es';
import {
  SURFACES,
  TRACK_LAYOUTS,
  ZONES,
  type SurfaceType,
  type TrackLayout,
  type ZoneId,
  type ZoneSpec,
} from '../config/balance';
import { buildTerrain, pickBridge, type TrackBridge, type TrackTerrain } from './terrain';

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
  /** Направление трассы в точке: по нему наклоняется пятно на уклоне. */
  tangent: Vec3;
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
  layout: TrackLayout;
  waypoints: Waypoint[];
  width: number;
  length: number;
  /** Перепад высот трассы (м). */
  elevation: number;
  /** Есть ли сплошная земля под трассой (иначе — обрыв в бездну). */
  solidGround: boolean;
  /** Ландшафт вокруг горной трассы (null — ровная земля или пропасть). */
  terrain: TrackTerrain | null;
  /** Участок полотна, проходящий по мосту над ущельем. */
  bridge: TrackBridge | null;
  checkpoints: number[];
  hazards: HazardZone[];
  boostPads: BoostPad[];
  ramps: RampZone[];
  pickups: PickupSpot[];
};

/** y — высота полотна в этой точке сплайна (0 — ровная трасса). */
type ControlPoint = { x: number; z: number; y?: number };

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

/**
 * Второй ландшафт: горный серпантин с подъёмами и спусками.
 * Кольцо возвращается на старт с тем же перепадом высот, что и ушло.
 */
const SERPENTINE_POINTS: ControlPoint[] = [
  { x: 0, z: 0, y: 0 },
  { x: 120, z: -10, y: 3 },
  { x: 220, z: 20, y: 12 },
  { x: 280, z: 90, y: 22 },
  { x: 250, z: 160, y: 19 },
  { x: 170, z: 190, y: 6 },
  { x: 120, z: 260, y: -4 },
  { x: 180, z: 330, y: 9 },
  { x: 100, z: 380, y: 22 },
  { x: 10, z: 340, y: 16 },
  { x: -40, z: 270, y: 0 },
  { x: -120, z: 250, y: -10 },
  { x: -180, z: 180, y: -3 },
  { x: -140, z: 110, y: 8 },
  { x: -200, z: 50, y: 3 },
  { x: -110, z: 10, y: 0 },
];

function catmullRom(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, t: number): ControlPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  const y = (p: ControlPoint) => p.y ?? 0;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
    y: 0.5 * (2 * y(p1) + (-y(p0) + y(p2)) * t + (2 * y(p0) - 5 * y(p1) + 4 * y(p2) - y(p3)) * t2 + (-y(p0) + 3 * y(p1) - 3 * y(p2) + y(p3)) * t3),
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

/**
 * Ограничивает минимальный радиус поворота осевой линии.
 *
 * Полотно шириной W не может повернуть с радиусом меньше W: внутренняя
 * кромка в таком месте разворачивается назад, лента дороги складывается
 * сама на себя, и асфальт «уходит под землю». Локальное усреднение
 * соседних точек округляет только слишком острые изломы, остальную
 * геометрию трассы не трогает.
 */
function relaxCenterline(points: ControlPoint[], width: number): ControlPoint[] {
  const minRadius = width;
  const count = points.length;
  let current = points.map((point) => ({ ...point }));
  for (let iteration = 0; iteration < 120; iteration += 1) {
    let changed = false;
    const next = current.map((point) => ({ ...point }));
    for (let i = 0; i < count; i += 1) {
      const a = current[(i - 1 + count) % count] as ControlPoint;
      const b = current[i] as ControlPoint;
      const c = current[(i + 1) % count] as ControlPoint;
      const ab = Math.hypot(b.x - a.x, b.z - a.z);
      const bc = Math.hypot(c.x - b.x, c.z - b.z);
      const ca = Math.hypot(a.x - c.x, a.z - c.z);
      const twiceArea = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
      if (twiceArea < 1e-5 || ab < 1e-4 || bc < 1e-4 || ca < 1e-4) continue;
      const radius = (ab * bc * ca) / (2 * twiceArea);
      if (radius >= minRadius) continue;
      const strength = Math.min(0.4, (minRadius - radius) / minRadius + 0.05);
      next[i] = {
        x: b.x + ((a.x + c.x) / 2 - b.x) * strength,
        z: b.z + ((a.z + c.z) / 2 - b.z) * strength,
        y: b.y,
      };
      changed = true;
    }
    current = next;
    if (!changed) break;
  }
  return current;
}

/** Пересэмплирует замкнутый контур с равномерным шагом по длине дуги. */
function resampleCenterline(points: ControlPoint[], spacing: number): ControlPoint[] {
  const count = points.length;
  if (count < 3) return points;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const a = points[i] as ControlPoint;
    const b = points[(i + 1) % count] as ControlPoint;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  const steps = Math.max(count, Math.round(total / spacing));
  const step = total / steps;
  const result: ControlPoint[] = [];
  let segment = 0;
  let segmentStart = points[0] as ControlPoint;
  let segmentEnd = points[1 % count] as ControlPoint;
  let segmentLength = Math.hypot(segmentEnd.x - segmentStart.x, segmentEnd.z - segmentStart.z);
  let walked = 0;
  for (let i = 0; i < steps; i += 1) {
    const target = i * step;
    while (walked + segmentLength < target && segment < count - 1) {
      walked += segmentLength;
      segment += 1;
      segmentStart = points[segment] as ControlPoint;
      segmentEnd = points[(segment + 1) % count] as ControlPoint;
      segmentLength = Math.hypot(segmentEnd.x - segmentStart.x, segmentEnd.z - segmentStart.z);
    }
    const t = segmentLength > 1e-5 ? Math.min(1, (target - walked) / segmentLength) : 0;
    result.push({
      x: segmentStart.x + (segmentEnd.x - segmentStart.x) * t,
      z: segmentStart.z + (segmentEnd.z - segmentStart.z) * t,
      y: (segmentStart.y ?? 0) + ((segmentEnd.y ?? 0) - (segmentStart.y ?? 0)) * t,
    });
  }
  return result;
}

function computeWaypoints(points: ControlPoint[], width: number, hasWalls: boolean): Waypoint[] {
  const count = points.length;
  const waypoints: Waypoint[] = [];
  let total = 0;
  const positions = points.map((p) => new Vec3(p.x, p.y ?? 0, p.z));

  for (let i = 0; i < count; i += 1) {
    const prev = positions[(i - 1 + count) % count] as Vec3;
    const current = positions[i] as Vec3;
    const next = positions[(i + 1) % count] as Vec3;
    const tangent = next.vsub(prev);
    if (tangent.lengthSquared() < 1e-6) tangent.set(0, 0, 1);
    tangent.normalize();
    // right — строго горизонтальная ось: по ней строятся отбойники, стены и решётка.
    const right = new Vec3(tangent.z, 0, -tangent.x);
    if (right.lengthSquared() < 1e-6) right.set(1, 0, 0);
    right.normalize();
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
      // Тангенсы соседних точек различаются на всём участке prev..next,
      // поэтому делить нужно на его длину, а не на один сегмент.
      const ds = Math.max(0.5, prev.position.distanceTo(next.position));
      // Кривизна считается по горизонтальной проекции: уклон не должен
      // заставлять ИИ тормозить перед каждым подъёмом.
      const prevH = Math.hypot(prev.tangent.x, prev.tangent.z) || 1;
      const nextH = Math.hypot(next.tangent.x, next.tangent.z) || 1;
      const px = prev.tangent.x / prevH;
      const pz = prev.tangent.z / prevH;
      const nx = next.tangent.x / nextH;
      const nz = next.tangent.z / nextH;
      const crossY = pz * nx - px * nz;
      const dot = Math.max(-1, Math.min(1, px * nx + pz * nz));
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
      hazards.push({
        surface: 'sludge',
        center: wp.position.clone().vadd(wp.right.scale(2)),
        tangent: wp.tangent.clone(),
        radius: zone.width * 0.45,
      });
    }
  }
  if (zone.id === 3) {
    for (const f of [0.18, 0.47, 0.79]) {
      const wp = at(f);
      hazards.push({
        surface: 'acidPuddle',
        center: wp.position.clone(),
        tangent: wp.tangent.clone(),
        radius: zone.width * 0.28,
      });
    }
    for (const f of [0.05, 0.3, 0.55, 0.85]) {
      const wp = at(f);
      hazards.push({
        surface: 'acidLake',
        center: wp.position.clone().vadd(wp.right.scale(zone.width * 0.85)),
        tangent: wp.tangent.clone(),
        radius: zone.width * 0.55,
      });
      hazards.push({
        surface: 'acidLake',
        center: wp.position.clone().vadd(wp.right.scale(-zone.width * 0.9)),
        tangent: wp.tangent.clone(),
        radius: zone.width * 0.5,
      });
    }
  }
  if (zone.id === 4) {
    for (const f of [0.12, 0.36, 0.61, 0.86]) {
      const wp = at(f);
      hazards.push({
        surface: 'oil',
        center: wp.position.clone(),
        tangent: wp.tangent.clone(),
        radius: zone.width * 0.3,
      });
    }
  }
  if (zone.id === 5) {
    for (const f of [0.1, 0.4, 0.7, 0.9]) {
      const wp = at(f);
      hazards.push({
        surface: 'snow',
        center: wp.position.clone().vadd(wp.right.scale(-2)),
        tangent: wp.tangent.clone(),
        radius: zone.width * 0.4,
      });
    }
    for (const f of [0.25, 0.55, 0.8]) {
      const wp = at(f);
      hazards.push({
        surface: 'ice',
        center: wp.position.clone(),
        tangent: wp.tangent.clone(),
        radius: zone.width * 0.3,
      });
    }
  }
  if (zone.id === 6) {
    for (const f of [0.08, 0.28, 0.52, 0.76]) {
      const wp = at(f);
      hazards.push({
        surface: 'lava',
        center: wp.position.clone().vadd(wp.right.scale(zone.width * 0.9)),
        tangent: wp.tangent.clone(),
        radius: zone.width * 0.5,
      });
      hazards.push({
        surface: 'lava',
        center: wp.position.clone().vadd(wp.right.scale(-zone.width * 0.9)),
        tangent: wp.tangent.clone(),
        radius: zone.width * 0.5,
      });
    }
  }
  return hazards;
}

function buildBoostPads(zone: ZoneSpec, waypoints: Waypoint[], layout: TrackLayout): BoostPad[] {
  if (zone.id === 1 && layout === 'flat') return [];
  const count = waypoints.length;
  const fractions =
    layout === 'hills' ? [0.12, 0.42, 0.68, 0.92] : zone.id === 2 ? [0.08, 0.34, 0.62, 0.9] : [0.15, 0.5, 0.83];
  return fractions.map((f) => {
    const wp = waypoints[Math.floor(count * f) % count] as Waypoint;
    return { center: wp.position.clone(), tangent: wp.tangent.clone(), radius: 3.4 };
  });
}

function buildRamps(zone: ZoneSpec, waypoints: Waypoint[], layout: TrackLayout): RampZone[] {
  if (layout === 'hills') {
    const count = waypoints.length;
    return [0.22, 0.5, 0.76].map((f) => {
      const wp = waypoints[Math.floor(count * f) % count] as Waypoint;
      return { center: wp.position.clone(), tangent: wp.tangent.clone(), halfLength: 6, halfWidth: Math.min(6, zone.width / 2 - 1) };
    });
  }
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
    position.y = wp.position.y + 0.6;
    spots.push({ position, active: true });
  }
  return spots;
}

/** Следующая конфигурация трассы по кругу: ровная → с перепадами высот. */
export function nextTrackLayout(current: TrackLayout): TrackLayout {
  const index = TRACK_LAYOUTS.findIndex((entry) => entry.id === current);
  const next = TRACK_LAYOUTS[(index + 1) % TRACK_LAYOUTS.length];
  return next?.id ?? TRACK_LAYOUTS[0]?.id ?? 'flat';
}

export function buildTrack(zoneId: ZoneId, layout: TrackLayout = 'flat'): TrackDefinition {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) throw new Error(`Unknown zone ${zoneId}`);
  const controls = layout === 'hills' ? SERPENTINE_POINTS : CONTROL_POINTS[zoneId];
  const sampled = sampleCenterline(controls);
  const smoothed = relaxCenterline(sampled, zone.width);
  const samples = resampleCenterline(smoothed, 4.5);
  const waypoints = computeWaypoints(samples, zone.width, true);
  let length = 0;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < waypoints.length; i += 1) {
    const a = waypoints[i] as Waypoint;
    const b = waypoints[(i + 1) % waypoints.length] as Waypoint;
    length += a.position.distanceTo(b.position);
    minY = Math.min(minY, a.position.y);
    maxY = Math.max(maxY, a.position.y);
  }

  // Серпантин целиком огорожен — с горки нельзя улететь в пропасть.
  // В зонах с обрывами стены только на отдельных участках (GDD §6).
  if (layout === 'hills') {
    for (const wp of waypoints) wp.hasWalls = true;
  } else if (zone.hasCliffs) {
    for (const wp of waypoints) {
      wp.hasWalls = wp.index % 11 < 2;
    }
  }

  // 12 чекпоинтов на круг, старт/финиш — индекс 0.
  const checkpointStep = Math.max(1, Math.floor(waypoints.length / 12));
  const checkpoints: number[] = [];
  for (let i = 0; i < 12; i += 1) checkpoints.push((i * checkpointStep) % waypoints.length);

  const hazards = buildHazards(zone, waypoints);
  const boostPads = buildBoostPads(zone, waypoints, layout);
  const ramps = buildRamps(zone, waypoints, layout);
  const pickups = buildPickups(waypoints, zone.width);

  // Горная трасса лежит на собственном рельефе: земля строится вокруг
  // полотна, а на самом высоком участке перекинут мост через ущелье.
  const bridge = layout === 'hills' ? pickBridge(waypoints) : null;
  const terrain = layout === 'hills' ? buildTerrain(waypoints, zone.width, bridge) : null;

  return {
    zone,
    layout,
    waypoints,
    width: zone.width,
    length,
    elevation: Number.isFinite(minY) && Number.isFinite(maxY) ? maxY - minY : 0,
    solidGround: layout === 'flat' && !zone.hasCliffs,
    terrain,
    bridge,
    checkpoints,
    hazards,
    boostPads,
    ramps,
    pickups,
  };
}

const WORLD_UP = new Vec3(0, 1, 0);

/** Нормаль дорожного полотна в точке сплайна (с учётом продольного уклона). */
export function surfaceNormalFromTangent(tangent: Vec3): Vec3 {
  const normal = new Vec3(
    -tangent.y * tangent.x,
    tangent.x * tangent.x + tangent.z * tangent.z,
    -tangent.y * tangent.z,
  );
  if (normal.lengthSquared() < 1e-8) normal.set(0, 1, 0);
  normal.normalize();
  return normal;
}

/**
 * Наклон плоскости полотна: только нормаль, без рыскания.
 * Подходит для круглых декалей (пятна, лужи), которым поворот не важен.
 */
export function surfaceTiltQuaternion(tangent: Vec3): Quaternion {
  return new Quaternion().setFromVectors(WORLD_UP, surfaceNormalFromTangent(tangent));
}

/**
 * Полная ориентация полотна: рыскание вдоль трассы + наклон по уклону.
 * Нужна прямоугольным объектам — ускорителям, трамплинам, воротам.
 */
export function surfaceQuaternionFromTangent(tangent: Vec3): Quaternion {
  const yaw = Math.atan2(tangent.x, tangent.z);
  const pitch = Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z));
  const yawQ = new Quaternion().setFromEuler(0, yaw, 0);
  return yawQ.mult(new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), -pitch));
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
    grid.push({ position: new Vec3(position.x, position.y + 0.8, position.z), yaw });
  }
  return grid;
}
