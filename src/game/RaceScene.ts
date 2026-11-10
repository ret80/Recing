import { Vec3 } from 'cannon-es';
import { Transform } from 'ogl';
import { SURFACES, ZONES, type ZoneSpec } from '../config/balance';
import { PhysicsWorld } from '../physics/physicsWorld';
import { buildTrackColliders } from '../physics/trackCollision';
import { GameRenderer, type ProfilePoint } from '../render/renderer';
import {
  surfaceNormalFromTangent,
  surfaceQuaternionFromTangent,
  surfaceTiltQuaternion,
  type TrackDefinition,
  type Waypoint,
} from '../track/track';

const COLORS = {
  wall: 0x4a3b2f,
  wallSnow: 0xdfe9f2,
  gate: 0xffb347,
  finish: 0xffe066,
  boost: 0x2fd2ff,
  ramp: 0x7a5a3a,
};

/**
 * Геометрия статики трассы. Полотно всегда лежит выше земли: у дороги
 * приподнятый асфальт и обочины, спускающиеся вниз, поэтому на повороте
 * асфальт физически не может «уйти под землю».
 */
const TRACK_GEOMETRY = {
  /** Отбойник стоит за кромкой полотна (м). */
  wallOffset: 0.8,
  wallHeight: 1.35,
  wallThickness: 0.16,
  wallCap: 0.2,
  wallFlare: 0.28,
  /** Насколько отбойник утоплен в полотно (м). */
  wallSink: 0.15,
  /** Ширина обочины за кромкой асфальта (м). */
  shoulderWidth: 4.5,
  shoulderDrop: 0.8,
  /** Высота «юбки»-обрыва под обочиной (м). */
  shoulderSkirt: 8,
  /** Прогиб земли под ровным полотном (м). */
  solidGroundDrop: 0.28,
  /** Ширина площадки под обочиной для физики (м). */
  shoulderPhysicsWidth: 4.5,
  /** Вынос стоек ворот за отбойник: ворота не режут геометрию ограждения. */
  gateOffset: 2.4,
  /** Шаг физических секций стен: визуальный меш сплошной, физика дешевле. */
  wallPhysicsStep: 2,
} as const;

function yawOf(wp: Waypoint): number {
  return Math.atan2(wp.tangent.x, wp.tangent.z);
}

function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type WallRun = { indices: number[]; closed: boolean };

/** Строит статическую геометрию и физику трассы. */
export class RaceScene {
  private objects: Transform[] = [];
  private readonly renderer: GameRenderer;
  private readonly physics: PhysicsWorld;

  constructor(renderer: GameRenderer, physics: PhysicsWorld) {
    this.renderer = renderer;
    this.physics = physics;
  }

  clear(): void {
    for (const object of this.objects) this.renderer.remove(object);
    this.objects = [];
  }

  private addObject<T extends Transform>(object: T): T {
    this.renderer.add(object);
    this.objects.push(object);
    return object;
  }

  build(track: TrackDefinition): void {
    const zone = track.zone;
    this.buildLighting(zone);
    this.buildGround(zone, track);
    this.buildRoad(track);
    this.buildWalls(track);
    this.buildHazards(track);
    this.buildBoostPads(track);
    this.buildRamps(track);
    this.buildCheckpoints(track);
    this.buildScenery(zone, track);
  }

  private buildLighting(zone: ZoneSpec): void {
    const sky = zone.palette.sky;
    const fog = new Float32Array([((sky >> 16) & 0xff) / 255, ((sky >> 8) & 0xff) / 255, (sky & 0xff) / 255]);
    const lighting = {
      sunDir: new Float32Array([0.45, 0.8, 0.35]),
      sunColor: new Float32Array([1.0, 0.93, 0.82]),
      ambient: new Float32Array([0.42, 0.4, 0.38]),
      fogColor: fog,
      fogNear: zone.hasCliffs ? 70 : 120,
      fogFar: zone.hasCliffs ? 300 : 460,
    };
    this.renderer.setLighting(lighting, sky);
  }

