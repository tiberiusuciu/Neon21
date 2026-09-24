import type { TablePhase } from "@neon21/shared";

const COPY: Record<TablePhase, { title: string; hint: string }> = {
  betting: { title: "Place your bets", hint: "Chips lock when the timer ends" },
  dealing: { title: "Dealing", hint: "Cards are coming out" },
  insurance: {
    title: "Insurance?",
    hint: "Dealer shows an Ace — pays 2:1 if blackjack",
  },
  playerTurns: { title: "Players act", hint: "Hit · Hold · Double · Split" },
  dealer: { title: "Dealer plays", hint: "Watch the house hand" },
  settle: { title: "Round results", hint: "Wins and losses locked in" },
};

export function getPhaseBannerCopy(opts: {
  phase: TablePhase;
  isYourTurn?: boolean;
  isHolding?: boolean;
  needsInsurance?: boolean;
  hasSeatedPlayers?: boolean;
}): { title: string; hint: string } {
  const { phase, isYourTurn, isHolding, needsInsurance, hasSeatedPlayers } =
    opts;
  if (phase === "betting" && hasSeatedPlayers === false) {
    return {
      title: "Waiting for players",
      hint: "Sit at a seat to open betting",
    };
  }
  const base = COPY[phase];
  let title = base.title;
  let hint = base.hint;
  if (phase === "insurance" && needsInsurance) {
    title = "Insurance offered";
    hint = "Dealer's upcard is an Ace — decide below";
  } else if (phase === "insurance") {
    title = "Insurance round";
    hint = "Waiting on players — dealer shows an Ace";
  } else if (phase === "playerTurns" && isHolding) {
    title = "Holding";
    hint = "Hand locked — next soon";
  } else if (phase === "playerTurns" && isYourTurn) {
    title = "Your turn";
    hint = "Choose Hit, Hold, Double, or Split";
  }
  return { title, hint };
}
