import { z } from "zod";

export const RegisterBodySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const UpdateNameBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type UpdateNameBody = z.infer<typeof UpdateNameBodySchema>;

export const PublicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameChosen: z.boolean(),
  email: z.string().email(),
  isAdmin: z.boolean(),
  balanceCents: z.number().int(),
  lastClaimAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const AdminUserRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  balanceCents: z.number().int(),
  handsPlayed: z.number().int(),
  netProfitCents: z.number().int(),
  openVouchers: z.number().int().nonnegative().optional(),
  goldenHands: z.number().int().nonnegative().optional(),
});
export type AdminUserRow = z.infer<typeof AdminUserRowSchema>;

export const AdminUsersResponseSchema = z.object({
  users: z.array(AdminUserRowSchema),
});
export type AdminUsersResponse = z.infer<typeof AdminUsersResponseSchema>;

export const AdminTopUpBodySchema = z.object({
  /** Positive adds funds; negative removes. Zero rejected. */
  dollars: z
    .number()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((n) => Number.isFinite(n) && n !== 0, "Amount must be non-zero"),
});
export type AdminTopUpBody = z.infer<typeof AdminTopUpBodySchema>;

export const AdminTopUpResponseSchema = z.object({
  user: AdminUserRowSchema,
  /** Signed: positive credit, negative debit (may be clamped to available balance). */
  creditedCents: z.number().int().refine((n) => n !== 0),
});
export type AdminTopUpResponse = z.infer<typeof AdminTopUpResponseSchema>;

export const AdminResetStatsBodySchema = z.discriminatedUnion("period", [
  z.object({
    period: z.literal("season"),
    /** When true, pot shrinks by this player's stored vault take in range. Default keeps pot. */
    removeJackpotTake: z.boolean().optional(),
  }),
  z.object({
    period: z.literal("alltime"),
    removeJackpotTake: z.boolean().optional(),
  }),
  z.object({
    period: z.literal("custom"),
    from: z.string().min(1),
    to: z.string().min(1),
    removeJackpotTake: z.boolean().optional(),
  }),
]);
export type AdminResetStatsBody = z.infer<typeof AdminResetStatsBodySchema>;

export const AdminResetStatsResponseSchema = z.object({
  user: AdminUserRowSchema,
  deletedOutcomes: z.number().int().nonnegative(),
  period: z.enum(["season", "alltime", "custom"]),
  from: z.string().nullable(),
  to: z.string().nullable(),
  /** Stored vault take from deleted losses (epoch-aware). */
  jackpotTakeCents: z.number().int().nonnegative(),
  /** True when that take was removed from the pot (not preserved via adjustment). */
  jackpotTakeRemoved: z.boolean(),
});
export type AdminResetStatsResponse = z.infer<
  typeof AdminResetStatsResponseSchema
>;

/** Admin vault ledger row: loss take (+), spin claim (−), or admin adjustment. */
export const AdminJackpotLedgerEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["take", "claim", "adjustment"]),
  deltaCents: z.number().int(),
  createdAt: z.string(),
  /** Loss take: player whose loss funded the vault. */
  userName: z.string().optional(),
  /** Claim: wheel label e.g. "100%" / "$25". */
  label: z.string().optional(),
  pctBps: z.number().int().optional(),
  payoutCents: z.number().int().optional(),
  potBeforeCents: z.number().int().optional(),
  tableName: z.string().optional(),
  /** Adjustment note (e.g. admin email). */
  note: z.string().nullable().optional(),
  /** Absolute player loss that produced this take. */
  lossCents: z.number().int().optional(),
});
export type AdminJackpotLedgerEntry = z.infer<
  typeof AdminJackpotLedgerEntrySchema
>;

export const AdminJackpotResponseSchema = z.object({
  takeCents: z.number().int().nonnegative(),
  /** Unclamped ledger (can be negative if claims exceeded funding). */
  rawPotCents: z.number().int(),
  grossTakeCents: z.number().int(),
  claimsSumCents: z.number().int().nonnegative(),
  adjustmentsCents: z.number().int(),
  ledger: z.array(AdminJackpotLedgerEntrySchema),
});
export type AdminJackpotResponse = z.infer<typeof AdminJackpotResponseSchema>;

