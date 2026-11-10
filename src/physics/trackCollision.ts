import { Vec3 } from 'cannon-es';
import type { PhysicsWorld } from './physicsWorld';
import type { TrackDefinition, Waypoint } from '../track/track';

/** Геометрия полотна: ширина физических секций и их перекрытие на поворотах. */
export const ROAD_COLLISION = {
  /**
   * Запас по ширине за кромкой асфальта (м). Плита шире полотна и уходит
   * под отбойник, поэтому клиновидная щель на стыке секций остаётся
   * снаружи ограждения, а не под колёсами.
   */
  widthMargin: 0.9,
  /** Удлинение секции на стыке (м): закрывает щель на внешней кромке поворота. */
  overlap: 1.5,
  /** Толщина плиты полотна (м). */
  thickness: 1.2,
  /** Ширина страховочной полки за полотном (м): ловит машину, перелетевшую отбойник. */
  shoulderWidth: 4.5,
  /**
   * Насколько полка ниже полотна (м). Должна быть больше полуторной
   * толщины плиты и запаса на уклон, иначе на подъёме/спуске хорда полки
   * выныривает над асфальтом и машина бьётся о невидимую ступеньку.
   */
  shoulderDrop: 1.7,
} as const;

/**
 * Строит физические коллайдеры трассы: плиту полотна и страховочную полку
 * у обочин. Вынесено из RaceScene, чтобы покрытие можно было проверить
 * без WebGL: машина не должна проваливаться между секциями на повороте.
 */
export function buildTrackColliders(physics: PhysicsWorld, track: TrackDefinition): void {
  const halfWidth = track.width / 2;
  const waypoints = track.waypoints;
  const count = waypoints.length;
  for (let i = 0; i < count; i += 1) {
    const a = waypoints[i] as Waypoint;
    const b = waypoints[(i + 1) % count] as Waypoint;
    physics.addTrackSegment(
      a.position,
      b.position,
      halfWidth + ROAD_COLLISION.widthMargin,
      ROAD_COLLISION.thickness,
      ROAD_COLLISION.overlap,
    );
  }

  if (track.solidGround) return;
  for (let i = 0; i < count; i += 2) {
    const a = waypoints[i] as Waypoint;
    const b = waypoints[(i + 2) % count] as Waypoint;
    const shelfA = new Vec3(a.position.x, a.position.y - ROAD_COLLISION.shoulderDrop, a.position.z);
    const shelfB = new Vec3(b.position.x, b.position.y - ROAD_COLLISION.shoulderDrop, b.position.z);
    physics.addTrackSegment(
      shelfA,
      shelfB,
      halfWidth + ROAD_COLLISION.shoulderWidth,
      1,
      2.6,
    );
  }
}
