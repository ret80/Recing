import type { Waypoint } from './track';

/** Сетка высот ландшафта вокруг трассы (квадратная, в мировых координатах). */
export type TrackTerrain = {
  /** Левый верхний угол поля по X и Z. */
  minX: number;
  minZ: number;
  /** Полная длина стороны поля (м). */
  size: number;
  /** Число ячеек по стороне: вершин (cells + 1)². */
  cells: number;
  cellSize: number;
  /** Высоты вершин, ряд за рядом (по Z). */
  heights: Float32Array;
  /** Нижняя точка поля — дальше земля не опускается. */
  baseY: number;
};

/** Пролёт моста: непрерывный участок точек сплайна. */
export type TrackBridge = { indices: number[] };

const TERRAIN_CELLS = 96;
const TERRAIN_MARGIN = 170;
const BRIDGE_DEPTH = 34;

/** Высота земли в произвольной точке поля (билинейная выборка). */
export function terrainHeightAt(terrain: TrackTerrain, x: number, z: number): number {
  const fx = (x - terrain.minX) / terrain.cellSize;
  const fz = (z - terrain.minZ) / terrain.cellSize;
  const ix = Math.max(0, Math.min(terrain.cells - 1, Math.floor(fx)));
  const iz = Math.max(0, Math.min(terrain.cells - 1, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - ix));
  const tz = Math.max(0, Math.min(1, fz - iz));
  const row = terrain.cells + 1;
  const h00 = terrain.heights[iz * row + ix] ?? terrain.baseY;
  const h10 = terrain.heights[iz * row + ix + 1] ?? h00;
  const h01 = terrain.heights[(iz + 1) * row + ix] ?? h00;
  const h11 = terrain.heights[(iz + 1) * row + ix + 1] ?? h01;
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * tz;
}

/**
 * Мост ставится на самом высоком участке кольца: дорога проходит по гребню
 * над вырытым ущельем, поэтому пролёт видно издалека.
 */
export function pickBridge(waypoints: Waypoint[]): TrackBridge | null {
  if (waypoints.length < 48) return null;
  let best = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    const current = waypoints[i] as Waypoint;
    if (current.position.y > (waypoints[best] as Waypoint).position.y) best = i;
  }
  const half = Math.max(4, Math.round(waypoints.length * 0.035));
  const indices: number[] = [];
  for (let k = -half; k <= half; k += 1) {
    indices.push(((best + k) % waypoints.length + waypoints.length) % waypoints.length);
  }
  return { indices };
}

/** Крупные волны рельефа: одинаковы для всего поля, не зависят от трассы. */
function hillsField(x: number, z: number): number {
  return (
    Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.7) * 9 +
    Math.sin((x * 0.6 + z) * 0.006) * 6 +
    Math.cos((x - z * 0.4) * 0.017) * 3
  );
}

/** Детерминированный шум для неровностей рельефа. */
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Строит ландшафт вокруг горной трассы: земля повторяет высоту полотна и
 * уходит склонами вниз, под мостом прорезано ущелье.
 */
export function buildTerrain(
  waypoints: Waypoint[],
  width: number,
  bridge: TrackBridge | null,
): TrackTerrain {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const wp of waypoints) {
    minX = Math.min(minX, wp.position.x);
    maxX = Math.max(maxX, wp.position.x);
    minZ = Math.min(minZ, wp.position.z);
    maxZ = Math.max(maxZ, wp.position.z);
    minY = Math.min(minY, wp.position.y);
  }

  const cells = TERRAIN_CELLS;
  const originX = minX - TERRAIN_MARGIN;
  const originZ = minZ - TERRAIN_MARGIN;
  const size = Math.max(maxX - minX, maxZ - minZ) + TERRAIN_MARGIN * 2;
  const cellSize = size / cells;
  const row = cells + 1;
  const heights = new Float32Array(row * row);
  const baseY = minY - 30;
  const halfRoad = width / 2;

  // Позиция точки внутри пролёта моста: у краёв ущелье сходит на нет.
  const bridgeSlot = new Map<number, number>();
  if (bridge) {
    const last = bridge.indices.length - 1;
    bridge.indices.forEach((index, slot) => {
      bridgeSlot.set(index, Math.min(slot, last - slot));
    });
  }

  for (let iz = 0; iz < row; iz += 1) {
    const z = originZ + iz * cellSize;
    for (let ix = 0; ix < row; ix += 1) {
      const x = originX + ix * cellSize;
      let bestDist = Number.POSITIVE_INFINITY;
      let bestIndex = 0;
      let bestY = 0;
      for (let i = 0; i < waypoints.length; i += 1) {
        const wp = waypoints[i] as Waypoint;
        const dx = wp.position.x - x;
        const dz = wp.position.z - z;
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
          bestY = wp.position.y;
        }
      }
      const distance = Math.sqrt(bestDist);
      // У самой трассы земля повторяет высоту полотна (дорога врезана в склон).
      const followY = distance <= halfRoad + 3 ? bestY - 2.6 : bestY - (distance - halfRoad) * 0.42;
      // Дальше рельеф живёт своей жизнью: холмы не зависят от трассы.
      const hillY = baseY + 14 + hillsField(x, z);
      const blend = Math.min(1, Math.max(0, (distance - (halfRoad + 6)) / 70));
      let height = followY * (1 - blend) + hillY * blend;

      const slot = bridgeSlot.get(bestIndex);
      if (slot !== undefined) {
        // Ущелье под мостом: у краёв пролёта глубина падает до нуля.
        const edge = Math.min(1, slot / 3);
        const dip = Math.max(0, 1 - distance / (halfRoad + 34));
        height -= BRIDGE_DEPTH * dip * dip * edge;
      }

      if (distance > halfRoad + 6) {
        const amp = Math.min(3.2, (distance - halfRoad) * 0.07);
        height += (hash2(x * 0.06, z * 0.06) - 0.5) * 2 * amp;
      }

      heights[iz * row + ix] = Math.max(baseY, height);
    }
  }

  // Лёгкое сглаживание: убирает одиночные пики от шума.
  smooth(heights, row, 2);

  return { minX: originX, minZ: originZ, size, cells, cellSize, heights, baseY };
}

function smooth(heights: Float32Array, row: number, passes: number): void {
  const copy = new Float32Array(heights);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let iz = 1; iz < row - 1; iz += 1) {
      for (let ix = 1; ix < row - 1; ix += 1) {
        const index = iz * row + ix;
        let sum = 0;
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            sum += copy[index + dz * row + dx] as number;
          }
        }
        heights[index] = sum / 9;
      }
    }
    copy.set(heights);
  }
}