export const AdminSetJackpotBodySchema = z.object({
  /** Absolute vault amount in dollars (≥ 0). */
  dollars: z
    .number()
    .min(0)
    .max(100_000_000)
    .refine((n) => Number.isFinite(n), "Invalid amount"),
});
export type AdminSetJackpotBody = z.infer<typeof AdminSetJackpotBodySchema>;

export const AdminSetJackpotResponseSchema = z.object({
  takeCents: z.number().int().nonnegative(),
  previousTakeCents: z.number().int().nonnegative(),
  deltaCents: z.number().int(),
});
export type AdminSetJackpotResponse = z.infer<
  typeof AdminSetJackpotResponseSchema
>;

export const AdminGrantVoucherBodySchema = z.object({
  count: z.number().int().min(1).max(10).optional().default(1),
});
export type AdminGrantVoucherBody = z.infer<typeof AdminGrantVoucherBodySchema>;

export const AdminGrantVoucherResponseSchema = z.object({
  userId: z.string(),
  granted: z.number().int().positive(),
  openVouchers: z.number().int().nonnegative(),
});
export type AdminGrantVoucherResponse = z.infer<
  typeof AdminGrantVoucherResponseSchema
>;

export const AdminGrantGoldenHandsBodySchema = z.object({
  count: z.number().int().min(1).max(100).optional().default(1),
});
export type AdminGrantGoldenHandsBody = z.infer<
  typeof AdminGrantGoldenHandsBodySchema
>;

export const AdminGrantGoldenHandsResponseSchema = z.object({
  userId: z.string(),
  granted: z.number().int().positive(),
  goldenHands: z.number().int().nonnegative(),
});
export type AdminGrantGoldenHandsResponse = z.infer<
  typeof AdminGrantGoldenHandsResponseSchema
>;

export const GoldenHourPublicSchema = z.object({
  disabled: z.boolean(),
  active: z.boolean(),
  activeUntil: z.number().int().nullable(),
  nextStartsAt: z.number().int().nullable(),
  /** Epoch ms when the current/last window started (for rebate ledger). */
  windowStartedAt: z.number().int().nullable().optional(),
  /** Inclusive min hours until next auto-start (idle). */
  cooldownMinHours: z.number().int().positive().optional(),
  /** Inclusive max hours until next auto-start (idle). */
  cooldownMaxHours: z.number().int().positive().optional(),
  /** GH hands needed to earn one Golden Hand token (admin-tunable). */
  goldenHandsPerHands: z.number().int().min(1).max(500).optional(),
  /** Naturals needed per spin voucher (admin-tunable; no time decay). */
  spinBjPerVoucher: z.number().int().min(1).max(50).optional(),
});
export type GoldenHourPublic = z.infer<typeof GoldenHourPublicSchema>;

/** Projected Golden Hour gross-loss rebate for the current window. */
export const GOLDEN_HOUR_REBATE_CAP_CENTS = 500_000;
export const GoldenHourRebateProgressSchema = z.object({
  /** Unused for rebate math; kept for clients that still read it. */
  wonCents: z.number().int().nonnegative(),
  lostCents: z.number().int().nonnegative(),
  rebateCents: z.number().int().nonnegative(),
  capCents: z.number().int().positive(),
  paidCents: z.number().int().nonnegative().optional(),
});
export type GoldenHourRebateProgress = z.infer<
  typeof GoldenHourRebateProgressSchema
>;

export const AdminGoldenHourDisableBodySchema = z.object({
  disabled: z.boolean(),
});
export type AdminGoldenHourDisableBody = z.infer<
  typeof AdminGoldenHourDisableBodySchema
>;

export const AdminGoldenHourScheduleBodySchema = z.object({
  cooldownMinHours: z.number().int().min(1).max(168),
  cooldownMaxHours: z.number().int().min(1).max(168),
  /** GH hands per Golden Hand token. */
  goldenHandsPerHands: z.number().int().min(1).max(500),
  /** Naturals per spin voucher. */
  spinBjPerVoucher: z.number().int().min(1).max(50),
  /** When idle, re-roll nextStartsAt from the new range. Default true. */
  rescheduleNext: z.boolean().optional(),
});
export type AdminGoldenHourScheduleBody = z.infer<
  typeof AdminGoldenHourScheduleBodySchema
