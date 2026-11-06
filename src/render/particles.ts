import { Vec3 } from 'cannon-es';
import { Geometry, Mesh, Program, type Transform } from 'ogl';
import { LIMITS } from '../config/balance';
import type { GameRenderer } from './renderer';
import { hexToRgb } from './materials';

export type ParticleType = 'smoke' | 'fire' | 'spark' | 'dust' | 'nitro' | 'acid';

type Particle = {
  position: Vec3;
  velocity: Vec3;
  life: number;
  maxLife: number;
  size: number;
  color: [number, number, number];
  gravity: number;
  drag: number;
};

const PARTICLE_COLORS: Record<ParticleType, [number, number, number]> = {
  smoke: hexToRgb(0x2b2b2b),
  fire: hexToRgb(0xff6b21),
  spark: hexToRgb(0xffd166),
  dust: hexToRgb(0x9b8a72),
  nitro: hexToRgb(0x3d7bff),
  acid: hexToRgb(0x6cff4f),
};

const vertexShader = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute mat4 instanceMatrix;
attribute vec3 instanceColor;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;
varying vec3 vColor;
varying vec2 vUv;
void main() {
  vColor = instanceColor;
  vUv = position.xy + 0.5;
  vec4 world = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 view = viewMatrix * world;
  view.xy += position.xy * instanceMatrix[0][0];
  gl_Position = projectionMatrix * view;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform float uOpacity;
varying vec3 vColor;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5);
  float alpha = smoothstep(0.5, 0.08, d) * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vColor, alpha);
}
`;

export class ParticleSystem {
  private particles: Particle[] = [];
  private readonly mesh: Mesh;
  private readonly instanceMatrix: Float32Array;
  private readonly instanceColor: Float32Array;
  private readonly geometry: Geometry;
  private readonly maxParticles: number;
  /** 0..1 — множитель количества новых частиц (настройки качества). */
  density = 1;

  constructor(renderer: GameRenderer, maxParticles = LIMITS.particles) {
    this.maxParticles = maxParticles;
    this.instanceMatrix = new Float32Array(maxParticles * 16);
    this.instanceColor = new Float32Array(maxParticles * 3);
    this.geometry = new Geometry(renderer.gl, {
      position: {
        size: 3,
        data: new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
      },
      index: { data: new Uint16Array([0, 1, 2, 0, 2, 3]) },
      instanceMatrix: { size: 16, data: this.instanceMatrix, instanced: 1 },
      instanceColor: { size: 3, data: this.instanceColor, instanced: 1 },
    });
    const program = new Program(renderer.gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      cullFace: false,
      uniforms: { uOpacity: { value: 0.9 } },
    });
    this.mesh = new Mesh(renderer.gl, { geometry: this.geometry, program });
    this.mesh.frustumCulled = false;
    this.geometry.setInstancedCount(0);
    renderer.add(this.mesh);
  }

  private spawnOne(type: ParticleType, position: Vec3, velocity: Vec3, life: number, size: number): void {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    const base = PARTICLE_COLORS[type];
    const jitter = 0.85 + Math.random() * 0.3;
    this.particles.push({
      position: position.clone(),
      velocity,
      life,
      maxLife: life,
      size,
      color: [base[0] * jitter, base[1] * jitter, base[2] * jitter],
      gravity: type === 'fire' || type === 'spark' ? 2.5 : type === 'smoke' ? -0.4 : 1.2,
      drag: type === 'smoke' ? 1.4 : 0.6,
    });
  }

  private scaled(count: number): number {
    return Math.max(1, Math.round(count * this.density));
  }

  burst(position: Vec3, type: ParticleType, count: number, spread = 3.2, life = 0.8, size = 0.35): void {
    for (let i = 0; i < this.scaled(count); i += 1) {
      const dir = new Vec3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.9,
        (Math.random() - 0.5) * spread,
      );
      const lifeValue = life * (0.6 + Math.random() * 0.8);
      this.spawnOne(type, position, dir, lifeValue, size * (0.7 + Math.random() * 0.7));
    }
  }

  explosion(position: Vec3): void {
    this.burst(position, 'fire', 420, 7, 1.1, 0.55);
    this.burst(position, 'smoke', 520, 5.5, 1.6, 0.8);
    this.burst(position, 'spark', 260, 9, 0.7, 0.18);
  }

  trail(position: Vec3, type: ParticleType, count = 1, size = 0.2): void {
    for (let i = 0; i < this.scaled(count); i += 1) {
      const vel = new Vec3((Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8);
      this.spawnOne(type, position, vel, 0.4 + Math.random() * 0.4, size);
    }
  }

  update(dt: number): void {
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.velocity.y -= p.gravity * dt;
      const damp = Math.exp(-p.drag * dt);
      p.velocity.scale(damp, p.velocity);
      p.position.vadd(p.velocity.scale(dt), p.position);
      alive.push(p);
    }
    this.particles = alive;
  }

  render(): void {
    if (this.particles.length === 0) {
      this.geometry.setInstancedCount(0);
      return;
    }
    const count = Math.min(this.particles.length, this.maxParticles);
    for (let i = 0; i < count; i += 1) {
      const p = this.particles[i] as Particle;
      const t = 1 - p.life / p.maxLife;
      const size = p.size * (0.6 + t * 1.4);
      const offset = i * 16;
      this.instanceMatrix.fill(0, offset, offset + 16);
      this.instanceMatrix[offset] = size;
      this.instanceMatrix[offset + 5] = size;
      this.instanceMatrix[offset + 10] = size;
      this.instanceMatrix[offset + 12] = p.position.x;
      this.instanceMatrix[offset + 13] = p.position.y;
      this.instanceMatrix[offset + 14] = p.position.z;
      this.instanceMatrix[offset + 15] = 1;
      const colorOffset = i * 3;
      this.instanceColor[colorOffset] = p.color[0];
      this.instanceColor[colorOffset + 1] = p.color[1];
      this.instanceColor[colorOffset + 2] = p.color[2];
    }
    this.geometry.setInstancedCount(count);
    const matrixAttribute = this.geometry.attributes.instanceMatrix;
    const colorAttribute = this.geometry.attributes.instanceColor;
    if (matrixAttribute) matrixAttribute.needsUpdate = true;
    if (colorAttribute) colorAttribute.needsUpdate = true;
  }

  clear(): void {
    this.particles = [];
    this.geometry.setInstancedCount(0);
  }

  get count(): number {
    return this.particles.length;
  }

  attach(parent: Transform): void {
    parent.addChild(this.mesh);
  }
}
