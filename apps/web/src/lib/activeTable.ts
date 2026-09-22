const ACTIVE_TABLE_KEY = "neon21_active_table";

export function getActiveTableId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_TABLE_KEY);
  } catch {
    return null;
  }
}

export function setActiveTableId(tableId: string | null): void {
  try {
    if (tableId) sessionStorage.setItem(ACTIVE_TABLE_KEY, tableId);
    else sessionStorage.removeItem(ACTIVE_TABLE_KEY);
  } catch {
    /* ignore */
  }
}
