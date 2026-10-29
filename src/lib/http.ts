import { cookies } from "next/headers";
import { AppError } from "./errors";
import { SESSION_COOKIE, getSessionUser } from "./auth";
import type { SessionUser } from "./types";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps errors to JSON responses: AppError -> its status; DB trigger guards -> 422; anything else -> 500. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  const pgErr = err as { code?: string; message?: string };
  if (pgErr?.code === "P0001" && pgErr.message) {
    // Raised by the enforce_claim_rules trigger, e.g. "SUM_INSURED_EXCEEDED: ...".
    const [code, ...rest] = pgErr.message.split(": ");
    const status = code === "CLAIM_ALREADY_DECIDED" ? 409 : 422;
    return json({ error: { code, message: rest.join(": ") || pgErr.message } }, status);
  }
  if (pgErr?.code === "23514") {
    return json({ error: { code: "VALIDATION_ERROR", message: "Request violates a data constraint." } }, 400);
  }
  console.error(err);
  return json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, 500);
}

/**
 * Rejects cross-site state-changing requests. Together with SameSite=Lax cookies and the
 * application/json requirement in readJson (which forces a CORS preflight), this blocks CSRF.
 */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {}
  if (originHost !== host) throw new AppError(403, "CSRF_REJECTED", "Cross-origin request rejected.");
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Request body must be JSON (Content-Type: application/json).");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(400, "INVALID_JSON", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getSessionUser(store.get(SESSION_COOKIE)?.value);
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
