import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getPool } from "./db";
import { AppError, forbidden, unauthorized } from "./errors";
import type { Role, SessionUser } from "./types";

export const SESSION_COOKIE = "tv_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MINUTES = 15;
// Compared against when the username does not exist, so response time does not reveal valid usernames.
const DUMMY_HASH = "$2b$10$wS6llvRzG.Pv9UHQ5.ynfOPRhJb2tGtiASi.5lm6Dk9dcOi9uUiP.";

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

interface UserRow {
  id: number;
  username: string;
  role: Role;
  display_name: string;
}

const toSessionUser = (r: UserRow): SessionUser => ({
  id: r.id,
  username: r.username,
  role: r.role,
  displayName: r.display_name,
});

/** Verifies credentials, with a per (username, IP) brute-force limit. */
export async function authenticate(usernameInput: unknown, passwordInput: unknown, ip: string): Promise<SessionUser> {
  if (typeof usernameInput !== "string" || typeof passwordInput !== "string" || !usernameInput || !passwordInput) {
    throw new AppError(400, "VALIDATION_ERROR", "Username and password are required.");
  }
  const username = usernameInput.trim().toLowerCase().slice(0, 100);
  const password = passwordInput.slice(0, 200);
  const db = getPool();

  const { rows: fails } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM login_failures
      WHERE username = $1 AND ip = $2 AND attempted_at > now() - make_interval(mins => $3)`,
    [username, ip, FAILURE_WINDOW_MINUTES],
  );
  if (fails[0].n >= MAX_FAILURES) {
    throw new AppError(429, "TOO_MANY_ATTEMPTS", "Too many failed login attempts. Please try again in 15 minutes.");
  }

  const { rows } = await db.query<UserRow & { password_hash: string }>(
    "SELECT id, username, role, display_name, password_hash FROM users WHERE username = $1",
    [username],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    await db.query("INSERT INTO login_failures (username, ip) VALUES ($1, $2)", [username, ip]);
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  }
  await db.query("DELETE FROM login_failures WHERE username = $1 AND ip = $2", [username, ip]);
  return toSessionUser(user);
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const db = getPool();
  // Opportunistic cleanup keeps the tables small without a scheduled job.
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  await db.query("DELETE FROM login_failures WHERE attempted_at < now() - interval '1 day'");
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))",
    [hashToken(token), userId, SESSION_TTL_SECONDS],
  );
  return token;
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const { rows } = await getPool().query<UserRow>(
    `SELECT u.id, u.username, u.role, u.display_name
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ? toSessionUser(rows[0]) : null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await getPool().query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export function assertRole(user: SessionUser | null, ...roles: Role[]): SessionUser {
  if (!user) throw unauthorized();
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}
