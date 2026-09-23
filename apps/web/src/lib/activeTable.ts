const ACTIVE_TABLE_KEY = "neon21_active_table";

export function getActiveTableId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TABLE_KEY);
  } catch {
    return null;
  }
}

export function setActiveTableId(tableId: string | null): void {
  try {
    if (tableId) localStorage.setItem(ACTIVE_TABLE_KEY, tableId);
    else localStorage.removeItem(ACTIVE_TABLE_KEY);
  } catch {
    /* ignore */
  }
}