  private buildGround(zone: ZoneSpec, track: TrackDefinition): void {
    if (track.solidGround) {
      const ground = this.renderer.plane(2600, 2600, zone.palette.ground);
      ground.position.set(0, -TRACK_GEOMETRY.solidGroundDrop, 0);
      this.addObject(ground);
      this.physics.addGroundPlane(-TRACK_GEOMETRY.solidGroundDrop);
      return;
    }
    // Бездонная пропасть: визуальная «подложка» далеко внизу. Рядом с
    // полотном землю строят обочины (buildRoad), а не бесконечная плоскость.
    const abyss = this.renderer.plane(4000, 4000, 0x1a1110);
    abyss.position.set(0, -60, 0);
    this.addObject(abyss);
  }

  private buildRoad(track: TrackDefinition): void {
    const road = this.renderer.createTrackRibbon(track.waypoints, track.width, track.zone.palette.road);
    this.addObject(road);

    const half = track.width / 2;
    if (!track.solidGround) {
      // Обочина начинается ровно у кромки асфальта — без наложения лент,
      // которое раньше давало «землю поверх трассы» на поворотах.
      const left: ProfilePoint[] = [
        { offset: -(half + TRACK_GEOMETRY.shoulderWidth), y: -TRACK_GEOMETRY.shoulderSkirt },
        { offset: -(half + TRACK_GEOMETRY.shoulderWidth), y: -TRACK_GEOMETRY.shoulderDrop },
        { offset: -(half + 0.9), y: -0.3 },
        { offset: -half, y: -0.1 },
      ];
      const right: ProfilePoint[] = [
        { offset: half, y: -0.1 },
        { offset: half + 0.9, y: -0.3 },
        { offset: half + TRACK_GEOMETRY.shoulderWidth, y: -TRACK_GEOMETRY.shoulderDrop },
        { offset: half + TRACK_GEOMETRY.shoulderWidth, y: -TRACK_GEOMETRY.shoulderSkirt },
      ];
      const color = track.zone.palette.ground;
      this.addObject(
        this.renderer.createProfileSweep(track.waypoints, left, color, { closedLoop: true }),
      );
      this.addObject(
        this.renderer.createProfileSweep(track.waypoints, right, color, { closedLoop: true }),
      );
    }

    // Физика полотна и обочин: секции перекрываются, поэтому клиновидных
    // щелей на внешней кромке поворота не остаётся.
    buildTrackColliders(this.physics, track);
  }

  /** Непрерывные участки отбойника: группы точек с hasWalls. */
  private wallRuns(track: TrackDefinition): WallRun[] {
    const waypoints = track.waypoints;
    const count = waypoints.length;
    if (count === 0) return [];
    if (waypoints.every((wp) => wp.hasWalls)) {
      return [{ indices: waypoints.map((wp) => wp.index), closed: true }];
    }
    const runs: WallRun[] = [];
    let i = 0;
    while (i < count) {
      const prevHasWalls = (waypoints[(i - 1 + count) % count] as Waypoint).hasWalls;
      const hasWalls = (waypoints[i] as Waypoint).hasWalls;
      if (!hasWalls || prevHasWalls) {
        i += 1;
        continue;
      }
      const indices: number[] = [];
      let j = i;
      while (indices.length < count && (waypoints[j % count] as Waypoint).hasWalls) {
        indices.push(j % count);
        j += 1;
      }
      if (indices.length >= 2) runs.push({ indices, closed: false });
      i = j;
    }
    return runs;
  }

