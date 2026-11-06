/** Чистые функции оружейных таймеров — покрываются unit-тестами (Фаза 13). */
export function tickCooldown(remaining: number, dt: number): number {
  return Math.max(0, remaining - dt);
}

export function canFire(ammo: number, cooldown: number): boolean {
  return ammo > 0 && cooldown <= 0;
}

export function consumeShot(ammo: number, cooldown: number, weaponCooldown: number): { ammo: number; cooldown: number } {
  void cooldown;
  return { ammo: Math.max(0, ammo - 1), cooldown: weaponCooldown };
}

export function refillAmmo(current: number, max: number, levelCharges: number): number {
  return Math.max(current, Math.min(max, levelCharges));
}
