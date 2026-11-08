import {
  Box,
  Camera,
  Color,
  Cylinder,
  Geometry,
  Mesh,
  Plane,
  Renderer,
  Sphere,
  Transform,
  Vec3,
  type OGLRenderingContext,
} from 'ogl';
import { CAMERA, RENDER } from '../config/balance';
import { MaterialCache, type LightUniforms, type LitOptions } from './materials';

export type Vec3Like = { x: number; y: number; z: number };

/** Минимум данных для построения ленты дороги: точка + поперечная ось. */
export type RibbonPoint = { position: Vec3Like; right: Vec3Like };

export class GameRenderer {
  readonly renderer: Renderer;
  readonly gl: OGLRenderingContext;
  readonly scene: Transform;
  readonly camera: Camera;
  readonly materials: MaterialCache;
  readonly carWheels = new Map<Transform, Transform[]>();
  /** Все колёсные узлы (для анимации хода подвески). */
  readonly carWheelPivots = new Map<Transform, Transform[]>();
  /** Поворотные узлы передних колёс (только у колёсной техники). */
  readonly carSteerPivots = new Map<Transform, Transform[]>();
  private resizeObserver: ResizeObserver | null = null;
  private maxDpr: number = RENDER.highDpr;
  private disposed = false;
  private contextLost = false;
  /** Текущее соотношение сторон кадра — по нему камера адаптируется к портрету. */
  readonly view = { aspect: 1 };
  onContextRestored: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer({
      canvas,
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
      dpr: Math.min(window.devicePixelRatio || 1, this.maxDpr),
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    const gl = this.renderer.gl;
    this.gl = gl;
    this.scene = new Transform();
    this.camera = new Camera(gl, {
      fov: CAMERA.fov,
      near: 0.1,
      far: 900,
      aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight),
    });
    this.camera.position.set(0, 30, -40);
    this.camera.lookAt(new Vec3(0, 0, 0));
    this.materials = new MaterialCache(gl);
    this.gl.clearColor(0.44, 0.35, 0.26, 1);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.resize);
    canvas.addEventListener('webglcontextlost', this.handleLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleRestored, false);
    this.resize();
  }

  private handleLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private handleRestored = (): void => {
    this.contextLost = false;
    this.onContextRestored?.();
  };

  setLighting(lighting: LightUniforms, skyColor: number): void {
    this.materials.setLighting(lighting);
    const color = new Color(skyColor);
    this.gl.clearColor(color.r, color.g, color.b, 1);
  }

  setQuality(quality: 'high' | 'low'): void {
    this.maxDpr = quality === 'high' ? RENDER.highDpr : RENDER.lowDpr;
    this.resize();
  }

  resize = (): void => {
    const canvas = this.renderer.gl.canvas as HTMLCanvasElement;
    const width = Math.max(1, canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.renderer.dpr = dpr;
    this.renderer.setSize(width, height);
    this.view.aspect = width / height;
    this.camera.perspective({ aspect: this.view.aspect, fov: CAMERA.fov });
  };

  render(): void {
    if (this.contextLost || this.disposed) return;
    this.renderer.render({ scene: this.scene, camera: this.camera });
  }

  add(object: Transform): Transform {
    this.scene.addChild(object);
    return object;
  }

  remove(object: Transform): void {
    this.scene.removeChild(object);
    // Уникальные материалы и их геометрия принадлежат одному мешу (например,
    // затухающему пятну нефти) — освобождаем GPU-ресурсы вместе с ним.
    if (object instanceof Mesh && this.materials.isUnique(object.program)) {
      object.program.remove();
      object.geometry.remove();
    }
  }

  /** Меняет прозрачность меша. Работает только с материалом, у которого есть uOpacity. */
  setOpacity(object: object | null, opacity: number): void {
    if (!(object instanceof Mesh)) return;
    const uniform = object.program.uniforms.uOpacity;
    if (uniform) uniform.value = opacity;
  }

  mesh(geometry: Geometry, color: number, options: LitOptions = {}): Mesh {
    const mesh = new Mesh(this.gl, { geometry, program: this.materials.lit(color, options) });
    mesh.frustumCulled = false;
    return mesh;
  }

  box(width: number, height: number, depth: number, color: number, options: LitOptions = {}): Mesh {
    return this.mesh(new Box(this.gl, { width, height, depth }), color, options);
  }

  cylinder(radius: number, height: number, color: number, segments = 16, options: LitOptions = {}): Mesh {
    return this.mesh(
      new Cylinder(this.gl, { radiusTop: radius, radiusBottom: radius, height, radialSegments: segments }),
      color,
      options,
    );
  }

  sphere(radius: number, color: number, options: LitOptions = {}): Mesh {
    return this.mesh(new Sphere(this.gl, { radius, widthSegments: 10, heightSegments: 8 }), color, options);
  }

  plane(width: number, height: number, color: number, options: LitOptions = {}): Mesh {
    const mesh = this.mesh(new Plane(this.gl, { width, height }), color, options);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  createCarVisual(mainColor: number, accentColor: number, chassis: 'wheeled' | 'tracked' | 'hover'): Transform {
    const root = new Transform();
    const wheels: Transform[] = [];
    const wheelPivots: Transform[] = [];
    const steerPivots: Transform[] = [];
    const dark = 0x1c1c1c;
    const trim = 0x6b6b6b;

    if (chassis === 'hover') {
      const hull = this.box(2.2, 0.55, 4.1, mainColor);
      hull.position.y = 0.05;
      root.addChild(hull);
      const skirt = this.box(2.4, 0.3, 4.2, dark);
      skirt.position.y = -0.25;
      root.addChild(skirt);
      const cabin = this.box(1.2, 0.55, 1.5, accentColor);
      cabin.position.set(0, 0.5, -0.2);
      root.addChild(cabin);
      const fan = this.cylinder(0.55, 0.12, 0x66e0ff, 12, { emissive: 0.8 });
      fan.position.y = 0.12;
      fan.rotation.x = Math.PI / 2;
      fan.position.z = 1.2;
      root.addChild(fan);
    } else {
      const body = this.box(1.9, 0.6, 3.9, mainColor);
      body.position.y = 0.08;
      root.addChild(body);
      const cabin = this.box(1.35, 0.5, 1.5, accentColor);
      cabin.position.set(0, 0.55, -0.25);
      root.addChild(cabin);
      const bumperFront = this.box(2.05, 0.35, 0.35, trim);
      bumperFront.position.set(0, 0.0, 2.0);
      root.addChild(bumperFront);
      const bumperRear = this.box(2.05, 0.35, 0.35, trim);
      bumperRear.position.set(0, 0.0, -2.0);
      root.addChild(bumperRear);
      const lightLeft = this.box(0.35, 0.18, 0.12, 0xffe9a8, { emissive: 0.9 });
      lightLeft.position.set(-0.65, 0.25, 2.06);
      root.addChild(lightLeft);
      const lightRight = this.box(0.35, 0.18, 0.12, 0xffe9a8, { emissive: 0.9 });
      lightRight.position.set(0.65, 0.25, 2.06);
      root.addChild(lightRight);

      const wheelGeo =
        chassis === 'tracked'
          ? new Box(this.gl, { width: 0.7, height: 0.7, depth: 4.0 })
          : new Cylinder(this.gl, { radiusTop: 0.42, radiusBottom: 0.42, height: 0.32, radialSegments: 14 });
      const wheelProgram = this.materials.lit(dark);
      for (const side of [-1, 1]) {
        for (const front of [-1, 1]) {
          const wheel = new Mesh(this.gl, { geometry: wheelGeo, program: wheelProgram });
          wheel.frustumCulled = false;
          if (chassis !== 'tracked') wheel.rotation.z = Math.PI / 2;
          const pivot = new Transform();
          pivot.position.set(side * 1.02, chassis === 'tracked' ? -0.18 : -0.33, front * 1.25);
          pivot.addChild(wheel);
          root.addChild(pivot);
          wheels.push(wheel);
          wheelPivots.push(pivot);
          if (chassis === 'wheeled' && front === 1) steerPivots.push(pivot);
        }
      }
    }

    this.carWheels.set(root, wheels);
    this.carWheelPivots.set(root, wheelPivots);
    this.carSteerPivots.set(root, steerPivots);
    return root;
  }

  createTrackRibbon(waypoints: RibbonPoint[], width: number, color: number): Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let distance = 0;
    const count = waypoints.length;

    for (let i = 0; i < count; i += 1) {
      const wp = waypoints[i] as RibbonPoint;
      const prev = waypoints[(i - 1 + count) % count] as RibbonPoint;
      const next = waypoints[(i + 1) % count] as RibbonPoint;
      if (i > 0) {
        distance += Math.hypot(
          wp.position.x - prev.position.x,
          wp.position.y - prev.position.y,
          wp.position.z - prev.position.z,
        );
      }
      const half = width / 2;
      const lx = wp.position.x - wp.right.x * half;
      const ly = wp.position.y - wp.right.y * half;
      const lz = wp.position.z - wp.right.z * half;
      const rx = wp.position.x + wp.right.x * half;
      const ry = wp.position.y + wp.right.y * half;
      const rz = wp.position.z + wp.right.z * half;
      positions.push(lx, ly + 0.03, lz, rx, ry + 0.03, rz);

      // Нормаль ленты с учётом уклона: up = tangent × right.
      const tx = next.position.x - prev.position.x;
      const ty = next.position.y - prev.position.y;
      const tz = next.position.z - prev.position.z;
      const ux = ty * wp.right.z - tz * wp.right.y;
      const uy = tz * wp.right.x - tx * wp.right.z;
      const uz = tx * wp.right.y - ty * wp.right.x;
      const ul = Math.hypot(ux, uy, uz) || 1;
      const nx = ux / ul;
      const ny = uy / ul;
      const nz = uz / ul;
      normals.push(nx, ny, nz, nx, ny, nz);

      const v = distance / 14;
      uvs.push(0, v, 1, v);
    }

    for (let i = 0; i < count; i += 1) {
      const next = (i + 1) % count;
      const a = i * 2;
      const b = i * 2 + 1;
      const c = next * 2;
      const d = next * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }

    const geometry = new Geometry(this.gl, {
      position: { size: 3, data: new Float32Array(positions) },
      normal: { size: 3, data: new Float32Array(normals) },
      uv: { size: 2, data: new Float32Array(uvs) },
      index: { data: new Uint16Array(indices) },
    });
    const mesh = new Mesh(this.gl, { geometry, program: this.materials.lit(color) });
    mesh.frustumCulled = false;
    return mesh;
  }

  createRampVisual(width: number, length: number, height: number, color: number): Mesh {
    const halfW = width / 2;
    const halfL = length / 2;
    const positions = [
      -halfW, 0, -halfL,
      halfW, 0, -halfL,
      halfW, height, halfL,
      -halfW, height, halfL,
      -halfW, 0, -halfL,
      -halfW, height, halfL,
      halfW, height, halfL,
      halfW, 0, -halfL,
    ];
    const normals = [
      0, 1, 0,
      0, 1, 0,
      -0.8, 0.6, 0,
      -0.8, 0.6, 0,
      0.8, 0.6, 0,
      0.8, 0.6, 0,
    ];
    const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 3, 5, 0, 5, 4, 1, 7, 6, 1, 6, 2];
    const geometry = new Geometry(this.gl, {
      position: { size: 3, data: new Float32Array(positions) },
      normal: { size: 3, data: new Float32Array(normals) },
      index: { data: new Uint16Array(indices) },
    });
    const mesh = new Mesh(this.gl, { geometry, program: this.materials.lit(color) });
    mesh.frustumCulled = false;
    return mesh;
  }

  createSkyBox(color: number): Mesh {
    const mesh = this.box(2000, 1, 2000, color, { emissive: 1 });
    mesh.position.y = -6;
    return mesh;
  }

  createParticleMeshData(): { mesh: Mesh; count: () => number } {
    const geometry = new Geometry(this.gl, {
      position: { size: 3, data: new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]) },
      index: { data: new Uint16Array([0, 1, 2, 0, 2, 3]) },
    });
    const mesh = new Mesh(this.gl, { geometry, program: this.materials.lit(0xffffff, { emissive: 0.6 }) });
    return { mesh, count: () => 0 };
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    const canvas = this.renderer.gl.canvas as HTMLCanvasElement;
    canvas.removeEventListener('webglcontextlost', this.handleLost);
    canvas.removeEventListener('webglcontextrestored', this.handleRestored);
  }
}

export function applyTransformToObject(object: Transform, position: Vec3Like, quaternion: { x: number; y: number; z: number; w: number }, scale?: Vec3Like): void {
  object.position.set(position.x, position.y, position.z);
  object.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  if (scale) object.scale.set(scale.x, scale.y, scale.z);
}
