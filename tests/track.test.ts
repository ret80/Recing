import { describe, expect, it } from 'vitest';
import { Vec3 } from 'cannon-es';
import { TRACK_LAYOUTS, ZONES, type ZoneId } from '../src/config/balance';
import {
  buildTrack,
  checkpointPosition,
  isLethalSurface,
  nextTrackLayout,
  startingGrid,
  surfaceAtHazard,
  waypointAt,
} from '../src/track/track';
import { terrainHeightAt } from '../src/track/terrain';

const waypointsAt = (track: ReturnType<typeof buildTrack>) => track.waypoints;

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4, 5, 6];

describe('buildTrack', () => {
  it('builds every zone with a closed loop and 12 checkpoints', () => {
    for (const zoneId of ZONE_IDS) {
      const track = buildTrack(zoneId);
      expect(track.waypoints.length).toBeGreaterThan(60);
      expect(track.length).toBeGreaterThan(100);
      expect(track.checkpoints).toHaveLength(12);
      expect(track.waypoints.every((wp) => Number.isFinite(wp.curvature))).toBe(true);
      expect(track.checkpoints.every((index) => index >= 0 && index < track.waypoints.length)).toBe(true);
    }
  });

  it('places exactly 8 scrap pickups and no more than the GDD cap', () => {
    for (const zoneId of ZONE_IDS) {
      expect(buildTrack(zoneId).pickups).toHaveLength(8);
    }
  });

  it('uses the zone width and boss from the config', () => {
    for (const zone of ZONES) {
      const track = buildTrack(zone.id);
      expect(track.width).toBe(zone.width);
      expect(track.zone.boss).toBe(zone.boss);
    }
  });

  it('walls zone 1 completely and leaves cliff sections open in later zones', () => {
    expect(buildTrack(1).waypoints.every((wp) => wp.hasWalls)).toBe(true);
    for (const zoneId of [2, 4, 6] as ZoneId[]) {
      const walls = buildTrack(zoneId).waypoints.filter((wp) => wp.hasWalls);
      expect(walls.length).toBeGreaterThan(0);
      expect(walls.length).toBeLessThan(buildTrack(zoneId).waypoints.length);
    }
  });

  it('starts the rotation with the elevated track', () => {
    expect(TRACK_LAYOUTS[0]?.id).toBe('hills');
    expect(nextTrackLayout('hills')).toBe('flat');
    expect(nextTrackLayout('flat')).toBe('hills');
  });

  it('builds the hills layout with real elevation and solid walls', () => {
    const flat = buildTrack(1, 'flat');
    const hills = buildTrack(1, 'hills');
    expect(flat.elevation).toBe(0);
    expect(flat.solidGround).toBe(true);
    expect(hills.elevation).toBeGreaterThan(15);
    expect(hills.solidGround).toBe(false);
    expect(hills.waypoints.every((wp) => wp.hasWalls)).toBe(true);
    expect(hills.waypoints.some((wp) => wp.position.y > 10)).toBe(true);
    expect(hills.waypoints.some((wp) => wp.position.y < -5)).toBe(true);
    expect(hills.ramps.length).toBeGreaterThan(0);
    expect(hills.boostPads.length).toBeGreaterThan(0);
  });

  it('surrounds the hills layout with terrain and hangs a bridge over a ravine', () => {
    expect(buildTrack(1, 'flat').terrain).toBeNull();
    expect(buildTrack(1, 'flat').bridge).toBeNull();

    const hills = buildTrack(1, 'hills');
    const terrain = hills.terrain;
    expect(terrain).not.toBeNull();
    if (!terrain) return;
    expect(terrain.heights).toHaveLength((terrain.cells + 1) ** 2);
    expect(terrain.cells).toBeGreaterThan(32);
    expect(terrain.heights.every((value) => Number.isFinite(value))).toBe(true);

    // Земля под полотном ниже дороги и не улетает ниже дна поля.
    const waypoint = waypointsAt(hills).find((wp) => wp.index === 40);
    if (!waypoint) throw new Error('no waypoint');
    const underRoad = terrainHeightAt(terrain, waypoint.position.x, waypoint.position.z);
    expect(underRoad).toBeLessThan(waypoint.position.y);
    expect(underRoad).toBeGreaterThanOrEqual(terrain.baseY - 0.01);

    // Мост стоит на самом высоком участке, а под ним — ущелье.
    const bridge = hills.bridge;
    expect(bridge).not.toBeNull();
    if (!bridge) return;
    expect(bridge.indices.length).toBeGreaterThan(4);
    const middle = waypointsAt(hills)[bridge.indices[Math.floor(bridge.indices.length / 2)] as number];
    if (!middle) throw new Error('no bridge middle');
    const others = waypointsAt(hills).filter((wp) => !bridge.indices.includes(wp.index));
    const tallestOther = Math.max(...others.map((wp) => wp.position.y));
    expect(middle.position.y).toBeGreaterThan(tallestOther - 0.5);
    const gorge = terrainHeightAt(terrain, middle.position.x, middle.position.z);
    expect(middle.position.y - gorge).toBeGreaterThan(10);
  });

  it('adds hazards, boost pads and ramps by zone', () => {
    expect(buildTrack(1).hazards).toHaveLength(0);
    expect(buildTrack(1).boostPads).toHaveLength(0);
    expect(buildTrack(1).ramps).toHaveLength(0);

    expect(buildTrack(2).hazards.every((hazard) => hazard.surface === 'sludge')).toBe(true);
    expect(buildTrack(3).hazards.some((hazard) => hazard.surface === 'acidPuddle')).toBe(true);
    expect(buildTrack(3).hazards.some((hazard) => hazard.surface === 'acidLake')).toBe(true);
    expect(buildTrack(4).hazards.every((hazard) => hazard.surface === 'oil')).toBe(true);
    expect(buildTrack(4).boostPads.length).toBeGreaterThan(0);
    expect(buildTrack(4).ramps.length).toBeGreaterThan(0);
    expect(buildTrack(6).ramps.length).toBe(buildTrack(4).ramps.length * 2);
  });
});

