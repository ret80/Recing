export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}

export function money(value: number): string {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

export function pips(value: number, max = 5): string {
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(max - filled)}`;
}