  /**
   * Отбойник строится одним замкнутым мешем вдоль сплайна: на внутренней
   * стороне поворота секции не сбиваются в кучу, на внешней — не расходятся.
   */
  private buildWalls(track: TrackDefinition): void {
    const waypoints = track.waypoints;
    const wallColor = track.zone.id === 5 ? COLORS.wallSnow : COLORS.wall;
    const offset = track.width / 2 + TRACK_GEOMETRY.wallOffset;
    const t = TRACK_GEOMETRY.wallThickness;
    const h = TRACK_GEOMETRY.wallHeight - TRACK_GEOMETRY.wallCap;
    const flare = TRACK_GEOMETRY.wallFlare;
    const sink = TRACK_GEOMETRY.wallSink;
    const local: ProfilePoint[] = [
      { offset: -t, y: 0 },
      { offset: t, y: 0 },
      { offset: t, y: h },
      { offset: flare, y: h + TRACK_GEOMETRY.wallCap },
      { offset: -flare, y: h + TRACK_GEOMETRY.wallCap },
      { offset: -t, y: h },
    ];

    for (const run of this.wallRuns(track)) {
      const points = run.indices.map((index) => waypoints[index] as Waypoint);
      for (const side of [-1, 1]) {
        const profile: ProfilePoint[] =
          side > 0
            ? local.map((point) => ({ offset: offset + point.offset, y: point.y - sink }))
            : local
                .map((point) => ({ offset: -offset - point.offset, y: point.y - sink }))
                .reverse();
        this.addObject(
          this.renderer.createProfileSweep(points, profile, wallColor, {
            closedProfile: true,
            closedLoop: run.closed,
          }),
        );
      }

      // Физика: цепочка секций вдоль тех же точек. Шаг прорежен, но соседние
      // секции перекрываются, поэтому ограждение остаётся непроходимым.
      const step = TRACK_GEOMETRY.wallPhysicsStep;
      const segmentCount = run.closed ? points.length : points.length - 1;
      for (let i = 0; i < segmentCount; i += step) {
        const a = points[i] as Waypoint;
        const nextIndex = run.closed ? (i + step) % points.length : Math.min(i + step, points.length - 1);
        const b = points[nextIndex];
        if (!b) break;
        for (const side of [-1, 1]) {
          const centerA = a.position.clone().vadd(a.right.scale(side * offset));
          const centerB = b.position.clone().vadd(b.right.scale(side * offset));
          this.physics.addWallSegment(centerA, centerB, TRACK_GEOMETRY.wallHeight, 0.36, 1.1);
        }
      }
    }
  }

  /** Круглые декали лежат в плоскости полотна, а не горизонтально. */
  private buildHazards(track: TrackDefinition): void {
    for (const hazard of track.hazards) {
      const spec = SURFACES[hazard.surface];
      const normal = surfaceNormalFromTangent(hazard.tangent);
      const tilt = surfaceTiltQuaternion(hazard.tangent);
      const disc = this.renderer.cylinder(hazard.radius, 0.08, spec.color, 20, {
        emissive: spec.lethal ? 0.45 : 0.15,
      });
      disc.position.set(
        hazard.center.x + normal.x * 0.05,
        hazard.center.y + normal.y * 0.05,
        hazard.center.z + normal.z * 0.05,
      );
      disc.quaternion.set(tilt.x, tilt.y, tilt.z, tilt.w);
      this.addObject(disc);
      if (spec.lethal) {
        const glow = this.renderer.cylinder(hazard.radius * 1.04, 0.04, spec.color, 24, {
          emissive: 0.9,
          opacity: 0.35,
        });
        glow.position.set(
          hazard.center.x + normal.x * 0.1,
          hazard.center.y + normal.y * 0.1,
          hazard.center.z + normal.z * 0.1,
        );
        glow.quaternion.set(tilt.x, tilt.y, tilt.z, tilt.w);
        this.addObject(glow);
      }
    }
  }

  private buildBoostPads(track: TrackDefinition): void {
    for (const pad of track.boostPads) {
      const normal = surfaceNormalFromTangent(pad.tangent);
      const quaternion = surfaceQuaternionFromTangent(pad.tangent);
      const group = this.renderer.box(4.4, 0.09, 2.6, COLORS.boost, { emissive: 0.75 });
      group.position.set(
        pad.center.x + normal.x * 0.07,
        pad.center.y + normal.y * 0.07,
        pad.center.z + normal.z * 0.07,
      );
      group.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      this.addObject(group);
      const arrow = this.renderer.box(1.0, 0.1, 1.6, 0xffffff, { emissive: 1 });
      arrow.position.set(0, 0.08, 0);
      group.addChild(arrow);
    }
  }

