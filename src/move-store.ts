import { newMoveState, type MoveState } from "./move";

/** Non-secret progress only: source id to destination id maps. Tokens are never stored. */
interface Saved {
  v: 1;
  lists: [string, string][];
  tasks: [string, string][];
  closed: string[];
}

export const storeKey = (dest: string, accountId: string): string => `lifeboat:${dest}:${accountId}`;

export function saveState(storage: Storage, key: string, s: MoveState): void {
  const data: Saved = { v: 1, lists: [...s.listMap], tasks: [...s.taskMap], closed: [...s.closed] };
  try {
    storage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage full or blocked: progress stays in memory for this tab.
  }
}

export function loadState(storage: Storage, key: string): MoveState {
  const state = newMoveState();
  try {
    const raw = storage.getItem(key);
    if (!raw) return state;
    const d = JSON.parse(raw) as Saved;
    if (d.v !== 1) return state;
    state.listMap = new Map(d.lists);
    state.taskMap = new Map(d.tasks);
    state.closed = new Set(d.closed);
  } catch {
    return newMoveState();
  }
  return state;
}

export function clearState(storage: Storage, key: string): void {
  storage.removeItem(key);
}
