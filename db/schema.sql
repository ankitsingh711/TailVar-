-- Idempotent schema for the policy & claims app. Applied by scripts/migrate.mjs.
-- Business rules are enforced in the application service layer AND, as a last
-- line of defence, by the constraints and trigger below.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,                -- sha256 of the cookie token; raw token never stored
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_failures (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      TEXT NOT NULL,
  ip            TEXT NOT NULL,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_failures_lookup_idx ON login_failures(username, ip, attempted_at);

CREATE TABLE IF NOT EXISTS policies (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES users(id),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  sum_insured  NUMERIC(14, 2) NOT NULL CHECK (sum_insured > 0),
  created_by   INTEGER NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT policies_dates_chk CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS policies_customer_idx ON policies(customer_id);

CREATE TABLE IF NOT EXISTS claims (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_id      BIGINT NOT NULL REFERENCES policies(id),
  incident_date  DATE NOT NULL,
  amount         NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status         TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Approved', 'Rejected')),
  submitted_by   INTEGER NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by     INTEGER REFERENCES users(id),
  decided_at     TIMESTAMPTZ,
  CONSTRAINT claims_decision_chk CHECK ((status = 'Submitted') = (decided_at IS NULL))
);
CREATE INDEX IF NOT EXISTS claims_policy_idx ON claims(policy_id);

-- Invariant guard: runs for every write to claims, regardless of which code path made it.
CREATE OR REPLACE FUNCTION enforce_claim_rules() RETURNS trigger AS $$
DECLARE
  pol  policies%ROWTYPE;
  used NUMERIC(14, 2);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.policy_id <> OLD.policy_id OR NEW.amount <> OLD.amount
       OR NEW.incident_date <> OLD.incident_date OR NEW.submitted_by <> OLD.submitted_by THEN
      RAISE EXCEPTION 'CLAIM_IMMUTABLE: claim details cannot be changed after submission';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status <> 'Submitted' THEN
      RAISE EXCEPTION 'CLAIM_ALREADY_DECIDED: claim % is already %', OLD.id, OLD.status;
    END IF;
    -- Submitted -> Approved keeps the amount consumed; Submitted -> Rejected releases it.
    -- Neither transition can increase usage, so no SI check is needed here.
    RETURN NEW;
  END IF;

  IF NEW.status <> 'Submitted' THEN
    RAISE EXCEPTION 'CLAIM_INVALID_STATUS: new claims must start in Submitted status';
  END IF;

  -- Lock the policy row so concurrent submissions against it are serialised.
  SELECT * INTO pol FROM policies WHERE id = NEW.policy_id FOR UPDATE;
  IF NEW.incident_date < pol.start_date OR NEW.incident_date > pol.end_date THEN
    RAISE EXCEPTION 'INCIDENT_OUTSIDE_COVERAGE: incident date % is outside % to %',
      NEW.incident_date, pol.start_date, pol.end_date;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO used
    FROM claims WHERE policy_id = NEW.policy_id AND status IN ('Submitted', 'Approved');
  IF used + NEW.amount > pol.sum_insured THEN
    RAISE EXCEPTION 'SUM_INSURED_EXCEEDED: claim % exceeds remaining claimable SI %',
      NEW.amount, pol.sum_insured - used;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS claims_enforce_rules ON claims;
CREATE TRIGGER claims_enforce_rules
  BEFORE INSERT OR UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION enforce_claim_rules();

-- Read models used by the API.
CREATE OR REPLACE VIEW policy_summary AS
SELECT p.id,
       p.customer_id,
       u.username     AS customer_username,
       u.display_name AS customer_name,
       p.start_date,
       p.end_date,
       p.sum_insured,
       COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'Submitted'), 0)::NUMERIC(14, 2) AS pending_amount,
       COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'Approved'), 0)::NUMERIC(14, 2)  AS approved_amount,
       (p.sum_insured
         - COALESCE(SUM(c.amount) FILTER (WHERE c.status IN ('Submitted', 'Approved')), 0))::NUMERIC(14, 2)
                      AS remaining_si,
       COUNT(c.id)::INTEGER AS claim_count,
       p.created_at
  FROM policies p
  JOIN users u ON u.id = p.customer_id
  LEFT JOIN claims c ON c.policy_id = p.id
 GROUP BY p.id, u.id;

CREATE OR REPLACE VIEW claim_details AS
SELECT c.id,
       c.policy_id,
       p.customer_id,
       u.username     AS customer_username,
       u.display_name AS customer_name,
       c.incident_date,
       c.amount,
       c.status,
       c.created_at   AS submitted_at,
       c.decided_at,
       d.username     AS decided_by
  FROM claims c
  JOIN policies p ON p.id = c.policy_id
  JOIN users u ON u.id = p.customer_id
  LEFT JOIN users d ON d.id = c.decided_by;
