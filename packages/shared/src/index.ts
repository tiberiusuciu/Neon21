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
});
export type AdminUserRow = z.infer<typeof AdminUserRowSchema>;

export const AdminUsersResponseSchema = z.object({
  users: z.array(AdminUserRowSchema),
});
export type AdminUsersResponse = z.infer<typeof AdminUsersResponseSchema>;

export const AdminTopUpBodySchema = z.object({
  dollars: z.number().positive().max(1_000_000),
});
export type AdminTopUpBody = z.infer<typeof AdminTopUpBodySchema>;

export const AdminTopUpResponseSchema = z.object({
  user: AdminUserRowSchema,
  creditedCents: z.number().int().positive(),
});
export type AdminTopUpResponse = z.infer<typeof AdminTopUpResponseSchema>;

export const AdminResetStatsBodySchema = z.discriminatedUnion("period", [
  z.object({ period: z.literal("season") }),
  z.object({ period: z.literal("alltime") }),
  z.object({
    period: z.literal("custom"),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
]);
export type AdminResetStatsBody = z.infer<typeof AdminResetStatsBodySchema>;

export const AdminResetStatsResponseSchema = z.object({
  user: AdminUserRowSchema,
  deletedOutcomes: z.number().int().nonnegative(),
  period: z.enum(["season", "alltime", "custom"]),
  from: z.string().nullable(),
  to: z.string().nullable(),
});
export type AdminResetStatsResponse = z.infer<
  typeof AdminResetStatsResponseSchema
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

export const CHIP_DENOMINATIONS_CENTS = [500, 1000, 2500, 5000, 10000] as const;
export type ChipDenominationCents = (typeof CHIP_DENOMINATIONS_CENTS)[number];

export const MIN_BET_CENTS = 500;
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

export const PublicHandSchema = z.object({
  cards: z.array(PublicCardSchema),
  value: HandValueSchema,
  betCents: z.number().int(),
  isBlackjack: z.boolean(),
  stood: z.boolean(),
  doubled: z.boolean(),
  resultCents: z.number().int().nullable(),
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
  connected: z.boolean(),
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
});
export type TableStateSnapshot = z.infer<typeof TableStateSnapshotSchema>;

export const TableStatusSchema = z.enum(["open", "busy"]);
export type TableStatus = z.infer<typeof TableStatusSchema>;

export const LobbyTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  seatCapacity: z.number().int(),
  playerCount: z.number().int(),
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
