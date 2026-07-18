let counter = 0;

/**
 * Stable, collision-free client-side id for list keys and draft rows.
 * Uses a monotonic counter (no `Math.random`/`Date` dependency) so ids are
 * deterministic within a session and safe to use as React keys.
 */
export function nextId(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
