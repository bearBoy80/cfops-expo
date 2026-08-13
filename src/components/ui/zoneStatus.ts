import type { Status } from './Pill';

/** Maps a Cloudflare zone status (plus its paused flag) to a Pill status. */
export function zonePillStatus(zone: {
  status: string;
  paused: boolean;
}): Status {
  if (zone.paused) {
    return 'paused';
  }
  if (zone.status === 'active') {
    return 'active';
  }
  if (zone.status === 'pending' || zone.status === 'initializing') {
    return 'pending';
  }
  return 'error';
}
