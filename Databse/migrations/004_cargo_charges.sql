-- Backfill migration: documents the `cargo_charges` table (itemized per-cargo charges,
-- shown in the invoice breakdown on cargo creation). This table already exists on the
-- live database — it was created ad hoc during the enterprise-upgrade work and was never
-- committed as a migration file, leaving Databse/migrations/ out of sync with reality.
-- Written IF NOT EXISTS / idempotently so it is safe to run against a database that
-- already has the table, and works as the authoritative source for a fresh database.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cargo_charges (
    charge_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cargo_id    INTEGER NOT NULL REFERENCES public.cargo(cargo_id) ON DELETE CASCADE,
    charge_name VARCHAR(150) NOT NULL,
    amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    note        TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by  INTEGER REFERENCES public.users(user_id) ON DELETE SET NULL,
    updated_by  INTEGER REFERENCES public.users(user_id) ON DELETE SET NULL,
    deleted     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_cargo_charges_cargo_id
    ON public.cargo_charges (cargo_id)
    WHERE (deleted = false);

COMMIT;
