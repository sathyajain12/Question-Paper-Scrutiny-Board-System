/**
 * Motion helpers.
 *
 * The rule this codebase follows: animation is feedback about what just
 * happened, never decoration on arrival. Everything here is short (≤250ms),
 * triggered by a change rather than by mounting, and disappears entirely
 * under `prefers-reduced-motion` — where the outcome must still be correct,
 * just instant.
 *
 * No animation library: Tailwind's `transition`/`motion-safe:` variants plus
 * these three hooks cover the whole admin portal, and pulling in Framer
 * Motion for four effects would be a poor trade in a bundle already at
 * ~131 kB gzipped.
 */
import { useEffect, useRef, useState } from 'react';

/** How long exit transitions run. Must match the CSS duration that plays them. */
export const EXIT_MS = 200;
export const DRAWER_MS = 220;
/** How long a changed number stays highlighted. */
export const FLASH_MS = 900;

/**
 * Read at call time rather than cached, so changing the OS setting takes
 * effect without a reload.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/**
 * Keeps an item rendered briefly after it leaves `items`, so it can animate
 * out instead of vanishing.
 *
 * The admin queue is derived state — approve a board and it simply stops
 * matching `needsAction`, so React unmounts the card mid-blink and the user
 * is left wondering whether their click registered. Holding the removed item
 * for one transition turns that into visible feedback.
 *
 * Removed entries keep their original position, so the surrounding cards do
 * not jump while one is on its way out.
 */
export interface ExitEntry<T> {
  item: T;
  key: string;
  exiting: boolean;
}

export function useExitList<T>(
  items: T[],
  keyOf: (item: T) => string,
  exitMs: number = EXIT_MS,
): ExitEntry<T>[] {
  const build = (source: T[]): ExitEntry<T>[] =>
    source.map((item) => ({ item, key: keyOf(item), exiting: false }));

  const [rendered, setRendered] = useState<ExitEntry<T>[]>(() => build(items));
  /** Mirrors `rendered` so the effect can read it without depending on it. */
  const current = useRef<ExitEntry<T>[]>(rendered);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const live = new Map(items.map((item) => [keyOf(item), item]));
    const previous = current.current;

    // Walk the old order first so a departing card holds its place, then
    // append whatever is genuinely new.
    const merged: ExitEntry<T>[] = [];
    for (const entry of previous) {
      const stillHere = live.get(entry.key);
      merged.push(
        stillHere !== undefined
          ? { item: stillHere, key: entry.key, exiting: false }
          : { ...entry, exiting: true },
      );
    }
    for (const [key, item] of live) {
      if (!merged.some((entry) => entry.key === key)) {
        merged.push({ item, key, exiting: false });
      }
    }

    current.current = merged;
    setRendered(merged);

    const hold = prefersReducedMotion() ? 0 : exitMs;

    for (const entry of merged) {
      if (!entry.exiting || timers.current.has(entry.key)) continue;
      timers.current.set(
        entry.key,
        setTimeout(() => {
          timers.current.delete(entry.key);
          current.current = current.current.filter((e) => e.key !== entry.key);
          setRendered(current.current);
        }, hold),
      );
    }

    // Something that reappeared before its timer fired should simply stay.
    for (const [key, timer] of timers.current) {
      if (!live.has(key)) continue;
      clearTimeout(timer);
      timers.current.delete(key);
    }
  }, [items, keyOf, exitMs]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return rendered;
}

/**
 * Which numbers just changed, so the tile that moved can say so.
 *
 * When "Needs your action" drops from 3 to 2 the digit silently swaps and is
 * easy to miss. Highlighting only the tile that changed confirms the click
 * registered, without animating the five that did not.
 */
export function useChangedKeys(
  values: Record<string, number>,
  flashMs: number = FLASH_MS,
): Set<string> {
  const [changed, setChanged] = useState<Set<string>>(() => new Set());
  const previous = useRef<Record<string, number> | null>(null);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const before = previous.current;
    previous.current = { ...values };

    // First render is not a change — nothing should flash on arrival.
    if (!before || prefersReducedMotion()) return;

    const moved = Object.keys(values).filter((key) => before[key] !== values[key]);
    if (moved.length === 0) return;

    setChanged((prev) => new Set([...prev, ...moved]));

    for (const key of moved) {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          setChanged((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }, flashMs),
      );
    }
  }, [values, flashMs]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return changed;
}
