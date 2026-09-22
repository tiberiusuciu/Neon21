import { useEffect } from "react";
import { CHIP_DENOMINATIONS_CENTS } from "@neon21/shared";
import type { QueuedAction } from "../components/table/ActionBar";

type Args = {
  enabled: boolean;
  showBet: boolean;
  showInsurance: boolean;
  showActions: boolean;
  showPreActions?: boolean;
  canDouble?: boolean;
  canSplit?: boolean;
  canSit: boolean;
  emptySeatIndexes: number[];
  onHit: () => void;
  onStand: () => void;
  onDouble: () => void;
  onSplit: () => void;
  onQueue?: (action: QueuedAction) => void;
  onTakeInsurance: () => void;
  onDeclineInsurance: () => void;
  onAddBet: (cents: number) => void;
  onClearBet: () => void;
  onReuseBet: () => void;
  onSit: (seatIndex: number) => void;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function useTableKeyboard({
  enabled,
  showBet,
  showInsurance,
  showActions,
  showPreActions = false,
  canDouble = true,
  canSplit = false,
  canSit,
  emptySeatIndexes,
  onHit,
  onStand,
  onDouble,
  onSplit,
  onQueue,
  onTakeInsurance,
  onDeclineInsurance,
  onAddBet,
  onClearBet,
  onReuseBet,
  onSit,
}: Args) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      if (canSit && /^[1-7]$/.test(key)) {
        const seatIndex = Number(key) - 1;
        if (emptySeatIndexes.includes(seatIndex)) {
          e.preventDefault();
          onSit(seatIndex);
        }
        return;
      }

      if (showBet) {
        const chipIdx = "qwert".indexOf(key);
        if (chipIdx >= 0) {
          const cents = CHIP_DENOMINATIONS_CENTS[chipIdx];
          if (cents != null) {
            e.preventDefault();
            onAddBet(cents);
          }
          return;
        }
        if (key === "c" || key === "backspace") {
          e.preventDefault();
          onClearBet();
          return;
        }
        if (key === "d") {
          e.preventDefault();
          onReuseBet();
          return;
        }
      }

      if (showInsurance) {
        if (key === "y" || key === "t" || key === "i") {
          e.preventDefault();
          onTakeInsurance();
          return;
        }
        if (key === "n" || key === "escape") {
          e.preventDefault();
          onDeclineInsurance();
          return;
        }
      }

      if (showPreActions && onQueue) {
        if (key === "q") {
          e.preventDefault();
          onQueue("hit");
          return;
        }
        if (key === "w") {
          e.preventDefault();
          onQueue("stand");
          return;
        }
        if (key === "e") {
          if (!canDouble) return;
          e.preventDefault();
          onQueue("double");
          return;
        }
        if (key === "r") {
          if (!canSplit) return;
          e.preventDefault();
          onQueue("split");
        }
        return;
      }

      if (showActions) {
        if (key === "q") {
          e.preventDefault();
          onHit();
          return;
        }
        if (key === "w") {
          e.preventDefault();
          onStand();
          return;
        }
        if (key === "e") {
          if (!canDouble) return;
          e.preventDefault();
          onDouble();
          return;
        }
        if (key === "r") {
          if (!canSplit) return;
          e.preventDefault();
          onSplit();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    showBet,
    showInsurance,
    showActions,
    showPreActions,
    canDouble,
    canSplit,
    canSit,
    emptySeatIndexes,
    onHit,
    onStand,
    onDouble,
    onSplit,
    onQueue,
    onTakeInsurance,
    onDeclineInsurance,
    onAddBet,
    onClearBet,
    onReuseBet,
    onSit,
  ]);
}
