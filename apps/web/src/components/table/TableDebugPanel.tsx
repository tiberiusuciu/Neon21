import { useEffect, useMemo, useState } from "react";
import { JACKPOT_WHEEL, SEAT_CAPACITY, wheelBiasOptions } from "@neon21/shared";
import { useGameSocket } from "../../lib/SocketProvider";

function dollarsToCents(raw: string): number | null {
  const t = raw.trim().replace(/[$,]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseCardTokens(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const BIAS_OPTIONS = wheelBiasOptions();

/**
 * Staging/dev only. Server must also have ALLOW_TABLE_DEBUG=1.
 */
export function TableDebugPanel() {
  const {
    debugSetBet,
    debugStackCards,
    debugClearStack,
    debugSpawnBot,
    debugClearBots,
    debugDealNow,
    debugSetBotsHold,
    debugSetTimerPaused,
    debugGrantVoucher,
    debugSetSpinBias,
    tableState,
  } = useGameSocket();

  const [betDollars, setBetDollars] = useState("25");
  const [cardsRaw, setCardsRaw] = useState("AS KH QD 10C 9H 5D");
  const [botSeat, setBotSeat] = useState("0");
  const [botName, setBotName] = useState("Bot");
  const [botBet, setBotBet] = useState("25");
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const emptySeats = useMemo(() => {
    const seats = tableState?.seats ?? [];
    const out: number[] = [];
    for (let i = 0; i < SEAT_CAPACITY; i++) {
      if (!seats[i]?.userId) out.push(i);
    }
    return out;
  }, [tableState?.seats]);

  // Keep select value on a free seat — browser can show the first option while
  // controlled state still points at a taken index.
  useEffect(() => {
    if (emptySeats.length === 0) {
      if (botSeat !== "") setBotSeat("");
      return;
    }
    if (!emptySeats.includes(Number(botSeat))) {
      setBotSeat(String(emptySeats[0]));
    }
  }, [emptySeats, botSeat]);

  const stacked = tableState?.debugStack ?? [];
  const botsHold = tableState?.debugBotsHold ?? true;
  const timerPaused = tableState?.debugTimerPaused ?? false;
  const spinBias = tableState?.debugSpinBias ?? null;
  const biasLabel =
    spinBias != null ? (JACKPOT_WHEEL[spinBias]?.label ?? `#${spinBias}`) : null;

  function flash(msg: string) {
    setNote(msg);
    window.setTimeout(() => setNote(null), 2500);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="table-debug-toggle"
        onClick={() => setOpen(true)}
      >
        Debug
      </button>
    );
  }

  return (
    <div className="table-debug-panel">
      <div className="table-debug-head">
        <strong>Table debug</strong>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <p className="table-debug-hint">
        Timers run normally. Check <strong>Freeze timers</strong> to pause the
        phase countdown (e.g. while seating bots), then uncheck to resume.
        <strong> Start round</strong> still forces deal. Cards:{" "}
        <code>AS 10H KD</code> (T=10). Needs server <code>ALLOW_TABLE_DEBUG=1</code>.
      </p>

      <label className="table-debug-check">
        <input
          type="checkbox"
          checked={timerPaused}
          onChange={(e) => {
            debugSetTimerPaused(e.target.checked);
            flash(e.target.checked ? "Timers frozen" : "Timers resumed");
          }}
        />
        Freeze timers
      </label>

      <label className="table-debug-field">
        My bet ($)
        <div className="table-debug-row">
          <input
            value={betDollars}
            onChange={(e) => setBetDollars(e.target.value)}
            inputMode="decimal"
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const cents = dollarsToCents(betDollars);
              if (cents == null) {
                flash("Invalid bet");
                return;
              }
              debugSetBet(cents);
              flash(`Bet set to $${(cents / 100).toFixed(2)}`);
            }}
          >
            Set
          </button>
        </div>
      </label>

      <label className="table-debug-field">
        Next cards
        <textarea
          value={cardsRaw}
          onChange={(e) => setCardsRaw(e.target.value)}
          rows={2}
          spellCheck={false}
        />
        <div className="table-debug-row">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const cards = parseCardTokens(cardsRaw);
              if (cards.length === 0) {
                flash("No cards");
                return;
              }
              debugStackCards(cards);
              flash(`Stacked ${cards.length} card(s)`);
            }}
          >
            Stack
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              debugClearStack();
              flash("Stack cleared");
            }}
          >
            Clear stack
          </button>
        </div>
        <p className="table-debug-stack">
          {stacked.length > 0
            ? `Queued (${stacked.length}): ${stacked.join(" ")}`
            : "Queued: (empty)"}
        </p>
      </label>

      <label className="table-debug-check">
        <input
          type="checkbox"
          checked={botsHold}
          onChange={(e) => debugSetBotsHold(e.target.checked)}
        />
        Bots stand immediately
      </label>

      <div className="table-debug-field">
        Jackpot spin
        <div className="table-debug-row">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              debugGrantVoucher(1);
              flash("Voucher granted");
            }}
          >
            Grant voucher
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              debugGrantVoucher(5);
              flash("+5 vouchers");
            }}
          >
            +5
          </button>
        </div>
        <label className="table-debug-field" style={{ marginTop: "0.35rem" }}>
          Next spin lands on
          <select
            value={spinBias == null ? "" : String(spinBias)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                debugSetSpinBias(null);
                flash("Spin bias cleared");
                return;
              }
              const idx = Number(v);
              debugSetSpinBias(idx);
              flash(`Bias → ${JACKPOT_WHEEL[idx]?.label ?? idx}`);
            }}
          >
            <option value="">Random</option>
            {BIAS_OPTIONS.map((o) => (
              <option key={o.tileIndex} value={String(o.tileIndex)}>
                {o.label} (#{o.tileIndex})
              </option>
            ))}
          </select>
        </label>
        <p className="table-debug-stack">
          {biasLabel ? `Biased: ${biasLabel}` : "Biased: (random)"}
        </p>
      </div>

      <div className="table-debug-field">
        Dummy seat
        <div className="table-debug-row">
          <select value={botSeat} onChange={(e) => setBotSeat(e.target.value)}>
            {emptySeats.length === 0 ? (
              <option value="">Full</option>
            ) : (
              emptySeats.map((i) => (
                <option key={i} value={String(i)}>
                  #{i + 1}
                </option>
              ))
            )}
          </select>
          <input
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="Name"
          />
          <input
            value={botBet}
            onChange={(e) => setBotBet(e.target.value)}
            placeholder="$"
            inputMode="decimal"
          />
        </div>
        <div className="table-debug-row">
          <button
            type="button"
            className="btn btn-sm"
            disabled={emptySeats.length === 0}
            onClick={() => {
              const seatIndex = emptySeats.includes(Number(botSeat))
                ? Number(botSeat)
                : emptySeats[0];
              const cents = dollarsToCents(botBet);
              if (seatIndex == null || cents == null || cents <= 0) {
                flash("Invalid bot");
                return;
              }
              debugSpawnBot({
                seatIndex,
                name: botName.trim() || undefined,
                betCents: cents,
              });
              flash(`Bot on #${seatIndex + 1}`);
            }}
          >
            Spawn bot
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              debugClearBots();
              flash("Bots cleared");
            }}
          >
            Clear bots
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-sm table-debug-deal"
        onClick={() => {
          debugDealNow();
          flash("Starting…");
        }}
      >
        Start round
      </button>

      {note ? <p className="table-debug-note">{note}</p> : null}
    </div>
  );
}
