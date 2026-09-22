import type { FastifyInstance } from "fastify";
import oauth2Plugin from "@fastify/oauth2";
import {
  RegisterBodySchema,
  LoginBodySchema,
  UpdateNameBodySchema,
} from "@neon21/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword, toPublicUser } from "../lib/auth.js";
import { env } from "../env.js";

// CJS export loses static config props under NodeNext; restore at type level.
const oauth2 = oauth2Plugin as typeof oauth2Plugin & {
  GOOGLE_CONFIGURATION: {
    authorizeHost: string;
    authorizePath: string;
    tokenHost: string;
    tokenPath: string;
  };
};

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const parsed = RegisterBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { name, email, password } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, nameChosen: true },
    });

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: toPublicUser(user) };
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = LoginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: toPublicUser(user) };
  });

  app.get(
    "/auth/me",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
      });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }
      return { user: toPublicUser(user) };
    }
  );

  app.patch(
    "/auth/me",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = UpdateNameBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const user = await prisma.user.update({
        where: { id: request.user.sub },
        data: { name: parsed.data.name, nameChosen: true },
      });
      return { user: toPublicUser(user) };
    }
  );

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    await app.register(oauth2, {
      name: "googleOAuth2",
      scope: ["profile", "email"],
      credentials: {
        client: {
          id: env.GOOGLE_CLIENT_ID,
          secret: env.GOOGLE_CLIENT_SECRET,
        },
        auth: oauth2.GOOGLE_CONFIGURATION,
      },
      startRedirectPath: "/auth/google",
      callbackUri: env.GOOGLE_CALLBACK_URL,
    });

    app.get("/auth/google/callback", async (request, reply) => {
      const token =
        await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(
          request
        );

      const res = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${token.token.access_token}`,
          },
        }
      );

      if (!res.ok) {
        return reply.status(502).send({ error: "Failed to fetch Google profile" });
      }

      const profile = (await res.json()) as {
        id: string;
        email: string;
        name?: string;
      };

      if (!profile.email || !profile.id) {
        return reply.status(400).send({ error: "Incomplete Google profile" });
      }

      let user = await prisma.user.findFirst({
        where: {
          OR: [{ googleId: profile.id }, { email: profile.email }],
        },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: profile.name ?? profile.email.split("@")[0],
            email: profile.email,
            googleId: profile.id,
            nameChosen: false,
          },
        });
      } else if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: profile.id },
        });
      }

      const jwt = app.jwt.sign({ sub: user.id, email: user.email });
      const primaryOrigin = env.CORS_ORIGIN.split(",")[0]?.trim();
      if (!primaryOrigin) {
        return reply.status(500).send({ error: "CORS_ORIGIN is not configured" });
      }
      const path = user.nameChosen ? "/lobby" : "/onboarding";
      const cookieHeader = request.headers.cookie ?? "";
      const nativeApp =
        /(?:^|;\s*)neon21_oauth_native=1(?:;|$)/.test(cookieHeader);

      if (nativeApp) {
        reply.header(
          "Set-Cookie",
          "neon21_oauth_native=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
        );
        const deep = new URL("com.neon21.app://auth/callback");
        deep.searchParams.set("token", jwt);
        deep.searchParams.set("next", path);
        return reply.redirect(deep.toString());
      }

      const redirectUrl = new URL(path, primaryOrigin);
      redirectUrl.searchParams.set("token", jwt);
      return reply.redirect(redirectUrl.toString());
    });

    // Capacitor entry: mark session, then start the same Google OAuth flow.
    app.get("/auth/google/mobile", async (_request, reply) => {
      reply.header(
        "Set-Cookie",
        "neon21_oauth_native=1; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax"
      );
      return reply.redirect("/auth/google");
    });
  } else {
    app.get("/auth/google", async (_request, reply) => {
      return reply.status(503).send({
        error:
          "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      });
    });
  }
}

declare module "fastify" {
  interface FastifyInstance {
    googleOAuth2: {
      getAccessTokenFromAuthorizationCodeFlow: (
        request: import("fastify").FastifyRequest
      ) => Promise<{ token: { access_token: string } }>;
    };
  }
}
