import raw from './village.level.json';
import arenaRaw from '@/modes/creative/creative_arena.level.json';
import { validateLevel, type LevelData, LevelValidationError } from './levelSchema';
import { checkReachability } from './reachability';

export interface LoadResult {
  level: LevelData | null;
  error: string | null;
}

export function loadVillage(): LoadResult {
  return loadLevel(raw);
}

export function loadCreativeArena(): LoadResult {
  return loadLevel(arenaRaw);
}

function loadLevel(src: unknown): LoadResult {
  try {
    const level = validateLevel(src);
    if (import.meta.env.DEV) {
      const r = checkReachability(level);
      if (r.unreachable.length) {
        console.warn(
          `[LevelLoader] ${r.unreachable.length} possibly unreachable surface(s):`,
          r.unreachable.map((s) => `${s.x0}-${s.x1}@${s.y}`).join(', '),
        );
      }
    }
    return { level, error: null };
  } catch (e) {
    const msg = e instanceof LevelValidationError ? e.message : `Level failed to load: ${String(e)}`;
    console.error(`[LevelLoader] ${msg}`);
    return { level: null, error: msg };
  }
}