>;

export const AdminHandOutcomeSchema = z.object({
  id: z.string(),
  resultCents: z.number().int(),
  betCents: z.number().int(),
  isBlackjack: z.boolean(),
  doubled: z.boolean(),
  bust: z.boolean(),
  isInsurance: z.boolean(),
  /** Wallet after this hand settled; may be reconstructed for legacy rows. */
  balanceAfterCents: z.number().int().nullable(),
  /** True when balanceAfter was inferred, not stored. */
  balanceApproximate: z.boolean().optional(),
  createdAt: z.string(),
});
export type AdminHandOutcome = z.infer<typeof AdminHandOutcomeSchema>;

export const AdminHandHistoryResponseSchema = z.object({
  userId: z.string(),
  balanceCents: z.number().int(),
  openVouchers: z.number().int().nonnegative(),
  goldenHands: z.number().int().nonnegative(),
  hands: z.array(AdminHandOutcomeSchema),
  total: z.number().int().nonnegative(),
});
export type AdminHandHistoryResponse = z.infer<
  typeof AdminHandHistoryResponseSchema
>;

export const WalletSchema = z.object({
  balanceCents: z.number().int(),
  lastClaimAt: z.string().nullable(),
  canClaim: z.boolean(),
  nextClaimAt: z.string().nullable(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const ClaimResponseSchema = z.object({
  balanceCents: z.number().int(),
  lastClaimAt: z.string(),
  creditedCents: z.number().int(),
  nextClaimAt: z.string().optional(),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

export const CHIP_DENOMINATIONS_CENTS = [
  500, // $5
  1000, // $10
  2500, // $25
  5000, // $50
  10000, // $100
  50000, // $500
  100000, // $1k
  1_000_000, // $10k
  10_000_000, // $100k
] as const;
export type ChipDenominationCents = (typeof CHIP_DENOMINATIONS_CENTS)[number];

/** Always show small chips; mid/high tiers unlock once bankroll can cover them. */
export function visibleChipDenominations(
  balanceCents: number
): ChipDenominationCents[] {
  return CHIP_DENOMINATIONS_CENTS.filter(
    (c) => c <= 10_000 || balanceCents >= c
  );
}

/** Compact chip face label ($10k → "10k"). */
export function chipFaceLabel(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) {
    const k = dollars / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k}k`;
  }
  return String(dollars);
}

export const MIN_BET_CENTS = 500;
/** Max pending bet while a Golden Hand token is armed. */
export const GOLDEN_HAND_MAX_BET_CENTS = 500_000;
/** Default GH hands per Golden Hand token (admin can override). */
export const GOLDEN_HANDS_PER_HANDS = 15;
/** Default naturals per spin voucher (admin can override). */
export const SPIN_BJ_PER_VOUCHER = 3;
export const SEAT_CAPACITY = 7;

export const SuitSchema = z.enum(["S", "H", "D", "C"]);
export type Suit = z.infer<typeof SuitSchema>;

export const RankSchema = z.enum([
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
]);
export type Rank = z.infer<typeof RankSchema>;

export const PublicCardSchema = z.union([
  z.object({
    suit: SuitSchema,
    rank: RankSchema,
    hidden: z.literal(false).optional(),
  }),
  z.object({
    hidden: z.literal(true),
  }),
]);
export type PublicCard = z.infer<typeof PublicCardSchema>;

export const HandValueSchema = z.object({
  soft: z.number().int().nullable(),
  hard: z.number().int(),
  bust: z.boolean(),
  label: z.string(),
});
export type HandValue = z.infer<typeof HandValueSchema>;

export function handValueLabel(value: {
  soft: number | null;
  hard: number;
  bust: boolean;
}): string {
  if (value.bust) return "BUST";
  if (value.soft != null) return `${value.soft}/${value.hard}`;
  return `${value.hard}`;
}

export const HandAwardSchema = z.object({
  kind: z.enum(["suitedPair", "triple", "straight", "charlie"]),
  /** Side-bonus wallet credit; 0 for Charlie (main win is in resultCents). */
  cents: z.number().int().nonnegative(),
  /** True when cents were credited outside resultCents. */
  sideBonus: z.boolean(),
  suit: SuitSchema.optional(),
  straightLength: z
    .union([z.literal(3), z.literal(4), z.literal(5)])
    .optional(),
});
export type HandAward = z.infer<typeof HandAwardSchema>;

export const PublicHandSchema = z.object({
  cards: z.array(PublicCardSchema),
  value: HandValueSchema,
  betCents: z.number().int(),
  isBlackjack: z.boolean(),
  stood: z.boolean(),
  doubled: z.boolean(),
  resultCents: z.number().int().nullable(),
  /** Active GH suited-pair multiplier suit, if still eligible. */
  suitedPairSuit: SuitSchema.nullable().optional(),
  /** Golden Hand rules on this hand. */
  goldenHand: z.boolean().optional(),
  /** Combo awards paid (or tagged) this hand. */
  awards: z.array(HandAwardSchema).optional(),
});
export type PublicHand = z.infer<typeof PublicHandSchema>;

export const PublicSeatSchema = z.object({
  index: z.number().int(),
  userId: z.string().nullable(),
  name: z.string().nullable(),
  pendingBetCents: z.number().int(),
  lastBetCents: z.number().int(),
  hands: z.array(PublicHandSchema),
  insuranceCents: z.number().int(),
  insuranceResolved: z.boolean(),
  connected: z.boolean(),
  /** Blackjacks toward next spin voucher (0 … threshold-1). */
  bjTowardSpin: z.number().int().min(0).max(49).optional(),
  /** Open spin vouchers stacked. */
  spinVouchers: z.number().int().nonnegative().optional(),
  /** Epoch ms while suited-pair bonus FX should show. */
  suitedPairFxUntil: z.number().int().nullable().optional(),
  /** Cents of the suited-pair bonus shown during FX. */
  suitedPairBonusCents: z.number().int().nonnegative().optional(),
  /** Epoch ms while 5-card Charlie FX should show. */
  charlieFxUntil: z.number().int().nullable().optional(),
  /** Epoch ms while triple-card bonus FX should show. */
  tripleBonusFxUntil: z.number().int().nullable().optional(),
  /** Cents of the triple bonus shown during FX. */
  tripleBonusCents: z.number().int().nonnegative().optional(),
  /** Epoch ms while running-straight bonus FX should show. */
  straightBonusFxUntil: z.number().int().nullable().optional(),
  /** Cents of the straight bonus shown during FX. */
  straightBonusCents: z.number().int().nonnegative().optional(),
  /** Straight length (3–5) shown during FX. */
  straightBonusLength: z.number().int().min(3).max(5).optional(),
  /** Golden Hand token armed for next hand (betting) or active this round. */
  goldenHandActive: z.boolean().optional(),
  /** Player inventory of Golden Hand tokens. */
  goldenHands: z.number().int().nonnegative().optional(),
  /** Hands toward next Golden Hand (0 … threshold-1). */
  goldenHourHandsToward: z.number().int().min(0).max(499).optional(),
});
export type PublicSeat = z.infer<typeof PublicSeatSchema>;

export const PublicDealerSchema = z.object({
  cards: z.array(PublicCardSchema),
  value: HandValueSchema.nullable(),
});
export type PublicDealer = z.infer<typeof PublicDealerSchema>;

export const TablePhaseSchema = z.enum([
  "betting",
  "dealing",
  "insurance",
  "playerTurns",
  "dealer",
  "settle",
]);
export type TablePhase = z.infer<typeof TablePhaseSchema>;

export const TableSpinPhaseSchema = z.enum(["offer", "result"]);
export type TableSpinPhase = z.infer<typeof TableSpinPhaseSchema>;

export const TableSpinStateSchema = z.object({
  seatIndex: z.number().int(),
  userId: z.string(),
  name: z.string(),
  phase: TableSpinPhaseSchema,
  /** Epoch ms when offer auto-spins. */
  offerEndsAt: z.number().optional(),
  tileIndex: z.number().int().optional(),
  label: z.string().optional(),
  kind: z.enum(["percent", "flat", "goldenHands"]).optional(),
  pctBps: z.number().int().optional(),
  payoutCents: z.number().int().optional(),
  potBeforeCents: z.number().int().optional(),
  goldenHandsGranted: z.number().int().nonnegative().optional(),
});
export type TableSpinState = z.infer<typeof TableSpinStateSchema>;

/** Table-wide 100% jackpot celebration duration (matches client FX). */
export const JACKPOT_CELEBRATE_MS = 30_000;

export const TableStateSnapshotSchema = z.object({
  tableId: z.string(),
  name: z.string(),
  phase: TablePhaseSchema,
  phaseEndsAt: z.number().nullable(),
  seats: z.array(PublicSeatSchema),
  dealer: PublicDealerSchema,
  activeSeatIndex: z.number().int().nullable(),
  activeHandIndex: z.number().int().nullable(),
  spectatorCount: z.number().int(),
  minBetCents: z.number().int(),
  chipDenominations: z.array(z.number().int()),
  /** Present when ALLOW_TABLE_DEBUG is on. */
  debugStack: z.array(z.string()).optional(),
  debugBotsHold: z.boolean().optional(),
  /** Forced next spin tile index; null/omit = random. */
  debugSpinBias: z.number().int().nullable().optional(),
  /** Phase timer frozen (staging debug). */
  debugTimerPaused: z.boolean().optional(),
  /** Active jackpot spin on this table (spectatable). */
  spin: TableSpinStateSchema.nullable().optional(),
  /** Epoch ms until table-wide 100% celebration ends (survives spin clear). */
  jackpotCelebrateUntil: z.number().int().nullable().optional(),
});
export type TableStateSnapshot = z.infer<typeof TableStateSnapshotSchema>;

export const TableStatusSchema = z.enum(["open", "busy"]);
export type TableStatus = z.infer<typeof TableStatusSchema>;

export const LobbyTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  seatCapacity: z.number().int(),
  playerCount: z.number().int(),
  spectatorCount: z.number().int(),
  status: TableStatusSchema,
});
export type LobbyTable = z.infer<typeof LobbyTableSchema>;

/** @deprecated use LobbyTable */
export type GameTable = LobbyTable;
export const TableSchema = LobbyTableSchema;

export const TablesResponseSchema = z.object({
  tables: z.array(LobbyTableSchema),
});
export type TablesResponse = z.infer<typeof TablesResponseSchema>;

export const WalletUpdateSchema = z.object({
  balanceCents: z.number().int(),
  /** Present for admin adjust (signed: + credit / − debit). */
  creditedCents: z.number().int().optional(),
});
export type WalletUpdate = z.infer<typeof WalletUpdateSchema>;

export const SocketErrorSchema = z.object({
  message: z.string(),
});
export type SocketError = z.infer<typeof SocketErrorSchema>;

export const HandOutcomeSchema = z.object({
  id: z.string(),
  resultCents: z.number().int(),
  betCents: z.number().int(),
  isBlackjack: z.boolean(),
  doubled: z.boolean(),
  bust: z.boolean(),
  isInsurance: z.boolean().optional().default(false),
  createdAt: z.string(),
});
export type HandOutcome = z.infer<typeof HandOutcomeSchema>;

export const PlayerStatsSchema = z.object({
  handsPlayed: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  pushes: z.number().int(),
  blackjacks: z.number().int(),
  biggestWinCents: z.number().int(),
  biggestLossCents: z.number().int(),
  netProfitCents: z.number().int(),
  winRate: z.number(),
});
export type PlayerStats = z.infer<typeof PlayerStatsSchema>;

export const StatsResponseSchema = z.object({
  stats: PlayerStatsSchema,
  recent: z.array(HandOutcomeSchema),
});
export type StatsResponse = z.infer<typeof StatsResponseSchema>;

export const LeaderboardScopeSchema = z.enum(["alltime", "season"]);
export type LeaderboardScope = z.infer<typeof LeaderboardScopeSchema>;

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int(),
  userId: z.string(),
  name: z.string(),
  handsPlayed: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  pushes: z.number().int(),
  blackjacks: z.number().int(),
  netProfitCents: z.number().int(),
  biggestWinCents: z.number().int(),
  winRate: z.number(),
  isYou: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export const LeaderboardResponseSchema = z.object({
  scope: LeaderboardScopeSchema,
  seasonId: z.string().nullable(),
  seasonStartsAt: z.string().nullable(),
  seasonEndsAt: z.string().nullable(),
  entries: z.array(LeaderboardEntrySchema),
  me: LeaderboardEntrySchema.nullable(),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;

/** Available jackpot pot (loss take since epoch − spin claims). */
export const JackpotClaimEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  tableId: z.string(),
  tableName: z.string(),
  tileIndex: z.number().int(),
  kind: z.enum(["percent", "flat", "goldenHands"]),
  pctBps: z.number().int(),
  payoutCents: z.number().int(),
  potBeforeCents: z.number().int(),
  goldenHandsGranted: z.number().int().nonnegative().optional(),
  label: z.string(),
  createdAt: z.string(),
});
export type JackpotClaimEntry = z.infer<typeof JackpotClaimEntrySchema>;

export const JackpotResponseSchema = z.object({
  takeCents: z.number().int(),
  grossTakeCents: z.number().int(),
  claims: z.array(JackpotClaimEntrySchema),
});
export type JackpotResponse = z.infer<typeof JackpotResponseSchema>;

export const JackpotDeltaSchema = z.object({
  deltaCents: z.number().int(),
});
export type JackpotDelta = z.infer<typeof JackpotDeltaSchema>;

export const JackpotClaimEventSchema = JackpotClaimEntrySchema;
export type JackpotClaimEvent = z.infer<typeof JackpotClaimEventSchema>;

export const JackpotWinBroadcastSchema = z.object({
  userId: z.string(),
  name: z.string(),
  tableId: z.string(),
  tableName: z.string(),
  kind: z.enum(["percent", "flat", "goldenHands"]),
  pctBps: z.number().int(),
  payoutCents: z.number().int(),
  label: z.string(),
  goldenHandsGranted: z.number().int().nonnegative().optional(),
});
export type JackpotWinBroadcast = z.infer<typeof JackpotWinBroadcastSchema>;

export const TableStraightBonusEventSchema = z.object({
  tableId: z.string(),
  seatIndex: z.number().int().nonnegative(),
  handIndex: z.number().int().nonnegative(),
  length: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  bonusCents: z.number().int().positive(),
  cardIndices: z.array(z.number().int().nonnegative()),
  until: z.number().int(),
});
export type TableStraightBonusEvent = z.infer<
  typeof TableStraightBonusEventSchema
>;

export * from "./jackpotWheel.js";

export const TABLE_CHAT_MAX_LEN = 200;

export const TableChatSendSchema = z.object({
  text: z.string().trim().min(1).max(TABLE_CHAT_MAX_LEN),
});
export type TableChatSend = z.infer<typeof TableChatSendSchema>;

export const TableChatReadSchema = z.object({
  messageId: z.string().min(1),
});
export type TableChatRead = z.infer<typeof TableChatReadSchema>;

export const TableChatMessageSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  text: z.string(),
  at: z.string(),
  kind: z.enum(["chat", "system"]).optional(),
  seenByCount: z.number().int().nonnegative().optional(),
});
export type TableChatMessage = z.infer<typeof TableChatMessageSchema>;

export const TableChatHistorySchema = z.object({
  messages: z.array(TableChatMessageSchema),
});
export type TableChatHistory = z.infer<typeof TableChatHistorySchema>;

export const TableChatReceiptsSchema = z.object({
  messageId: z.string(),
  seenByCount: z.number().int().nonnegative(),
});
export type TableChatReceipts = z.infer<typeof TableChatReceiptsSchema>;
