import { Easing, Group, Tween } from '@tweenjs/tween.js';
import { Vec3 as OglVec3 } from 'ogl';
import { CAMERA, RACE, WORLD } from '../config/balance';
import type { TrackDefinition } from '../track/track';
import type { GameRenderer } from '../render/renderer';

type Vec3Like = { x: number; y: number; z: number };

export class CameraRig {
  private readonly renderer: GameRenderer;
  private readonly camera;
  private look = new OglVec3();
  private readonly shakeGroup = new Group();
  private readonly shake = { amount: 0 };
  private shakeTween: Tween<{ amount: number }> | null = null;
  private introTime = 0;
  private angle = 0;
  cameraShakeEnabled = true;

  constructor(renderer: GameRenderer) {
    this.renderer = renderer;
    this.camera = renderer.camera;
  }

  resetIntro(): void {
    this.introTime = 0;
  }

  addShake(amount = 1): void {
    if (!this.cameraShakeEnabled) return;
    this.shake.amount = Math.min(1.5, this.shake.amount + amount);
    this.shakeTween?.stop();
    this.shakeTween = new Tween(this.shake, this.shakeGroup).to({ amount: 0 }, CAMERA.shakeDecay * 1000).easing(Easing.Quadratic.Out);
    this.shakeTween.start();
  }

  intro(dt: number, track: TrackDefinition): void {
    this.introTime += dt;
    const duration = RACE.trackIntroSec;
    const t = Math.min(1, this.introTime / duration);
    const count = track.waypoints.length;
    const wp = track.waypoints[Math.floor(t * count * 0.45) % count];
    const ahead = track.waypoints[Math.floor((t * count * 0.45 + 18) % count) % count];
    if (!wp || !ahead) return;
    this.camera.position.set(wp.position.x, 34 - t * 8, wp.position.z);
    this.look.set(ahead.position.x, 0, ahead.position.z);
    this.camera.lookAt(this.look);
  }

  orbit(dt: number, center: Vec3Like): void {
    this.angle += dt * 0.12;
    const radius = 120;
    this.camera.position.set(center.x + Math.cos(this.angle) * radius, 62, center.z + Math.sin(this.angle) * radius);
    this.look.set(center.x, 0, center.z);
    this.camera.lookAt(this.look);
  }

  follow(dt: number, position: Vec3Like, forward: Vec3Like, immediate = false): void {
    const desiredX = position.x - forward.x * CAMERA.distance;
    const desiredY = position.y + CAMERA.height;
    const desiredZ = position.z - forward.z * CAMERA.distance;
    const alpha = immediate ? 1 : 1 - Math.exp(-dt / CAMERA.lag);
    this.camera.position.x += (desiredX - this.camera.position.x) * alpha;
    this.camera.position.y += (desiredY - this.camera.position.y) * alpha;
    this.camera.position.z += (desiredZ - this.camera.position.z) * alpha;

    const targetX = position.x + forward.x * 8;
    const targetY = position.y + 1.4;
    const targetZ = position.z + forward.z * 8;
    const lookAlpha = immediate ? 1 : 1 - Math.exp(-dt / (CAMERA.lag * 1.4));
    this.look.x += (targetX - this.look.x) * lookAlpha;
    this.look.y += (targetY - this.look.y) * lookAlpha;
    this.look.z += (targetZ - this.look.z) * lookAlpha;
    this.camera.lookAt(this.look);
  }

  renderShake(): void {
    if (this.shake.amount <= 0.002) return;
    const amplitude = this.shake.amount * CAMERA.shakeAmplitude;
    this.camera.position.x += (Math.random() - 0.5) * amplitude;
    this.camera.position.y += (Math.random() - 0.5) * amplitude * 0.6;
    this.camera.position.z += (Math.random() - 0.5) * amplitude;
  }

  updateTweens(): void {
    this.shakeGroup.update(performance.now());
  }

  snap(position: Vec3Like, forward: Vec3Like): void {
    this.camera.position.set(position.x - forward.x * CAMERA.distance, position.y + CAMERA.height, position.z - forward.z * CAMERA.distance);
    this.look.set(position.x + forward.x * 8, position.y + 1.4, position.z + forward.z * 8);
    this.camera.lookAt(this.look);
  }

  clampToWorld(): void {
    if (this.camera.position.y < WORLD.killPlaneY + 2) this.camera.position.y = WORLD.killPlaneY + 2;
  }

  get rendererRef(): GameRenderer {
    return this.renderer;
  }
}