  private buildRamps(track: TrackDefinition): void {
    for (const ramp of track.ramps) {
      const normal = surfaceNormalFromTangent(ramp.tangent);
      const quaternion = surfaceQuaternionFromTangent(ramp.tangent);
      const mesh = this.renderer.createRampVisual(ramp.halfWidth * 2, ramp.halfLength * 2, 1.1, COLORS.ramp);
      mesh.position.set(
        ramp.center.x + normal.x * 0.03,
        ramp.center.y + normal.y * 0.03,
        ramp.center.z + normal.z * 0.03,
      );
      mesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      this.addObject(mesh);
    }
  }

  private buildCheckpoints(track: TrackDefinition): void {
    const gateOffset = TRACK_GEOMETRY.gateOffset;
    track.checkpoints.forEach((wpIndex, checkpointIndex) => {
      const wp = track.waypoints[wpIndex];
      if (!wp) return;
      const isFinish = checkpointIndex === 0;
      const color = isFinish ? COLORS.finish : COLORS.gate;
      const group = new Transform();
      group.position.set(wp.position.x, wp.position.y, wp.position.z);
      group.rotation.y = yawOf(wp);
      for (const side of [-1, 1]) {
        const post = this.renderer.box(0.5, 4.2, 0.5, color, { emissive: isFinish ? 0.7 : 0.2 });
        const offset = side * (track.width / 2 + gateOffset);
        post.position.set(offset, 2.1, 0);
        group.addChild(post);
        this.physics.addStaticBox(
          wp.position.x + wp.right.x * offset,
          wp.position.z + wp.right.z * offset,
          0.25,
          2.1,
          0.25,
          yawOf(wp),
          wp.position.y + 2.1,
        );
      }
      const beam = this.renderer.box(track.width + gateOffset * 2, 0.35, 0.35, color, {
        emissive: isFinish ? 0.8 : 0.25,
      });
      beam.position.set(0, 4.3, 0);
      group.addChild(beam);
      this.addObject(group);
    });
  }

  private buildScenery(zone: ZoneSpec, track: TrackDefinition): void {
    const random = seeded(zone.id * 991 + 7);
    const count = track.waypoints.length;
    for (let i = 0; i < 70; i += 1) {
      const wp = track.waypoints[Math.floor(random() * count) % count] as Waypoint;
      const side = random() > 0.5 ? 1 : -1;
      const distance = track.width / 2 + 8 + random() * 34;
      const pos = wp.position.clone().vadd(wp.right.scale(side * distance));
      const width = 1.5 + random() * 7;
      const height = 1 + random() * 11;
      const depth = 1.5 + random() * 7;
      const color = random() > 0.6 ? zone.palette.accent : zone.palette.ground;
      const pile = this.renderer.box(width, height, depth, color);
      const pileYaw = random() * Math.PI;
      const baseY = pos.y - 1.2;
      pile.position.set(pos.x, baseY + height / 2, pos.z);
      pile.rotation.y = pileYaw;
      this.addObject(pile);
      this.physics.addStaticBox(
        pos.x,
        pos.z,
        width / 2,
        height / 2,
        depth / 2,
        pileYaw,
        baseY + height / 2,
      );
    }
    // Дальние «горы»/остовы для силуэта.
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      const radius = 330 + random() * 180;
      const height = 25 + random() * 55;
      const block = this.renderer.box(18 + random() * 30, height, 18 + random() * 30, zone.palette.accent);
      block.position.set(Math.cos(angle) * radius, height / 2 - 8, Math.sin(angle) * radius);
      block.rotation.y = random() * Math.PI;
      this.addObject(block);
    }
  }
}

export function zoneById(zoneId: number): ZoneSpec {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) throw new Error(`Unknown zone ${zoneId}`);
  return zone;
}

export const SCENE_COLORS = COLORS;
export const VEC_UP = new Vec3(0, 1, 0);