describe('track helpers', () => {
  it('wraps waypoint and checkpoint indices', () => {
    const track = buildTrack(1);
    expect(waypointAt(track, 0)).toBe(track.waypoints[0]);
    expect(waypointAt(track, -1)).toBe(track.waypoints[track.waypoints.length - 1]);
    expect(checkpointPosition(track, 12)).toBe(checkpointPosition(track, 0));
    expect(checkpointPosition(track, -1)).toBe(checkpointPosition(track, 11));
  });

  it('detects hazards only inside their radius', () => {
    const track = buildTrack(3);
    const hazard = track.hazards[0];
    if (!hazard) throw new Error('zone 3 should have hazards');
    expect(surfaceAtHazard(track, hazard.center)).toBe(hazard.surface);
    expect(surfaceAtHazard(track, new Vec3(hazard.center.x + hazard.radius + 5, 0, hazard.center.z))).toBeNull();
  });

  it('classifies lethal and non-lethal surfaces', () => {
    expect(isLethalSurface('lava')).toBe(true);
    expect(isLethalSurface('acidLake')).toBe(true);
    expect(isLethalSurface('acidPuddle')).toBe(false);
    expect(isLethalSurface('oil')).toBe(false);
  });

  it('builds a 2x2 starting grid behind the finish line', () => {
    const track = buildTrack(1);
    const grid = startingGrid(track);
    expect(grid).toHaveLength(4);
    const start = waypointAt(track, 0);
    for (const spot of grid) {
      const toStart = spot.position.vsub(start.position);
      expect(toStart.dot(start.tangent)).toBeLessThan(0);
      expect(spot.yaw).toBeCloseTo(Math.atan2(start.tangent.x, start.tangent.z));
    }
    expect(grid[0]?.position.distanceTo(grid[1]?.position ?? grid[0]!.position)).toBeGreaterThan(0);
    expect(grid[2]?.position.distanceTo(grid[3]?.position ?? grid[2]!.position)).toBeGreaterThan(0);
  });
});
