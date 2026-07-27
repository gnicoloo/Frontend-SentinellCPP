-- Sentinel-CPP -- Supabase schema (run once in the Supabase SQL editor).
-- Tables are fed by scripts/sync_to_supabase.py (service-role key) and read
-- by the React frontend (anon key, authenticated users only via RLS).
--
-- Referential integrity: every alert table points at `wallets`, so `wallets`
-- MUST be created first (the order below is already correct). The sync script
-- upserts a stub `wallets` row (address only) for every referenced address
-- BEFORE inserting its alerts -- see ensure_wallet_stubs() in
-- scripts/sync_to_supabase.py -- because alerts.db knows wallets that
-- /wallet_snapshot may not have reported yet.

-- ---------------------------------------------------------------------------
-- wallets: latest known profile snapshot per tracked wallet (upserted from
-- GET /wallet_snapshot). profile jsonb carries the full serialized profile.
-- Addresses are stored lowercase (EIP-55 is only a display checksum), the
-- same normalization OracleBlacklist/ManualSuspectList do on the C++ side.
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
    address text primary key,
    label text,
    suspicious_score double precision default 0,
    info_score double precision default 0,
    forensic_score double precision default 0,
    deception_score double precision default 0,
    roi_estimate double precision default 0,
    trades_count bigint default 0,
    win_count bigint default 0,
    total_volume double precision default 0,
    total_profit double precision default 0,
    first_seen_ms bigint,
    last_seen_ms bigint,
    profile jsonb,
    updated_at timestamptz not null default now()
);
create index if not exists idx_wallets_info_score on public.wallets (info_score desc);
create index if not exists idx_wallets_suspicious on public.wallets (suspicious_score desc);

-- ---------------------------------------------------------------------------
-- alerts: unified feed of every alert row synced from alerts.db.
-- source_table + source_rowid make the sync idempotent (unique constraint).
-- wallet_address references wallets.address (nullable, because some alerts
-- like TWAP patterns carry no single wallet).
--
-- NOTE: chk_alerts_type must stay in sync with the SOURCES map in
-- scripts/sync_to_supabase.py -- adding a source table there without adding
-- its alert_type here makes the whole sync pass fail on insert.
-- ---------------------------------------------------------------------------
create table if not exists public.alerts (
    id bigint generated always as identity primary key,
    source_table text not null,          -- oracle_moves | suspect_moves | twap_alerts | deception_alerts | cluster_moves | wallet_alerts
    source_rowid bigint not null,
    alert_type text not null,            -- oracle_move | suspect_trade | twap_pattern | deception_alert | cluster_move | wallet_alert
    wallet_address text,
    asset_id text,
    market_title text,
    timestamp_ms bigint,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    unique (source_table, source_rowid),
    -- FK verso wallets (nullable: gli alert senza wallet restano null)
    constraint fk_alerts_wallet foreign key (wallet_address)
        references public.wallets(address) on delete set null on update cascade,
    -- Vincolo per tipi di alert ammessi
    constraint chk_alerts_type check (
        alert_type in ('oracle_move', 'suspect_trade', 'twap_pattern',
                       'deception_alert', 'cluster_move', 'trade_anomaly',
                       'wallet_alert', 'hot_wallet', 'forensic_alert', 'intelligence_alert')
    )
);
create index if not exists idx_alerts_type on public.alerts (alert_type);
create index if not exists idx_alerts_wallet on public.alerts (wallet_address);
create index if not exists idx_alerts_timestamp on public.alerts (timestamp_ms desc);

-- ---------------------------------------------------------------------------
-- Typed mirrors for the richer detectors (optional but handy for the UI).
-- ---------------------------------------------------------------------------

-- twap_patterns: no wallet FK -- a TWAP window lists 0..N wallets in `wallets`
-- (jsonb array), so there is no single parent row to reference.
create table if not exists public.twap_patterns (
    id bigint generated always as identity primary key,
    source_rowid bigint not null unique,
    condition_id text not null,
    market_slug text,
    start_time bigint,
    end_time bigint,
    trade_count integer,
    avg_size double precision,
    total_volume double precision,
    cadence_seconds double precision,
    wallets jsonb,
    created_at timestamptz not null default now()
);

-- deception_alerts: FK obbligatoria verso wallets
create table if not exists public.deception_alerts (
    id bigint generated always as identity primary key,
    source_rowid bigint not null unique,
    wallet_address text not null,
    deception_score double precision not null,
    roi_discrepancy_score double precision,
    loss_cluster_score double precision,
    asymmetry_score double precision,
    breakdown jsonb,
    timestamp_ms bigint,
    created_at timestamptz not null default now(),
    constraint fk_deception_wallet foreign key (wallet_address)
        references public.wallets(address) on delete cascade on update cascade
);
create index if not exists idx_deception_wallet on public.deception_alerts (wallet_address);

-- suspect_moves: FK obbligatoria verso wallets
create table if not exists public.suspect_moves (
    id bigint generated always as identity primary key,
    source_rowid bigint not null unique,
    wallet_address text not null,
    label text,
    asset_id text,
    market_title text,
    price double precision,
    size double precision,
    side text,
    roi_estimate double precision,
    deception_flags text,
    timestamp_ms bigint,
    market_url text,
    created_at timestamptz not null default now(),
    constraint fk_suspect_wallet foreign key (wallet_address)
        references public.wallets(address) on delete cascade on update cascade
);
create index if not exists idx_suspect_wallet on public.suspect_moves (wallet_address);

-- ---------------------------------------------------------------------------
-- last_sync: sync bookmark per source table (written by the sync script).
-- ---------------------------------------------------------------------------
create table if not exists public.last_sync (
    source_table text primary key,
    last_rowid bigint not null default 0,
    synced_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: authenticated users read everything; only the service role writes
-- (the service-role key bypasses RLS, so no write policies are needed).
-- ---------------------------------------------------------------------------
alter table public.wallets enable row level security;
alter table public.alerts enable row level security;
alter table public.twap_patterns enable row level security;
alter table public.deception_alerts enable row level security;
alter table public.suspect_moves enable row level security;
alter table public.last_sync enable row level security;

drop policy if exists "read wallets" on public.wallets;
create policy "read wallets" on public.wallets for select to authenticated using (true);
drop policy if exists "read alerts" on public.alerts;
create policy "read alerts" on public.alerts for select to authenticated using (true);
drop policy if exists "read twap" on public.twap_patterns;
create policy "read twap" on public.twap_patterns for select to authenticated using (true);
drop policy if exists "read deception" on public.deception_alerts;
create policy "read deception" on public.deception_alerts for select to authenticated using (true);
drop policy if exists "read suspects" on public.suspect_moves;
create policy "read suspects" on public.suspect_moves for select to authenticated using (true);

-- Realtime: the frontend subscribes to INSERTs on alerts.
alter publication supabase_realtime add table public.alerts;
