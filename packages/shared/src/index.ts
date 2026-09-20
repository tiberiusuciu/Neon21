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

export const PublicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  balanceCents: z.number().int(),
  lastClaimAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

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

export const TableStatusSchema = z.enum(["open", "busy"]);
export type TableStatus = z.infer<typeof TableStatusSchema>;

export const TableSchema = z.object({
  id: z.string(),
  name: z.string(),
  seatCapacity: z.number().int(),
  status: TableStatusSchema,
  playerCount: z.number().int(),
  createdAt: z.string(),
});
export type GameTable = z.infer<typeof TableSchema>;

export const TablesResponseSchema = z.object({
  tables: z.array(TableSchema),
});
export type TablesResponse = z.infer<typeof TablesResponseSchema>;
