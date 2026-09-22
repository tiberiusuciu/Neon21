import type { RoundHistoryEntry } from "../components/table/RoundHistoryDrawer";

const keyFor = (tableId: string) => `neon21_round_history_${tableId}`;

export function loadRoundHistory(tableId: string): RoundHistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(keyFor(tableId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as RoundHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveRoundHistory(
  tableId: string,
  entries: RoundHistoryEntry[]
): void {
  try {
    sessionStorage.setItem(keyFor(tableId), JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}
