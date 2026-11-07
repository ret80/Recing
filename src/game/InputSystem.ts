import type { VehicleInput } from '../ecs/components';

export type InputAction = 'throttle' | 'brake' | 'left' | 'right' | 'fireFront' | 'fireRear' | 'fireBoost' | 'pause';

export const DEFAULT_BINDINGS: Record<InputAction, string[]> = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  fireFront: ['Space'],
  fireRear: ['KeyF', 'ControlLeft'],
  fireBoost: ['KeyE', 'ShiftLeft'],
  pause: ['Escape', 'KeyP'],
};

export type TouchState = {
  active: boolean;
  /** −1 — вправо, +1 — влево (как у клавиатуры). */
  steer: number;
  throttle: number;
  brake: number;
  fireFront: boolean;
  fireRear: boolean;
  fireBoost: boolean;
};

const EMPTY_TOUCH: TouchState = {
  active: false,
  steer: 0,
  throttle: 0,
  brake: 0,
  fireFront: false,
  fireRear: false,
  fireBoost: false,
};

export class InputSystem {
  private keys = new Set<string>();
  private previous = new Set<string>();
  private previousActions = { fireFront: false, fireRear: false, fireBoost: false };
  private resetPending = false;
  private touch: TouchState = { ...EMPTY_TOUCH };
  private bindings: Record<InputAction, string[]> = structuredClone(DEFAULT_BINDINGS);
  private gamepadEnabled = true;
  onPause: (() => void) | null = null;
  private disposed = false;

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (this.bindings.pause.includes(event.code)) {
      event.preventDefault();
      this.onPause?.();
      return;
    }
    if (this.bindings.fireFront.includes(event.code) || this.bindings.fireRear.includes(event.code) || this.bindings.fireBoost.includes(event.code)) {
      event.preventDefault();
    }
    this.keys.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.touch = { ...EMPTY_TOUCH };
  };

  /** Экранные контролы пишут сюда; null/частичный патч — обновление полей. */
  setTouch(patch: Partial<TouchState>): void {
    this.touch = { ...this.touch, ...patch };
  }

  clearTouch(): void {
    this.touch = { ...EMPTY_TOUCH };
  }

  setBinding(action: InputAction, codes: string[]): void {
    this.bindings[action] = codes;
  }

  getBindings(): Record<InputAction, string[]> {
    return structuredClone(this.bindings);
  }

  setGamepadEnabled(enabled: boolean): void {
    this.gamepadEnabled = enabled;
  }

  private isDown(action: InputAction): boolean {
    return this.bindings[action].some((code) => this.keys.has(code));
  }

  update(input: VehicleInput): void {
    let throttle = this.isDown('throttle') ? 1 : 0;
    let brake = this.isDown('brake') ? 1 : 0;
    let steer = (this.isDown('left') ? 1 : 0) - (this.isDown('right') ? 1 : 0);
    let fireFront = this.isDown('fireFront');
    let fireRear = this.isDown('fireRear');
    let fireBoost = this.isDown('fireBoost');

    if (this.touch.active) {
      if (this.touch.steer !== 0) steer = this.touch.steer;
      throttle = Math.max(throttle, this.touch.throttle);
      brake = Math.max(brake, this.touch.brake);
      fireFront = fireFront || this.touch.fireFront;
      fireRear = fireRear || this.touch.fireRear;
      fireBoost = fireBoost || this.touch.fireBoost;
    }

    if (this.gamepadEnabled && typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      const pad = pads.find((p) => p && p.connected);
      if (pad) {
        const axis = pad.axes[0] ?? 0;
        if (Math.abs(axis) > 0.12) steer = Math.max(-1, Math.min(1, -axis));
        const rt = pad.buttons[7]?.value ?? 0;
        const lt = pad.buttons[6]?.value ?? 0;
        if (rt > 0.05) throttle = Math.max(throttle, rt);
        if (lt > 0.05) brake = Math.max(brake, lt);
        fireFront = fireFront || (pad.buttons[0]?.pressed ?? false);
        fireRear = fireRear || (pad.buttons[1]?.pressed ?? false);
        fireBoost = fireBoost || (pad.buttons[2]?.pressed ?? false);
        if (pad.buttons[9]?.pressed && !this.previous.has('__padStart')) {
          this.onPause?.();
          this.previous.add('__padStart');
        }
        if (!(pad.buttons[9]?.pressed ?? false)) this.previous.delete('__padStart');
      }
    }

    if (this.resetPending) {
      this.previousActions = { fireFront, fireRear, fireBoost };
      this.resetPending = false;
    }

    input.throttle = throttle;
    input.brake = brake;
    input.steer = steer;
    input.fireFront = fireFront;
    input.fireRear = fireRear;
    input.fireBoost = fireBoost;
    input.fireFrontPressed = fireFront && !this.previousActions.fireFront;
    input.fireRearPressed = fireRear && !this.previousActions.fireRear;
    input.fireBoostPressed = fireBoost && !this.previousActions.fireBoost;

    this.previousActions = { fireFront, fireRear, fireBoost };
    this.previous = new Set(this.keys);
  }

  /** Сброс edge-состояний после паузы/перехода. */
  resetEdges(): void {
    this.previous = new Set(this.keys);
    this.resetPending = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
