import { Vec3 } from 'cannon-es';
import { Transform } from 'ogl';
import { SURFACES, ZONES, type ZoneSpec } from '../config/balance';
import { PhysicsWorld } from '../physics/physicsWorld';
import { GameRenderer } from '../render/renderer';
import type { TrackDefinition, Waypoint } from '../track/track';

const COLORS = {
  wall: 0x4a3b2f,
  wallSnow: 0xdfe9f2,
  gate: 0xffb347,
  finish: 0xffe066,
  boost: 0x2fd2ff,
  ramp: 0x7a5a3a,
};

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
      ground.position.set(0, -0.06, 0);
      this.addObject(ground);
      this.physics.addGroundPlane(-0.05);
    } else {
      // Бездонная пропасть: визуальная «подложка» далеко внизу.
      const abyss = this.renderer.plane(4000, 4000, 0x1a1110);
      abyss.position.set(0, -60, 0);
      this.addObject(abyss);
      if (track.layout === 'hills') {
        // Горный склон под полотном: широкая обочина, повторяющая рельеф.
        const skirtPoints = track.waypoints.map((wp) => ({ ...wp, position: wp.position.clone() }));
        for (const wp of skirtPoints) wp.position.y -= 0.32;
        const skirt = this.renderer.createTrackRibbon(skirtPoints, track.width * 2.4, zone.palette.ground);
        this.addObject(skirt);
      }
    }
    // Дорожное полотно физически собирается из наклонных боксов вдоль сплайна.
    const count = track.waypoints.length;
    const step = track.waypoints.length > 260 ? 2 : 1;
    for (let i = 0; i < count; i += step) {
      const a = track.waypoints[i] as Waypoint;
      const b = track.waypoints[(i + step) % count] as Waypoint;
      this.physics.addTrackSegment(a.position, b.position, track.width / 2 + 0.6);
    }
  }

  private buildRoad(track: TrackDefinition): void {
    const road = this.renderer.createTrackRibbon(track.waypoints, track.width, track.zone.palette.road);
    this.addObject(road);
  }

  private buildWalls(track: TrackDefinition): void {
    const count = track.waypoints.length;
    const wallColor = track.zone.id === 5 ? COLORS.wallSnow : COLORS.wall;
    const step = 2;
    for (let i = 0; i < count; i += step) {
      const a = track.waypoints[i] as Waypoint;
      const b = track.waypoints[(i + step) % count] as Waypoint;
      if (!a.hasWalls || !b.hasWalls) continue;
      const mid = a.position.clone().vadd(b.position).scale(0.5);
      const length = a.position.distanceTo(b.position) + 0.6;
      const yaw = yawOf(a);
      for (const side of [-1, 1]) {
        const offset = mid.clone().vadd(a.right.scale(side * (track.width / 2 + 0.55)));
        const wall = this.renderer.box(0.7, 2.6, length, wallColor);
        wall.position.set(offset.x, offset.y + 1.3, offset.z);
        wall.rotation.y = yaw;
        this.addObject(wall);
        this.physics.addWall(offset.x, offset.z, length / 2, yaw, 1.4, offset.y);
      }
    }
  }

  private buildHazards(track: TrackDefinition): void {
    for (const hazard of track.hazards) {
      const spec = SURFACES[hazard.surface];
      const disc = this.renderer.cylinder(hazard.radius, 0.08, spec.color, 20, { emissive: spec.lethal ? 0.45 : 0.15 });
      disc.position.set(hazard.center.x, hazard.center.y + 0.07, hazard.center.z);
      this.addObject(disc);
      if (spec.lethal) {
        const glow = this.renderer.cylinder(hazard.radius * 1.04, 0.04, spec.color, 24, { emissive: 0.9, opacity: 0.35 });
        glow.position.set(hazard.center.x, hazard.center.y + 0.12, hazard.center.z);
        this.addObject(glow);
      }
    }
  }

  private buildBoostPads(track: TrackDefinition): void {
    for (const pad of track.boostPads) {
      const yaw = Math.atan2(pad.tangent.x, pad.tangent.z);
      const group = this.renderer.box(4.4, 0.09, 2.6, COLORS.boost, { emissive: 0.75 });
      group.position.set(pad.center.x, pad.center.y + 0.09, pad.center.z);
      group.rotation.y = yaw;
      this.addObject(group);
      const arrow = this.renderer.box(1.0, 0.1, 1.6, 0xffffff, { emissive: 1 });
      arrow.position.set(0, 0.08, 0);
      group.addChild(arrow);
    }
  }

  private buildRamps(track: TrackDefinition): void {
    for (const ramp of track.ramps) {
      const yaw = Math.atan2(ramp.tangent.x, ramp.tangent.z);
      const mesh = this.renderer.createRampVisual(ramp.halfWidth * 2, ramp.halfLength * 2, 1.1, COLORS.ramp);
      mesh.position.set(ramp.center.x, ramp.center.y + 0.03, ramp.center.z);
      mesh.rotation.y = yaw;
      this.addObject(mesh);
    }
  }

  private buildCheckpoints(track: TrackDefinition): void {
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
        const offset = side * (track.width / 2 + 0.4);
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
      const beam = this.renderer.box(track.width + 1.2, 0.35, 0.35, color, { emissive: isFinish ? 0.8 : 0.25 });
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
