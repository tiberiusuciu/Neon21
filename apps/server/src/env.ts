import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  ADMIN_EMAIL: z.union([z.literal(""), z.string().email()]).default(""),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_CALLBACK_URL: z
    .string()
    .default("http://localhost:4000/auth/google/callback"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  HOST: z.string().default("0.0.0.0"),
});

const parsed = envSchema.parse(process.env);

function corsOrigins(raw: string): boolean | string | string[] {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const extras = [
    "capacitor://localhost",
    "http://localhost",
    "https://localhost",
    "ionic://localhost",
    "http://localhost:5173",
  ];
  const set = new Set([...parts, ...extras]);
  return [...set];
}

export const env = {
  ...parsed,
  corsOrigin: corsOrigins(parsed.CORS_ORIGIN),
};
