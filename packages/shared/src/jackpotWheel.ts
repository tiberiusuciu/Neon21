/** Shared wheel layout — 100 tiles, harsh odds. Server picks; client renders. */

export type WheelTile =
  | { kind: "percent"; pctBps: number; label: string }
  | { kind: "flat"; cents: number; label: string }
  | { kind: "goldenHands"; count: number; label: string };

function pct(pctBps: number): WheelTile {
  const p = pctBps / 100;
  const label =
    p >= 1 ? `${p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)}%` : `${p.toFixed(1)}%`;
  return { kind: "percent", pctBps, label };
}

function flat(cents: number, label: string): WheelTile {
  return { kind: "flat", cents, label };
}

function goldenHands(count: number): WheelTile {
  return { kind: "goldenHands", count, label: `${count} GH` };
}

/** Build exactly 100 tiles. Index 0 is the jackpot 100% tile;
 *  indices 1 and 99 are 3 Golden Hands — flanking the jackpot (2/100). */
export function buildJackpotWheel(): WheelTile[] {
  const tiles: WheelTile[] = [];
  tiles.push(pct(10_000)); // 100% — 1/100
  tiles.push(goldenHands(3)); // clockwise neighbor of jackpot

  // ~10 unlucky $25
  for (let i = 0; i < 10; i++) tiles.push(flat(2_500, "$25"));

  // Crumbs (no 1% — those are clustered below so the face can show a clear band)
  const tiny = [10, 10, 15, 15, 20, 25, 25, 30, 40, 50, 50, 75];
  while (tiles.length < 79) {
    tiles.push(pct(tiny[tiles.length % tiny.length]!));
  }
  // Six adjacent 1% tiles (~22°) — same odds, readable slice
  for (let i = 0; i < 6; i++) tiles.push(pct(100));
  while (tiles.length < 85) {
    tiles.push(pct(tiny[tiles.length % tiny.length]!));
  }

  // Small %
  const small = [200, 250, 300, 400, 500]; // 2–5%
  for (const b of small) tiles.push(pct(b));

  // Rare medium
  tiles.push(pct(1_000)); // 10%
  tiles.push(pct(1_500)); // 15%
  tiles.push(pct(2_000)); // 20%
  tiles.push(pct(2_500)); // 25%

  while (tiles.length < 99) tiles.push(pct(10));
  tiles.push(goldenHands(3)); // counter-clockwise neighbor of jackpot
  return tiles.slice(0, 100);
}

export const JACKPOT_WHEEL: WheelTile[] = buildJackpotWheel();

export function pickWheelTile(rng = Math.random): {
  tileIndex: number;
  tile: WheelTile;
} {
  const tileIndex = Math.floor(rng() * JACKPOT_WHEEL.length);
  return { tileIndex, tile: JACKPOT_WHEEL[tileIndex]! };
}

/** Force a tile by index (debug). Wraps into 0..length-1. */
export function pickWheelTileAt(tileIndex: number): {
  tileIndex: number;
  tile: WheelTile;
} {
  const n = JACKPOT_WHEEL.length;
  const i = ((Math.floor(tileIndex) % n) + n) % n;
  return { tileIndex: i, tile: JACKPOT_WHEEL[i]! };
}

export type WheelBiasOption = {
  tileIndex: number;
  label: string;
};

/** Unique outcomes for debug bias dropdown (first index per outcome). */
export function wheelBiasOptions(): WheelBiasOption[] {
  const seen = new Set<string>();
  const out: WheelBiasOption[] = [];
  for (let i = 0; i < JACKPOT_WHEEL.length; i++) {
    const t = JACKPOT_WHEEL[i]!;
    const key =
      t.kind === "flat"
        ? `flat:${t.cents}`
        : t.kind === "goldenHands"
          ? `gh:${t.count}`
          : `pct:${t.pctBps}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tileIndex: i, label: t.label });
  }
  return out;
}

export function payoutForTile(
  tile: WheelTile,
  availableCents: number
): number {
  if (tile.kind === "goldenHands") return 0;
  if (availableCents <= 0) return 0;
  if (tile.kind === "flat") return Math.min(tile.cents, availableCents);
  return Math.floor((availableCents * tile.pctBps) / 10_000);
}

/** Reconstruct wheel label from a stored claim (label is not persisted). */
export function formatClaimLabel(
  kind: string,
  pctBps: number,
  payoutCents: number,
  goldenHandsGranted = 0
): string {
  if (kind === "goldenHands") {
    const n = goldenHandsGranted > 0 ? goldenHandsGranted : 3;
    return `${n} GH`;
  }
  if (kind === "flat") return `$${(payoutCents / 100).toFixed(0)}`;
  const tile = JACKPOT_WHEEL.find(
    (t) => t.kind === "percent" && t.pctBps === pctBps
  );
  return tile?.label ?? `${(pctBps / 100).toFixed(1)}%`;
}
