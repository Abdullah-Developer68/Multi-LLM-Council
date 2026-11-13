export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** `11.09` style date stamp used in editorial list rows. */
export function dateStamp(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** Groups threads into Pinned / Today / This week / Earlier sections. */
export function groupLabel(iso: string, pinned: boolean, now = Date.now()): string {
  if (pinned) return 'Pinned';
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= startOfToday.getTime()) return 'Today';
  if (t >= startOfToday.getTime() - 6 * DAY) return 'This week';
  return 'Earlier';
}

export function initials(name: string | undefined, email?: string): string {
  const source = name?.trim() || email || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
