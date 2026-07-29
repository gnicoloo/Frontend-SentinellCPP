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
-- positions: live exposure book, one row per (wallet, outcome token) -- WHICH
-- contract, on WHICH option, how many and for how much. Fed from
-- GET /positions (see src/ExposureTracker.h), upserted on every sync pass.
-- ---------------------------------------------------------------------------
create table if not exists public.positions (
    wallet_address text not null,
    asset_id text not null,           -- ERC1155 outcome token
    condition_id text,                -- market condition
    market_title text,
    outcome text,                     -- 'Yes' / 'No' -- l'opzione
    net_contracts double precision default 0,   -- + long, - short
    avg_entry_price double precision default 0,
    notional_usd double precision default 0,    -- |net| * avg_entry_price
    total_bought double precision default 0,
    total_sold double precision default 0,
    realized_pnl double precision default 0,
    unrealized_pnl double precision default 0,
    last_price double precision default 0,
    trade_count bigint default 0,
    first_trade_ms bigint,
    last_trade_ms bigint,
    updated_at timestamptz not null default now(),
    primary key (wallet_address, asset_id),
    constraint fk_positions_wallet foreign key (wallet_address)
        references public.wallets(address) on delete cascade on update cascade
);
create index if not exists idx_positions_wallet on public.positions (wallet_address);
create index if not exists idx_positions_notional on public.positions (notional_usd desc);
create index if not exists idx_positions_condition on public.positions (condition_id);

-- ---------------------------------------------------------------------------
-- clusters: one row per correlation cluster with its COMBINED book -- the
-- aggregate (wallets, total contracts, total capital, per-outcome legs), not
-- the single operation. Fed from GET /clusters.
-- ---------------------------------------------------------------------------
create table if not exists public.clusters (
    cluster_key text primary key,     -- lowest member address (stable id)
    wallets jsonb not null,           -- member addresses
    wallet_count integer default 0,
    wallets_with_positions integer default 0,
    total_notional_usd double precision default 0,
    gross_contracts double precision default 0,
    realized_pnl double precision default 0,
    unrealized_pnl double precision default 0,
    market_count integer default 0,
    legs jsonb,                       -- per-outcome breakdown, biggest first
    updated_at timestamptz not null default now()
);
create index if not exists idx_clusters_notional on public.clusters (total_notional_usd desc);

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
alter table public.positions enable row level security;
alter table public.clusters enable row level security;
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
drop policy if exists "read positions" on public.positions;
create policy "read positions" on public.positions for select to authenticated using (true);
drop policy if exists "read clusters" on public.clusters;
create policy "read clusters" on public.clusters for select to authenticated using (true);
drop policy if exists "read last_sync" on public.last_sync;
create policy "read last_sync" on public.last_sync for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Migration for databases created by an EARLIER version of this file.
-- `create table if not exists` skips existing tables wholesale -- constraints
-- included -- so the FKs and the CHECK above never reach a database that
-- already had the tables. These blocks add them only when missing, and are
-- no-ops on a fresh install.
--
-- If one of them fails with "violates foreign key constraint", the offending
-- table holds alerts for wallets that are not in `wallets`: run one sync pass
-- with the current scripts/sync_to_supabase.py (it upserts wallet stubs
-- first) and re-run this file.
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_constraint
                   where conname = 'fk_alerts_wallet' and conrelid = 'public.alerts'::regclass) then
        alter table public.alerts add constraint fk_alerts_wallet
            foreign key (wallet_address) references public.wallets(address)
            on delete set null on update cascade;
    end if;

    if not exists (select 1 from pg_constraint
                   where conname = 'chk_alerts_type' and conrelid = 'public.alerts'::regclass) then
        alter table public.alerts add constraint chk_alerts_type check (
            alert_type in ('oracle_move', 'suspect_trade', 'twap_pattern',
                           'deception_alert', 'cluster_move', 'trade_anomaly',
                           'wallet_alert', 'hot_wallet', 'forensic_alert', 'intelligence_alert')
        );
    end if;

    if not exists (select 1 from pg_constraint
                   where conname = 'fk_deception_wallet' and conrelid = 'public.deception_alerts'::regclass) then
        alter table public.deception_alerts add constraint fk_deception_wallet
            foreign key (wallet_address) references public.wallets(address)
            on delete cascade on update cascade;
    end if;

    if not exists (select 1 from pg_constraint
                   where conname = 'fk_suspect_wallet' and conrelid = 'public.suspect_moves'::regclass) then
        alter table public.suspect_moves add constraint fk_suspect_wallet
            foreign key (wallet_address) references public.wallets(address)
            on delete cascade on update cascade;
    end if;

    if not exists (select 1 from pg_constraint
                   where conname = 'fk_positions_wallet' and conrelid = 'public.positions'::regclass) then
        alter table public.positions add constraint fk_positions_wallet
            foreign key (wallet_address) references public.wallets(address)
            on delete cascade on update cascade;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: the frontend subscribes to INSERTs on alerts. ALTER PUBLICATION
-- has no IF NOT EXISTS form, so re-running this file would fail with
-- "relation is already member of publication" -- hence the guard.
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'alerts'
    ) then
        alter publication supabase_realtime add table public.alerts;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- alert_trades: fill-per-fill data (tape) synced from alerts.db
-- ---------------------------------------------------------------------------
create table if not exists public.alert_trades (
    id bigint generated by default as identity primary key,
    source_rowid bigint not null,
    wallet_address text not null references public.wallets(address) on delete cascade on update cascade,
    asset_id text not null,
    market_title text,
    price double precision not null,
    size double precision not null,
    side text not null,
    estimated_pnl double precision,
    timestamp_ms bigint not null,
    created_at timestamptz not null default now()
);
create unique index if not exists idx_alert_trades_source on public.alert_trades (source_rowid);
alter table public.alert_trades enable row level security;
drop policy if exists "read alert_trades" on public.alert_trades;
create policy "read alert_trades" on public.alert_trades for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Supporting indexes for the aggregates below.
--
-- twap_patterns is queried by overlapping window (start_time/end_time) and by
-- jsonb containment on `wallets`; without these it is a sequential scan that
-- degrades with every detected window.
-- ---------------------------------------------------------------------------
create index if not exists idx_twap_start on public.twap_patterns (start_time);
create index if not exists idx_twap_end on public.twap_patterns (end_time desc);
create index if not exists idx_twap_wallets on public.twap_patterns using gin (wallets);

-- ===========================================================================
-- Aggregates.
--
-- WHY THESE EXIST: every chart and KPI used to be computed in the browser from
-- a capped row fetch (`.order('timestamp_ms', desc).limit(6000)`). Once the
-- window held more than the cap, Postgres returned only the NEWEST rows, so a
-- 30-day chart silently drew a single day and every "vs prior window" delta
-- compared a full window against an empty one. The bug grew with the database.
--
-- Aggregating here makes the payload proportional to the number of BUCKETS
-- (~30 rows), not to the number of alerts, so the figures stay exact at any
-- table size. All of these are SECURITY INVOKER (the default), so the RLS
-- select policies above still decide what the caller may read.
--
-- Bucket indexing mirrors bucketize() in src/lib/range.ts exactly: the grid is
-- anchored to the caller's [p_start, p_end] and split into p_buckets equal
-- slices, with the final bucket closed on the right. The frontend computes
-- p_buckets from the active range, so both sides always agree on the grid.
-- ===========================================================================

-- Alert flow per (bucket, alert_type), with the same optional filters the
-- Alert Explorer applies -- one definition serves the chart on every page.
-- p_wallet is an EQUALITY match (the wallet detail page, which can then use
-- idx_alerts_wallet); p_wallet_like is the Explorer's substring search. Keeping
-- them apart stops the common case from degrading into a full scan.
create or replace function public.alert_buckets(
    p_start       bigint,
    p_end         bigint,
    p_buckets     integer,
    p_wallet      text default null,
    p_wallet_like text default null,
    p_market      text default null,
    p_types       text[] default null
)
returns table (bucket_index integer, alert_type text, n bigint)
language sql
stable
as $$
    select
        least(p_buckets - 1,
              greatest(0, floor((a.timestamp_ms - p_start)::numeric
                                * p_buckets / nullif(p_end - p_start, 0))::int)),
        a.alert_type,
        count(*)::bigint
    from public.alerts a
    where a.timestamp_ms >= p_start
      and a.timestamp_ms <= p_end
      and (p_wallet      is null or a.wallet_address = p_wallet)
      and (p_wallet_like is null or a.wallet_address ilike '%' || p_wallet_like || '%')
      and (p_market      is null or a.market_title   ilike '%' || p_market || '%')
      and (p_types       is null or a.alert_type = any(p_types))
    group by 1, 2
$$;

-- The KPI row for one window. Called twice (current + prior) so the deltas
-- compare two exact counts instead of two truncated samples.
create or replace function public.alert_window_stats(
    p_start  bigint,
    p_end    bigint,
    p_severe text[] default null,
    p_wallet text default null
)
returns table (total bigint, severe bigint, wallets bigint, markets bigint)
language sql
stable
as $$
    select
        count(*)::bigint,
        count(*) filter (
            where p_severe is not null and a.alert_type = any(p_severe)
        )::bigint,
        count(distinct a.wallet_address)::bigint,
        count(distinct coalesce(a.market_title, a.asset_id))::bigint
    from public.alerts a
    where a.timestamp_ms >= p_start
      and a.timestamp_ms <= p_end
      and (p_wallet is null or a.wallet_address = p_wallet)
$$;

-- Top markets ('market') or top wallets ('wallet') by alert flow in a window,
-- each with its distinct-wallet count and its dominant alert type.
create or replace function public.alert_top_entities(
    p_start     bigint,
    p_end       bigint,
    p_dimension text,
    p_limit     integer default 8,
    p_wallet    text default null
)
returns table (key text, total bigint, wallets bigint, dominant text, types text[])
language sql
stable
as $$
    with scoped as (
        select
            case when p_dimension = 'wallet'
                 then a.wallet_address
                 else coalesce(a.market_title, a.asset_id)
            end as key,
            a.wallet_address,
            a.alert_type
        from public.alerts a
        where a.timestamp_ms >= p_start
          and a.timestamp_ms <= p_end
          and (p_wallet is null or a.wallet_address = p_wallet)
    ),
    filtered as (
        select * from scoped where key is not null
    ),
    totals as (
        select f.key,
               count(*) as total,
               count(distinct f.wallet_address) as wallets,
               array_agg(distinct f.alert_type) as types
        from filtered f
        group by f.key
        order by count(*) desc
        limit p_limit
    ),
    by_type as (
        select f.key, f.alert_type, count(*) as c
        from filtered f
        join totals t on t.key = f.key
        group by f.key, f.alert_type
    ),
    -- row_number() rather than distinct on: the tie-breaker `c` does not have
    -- to appear in the select list, and ties resolve deterministically.
    dom as (
        select key, alert_type
        from (
            select key, alert_type,
                   row_number() over (partition by key order by c desc, alert_type) as rn
            from by_type
        ) ranked
        where rn = 1
    )
    select t.key, t.total, t.wallets, d.alert_type, t.types
    from totals t
    left join dom d on d.key = t.key
    order by t.total desc
$$;

-- Bucketed flow for an explicit set of wallets or markets -- the sparklines.
-- Keyed by an array so a page fetches series only for the rows it renders.
create or replace function public.alert_entity_series(
    p_start     bigint,
    p_end       bigint,
    p_buckets   integer,
    p_dimension text,
    p_keys      text[]
)
returns table (key text, bucket_index integer, n bigint)
language sql
stable
as $$
    select
        case when p_dimension = 'wallet'
             then a.wallet_address
             else coalesce(a.market_title, a.asset_id)
        end,
        least(p_buckets - 1,
              greatest(0, floor((a.timestamp_ms - p_start)::numeric
                                * p_buckets / nullif(p_end - p_start, 0))::int)),
        count(*)::bigint
    from public.alerts a
    where a.timestamp_ms >= p_start
      and a.timestamp_ms <= p_end
      and (case when p_dimension = 'wallet'
                then a.wallet_address
                else coalesce(a.market_title, a.asset_id)
           end) = any(p_keys)
    group by 1, 2
$$;

-- Exact alert count per wallet in a window, for the screener's Flow column.
create or replace function public.alert_wallet_counts(
    p_start     bigint,
    p_end       bigint,
    p_addresses text[]
)
returns table (wallet_address text, n bigint)
language sql
stable
as $$
    select a.wallet_address, count(*)::bigint
    from public.alerts a
    where a.timestamp_ms >= p_start
      and a.timestamp_ms <= p_end
      and a.wallet_address = any(p_addresses)
    group by a.wallet_address
$$;

-- ---------------------------------------------------------------------------
-- Exposure aggregates. `positions` is a live snapshot with no time dimension,
-- but it was summed from a capped fetch too, so "capital at risk" understated
-- the book as soon as the table passed the cap.
-- ---------------------------------------------------------------------------
create or replace function public.position_totals()
returns table (
    notional   double precision,
    unrealized double precision,
    open_legs  bigint,
    wallets    bigint,
    tokens     bigint
)
language sql
stable
as $$
    select
        coalesce(sum(p.notional_usd), 0)::double precision,
        coalesce(sum(p.unrealized_pnl), 0)::double precision,
        count(*) filter (where p.net_contracts <> 0)::bigint,
        count(distinct p.wallet_address)::bigint,
        count(distinct coalesce(p.condition_id, p.asset_id))::bigint
    from public.positions p
$$;

create or replace function public.position_top_markets(p_limit integer default 8)
returns table (
    name       text,
    notional   double precision,
    unrealized double precision,
    wallets    bigint,
    dominant   text
)
language sql
stable
as $$
    with scoped as (
        select coalesce(p.market_title, p.asset_id) as name,
               p.wallet_address, p.outcome, p.notional_usd, p.unrealized_pnl
        from public.positions p
    ),
    totals as (
        select s.name,
               sum(s.notional_usd)   as notional,
               sum(s.unrealized_pnl) as unrealized,
               count(distinct s.wallet_address) as wallets
        from scoped s
        group by s.name
        order by sum(s.notional_usd) desc
        limit p_limit
    ),
    by_outcome as (
        select s.name, s.outcome, sum(s.notional_usd) as c
        from scoped s
        join totals t on t.name = s.name
        where s.outcome is not null
        group by s.name, s.outcome
    ),
    dom as (
        select name, outcome
        from (
            select name, outcome,
                   row_number() over (partition by name order by c desc, outcome) as rn
            from by_outcome
        ) ranked
        where rn = 1
    )
    select t.name, t.notional::double precision, t.unrealized::double precision,
           t.wallets, d.outcome
    from totals t
    left join dom d on d.name = t.name
    order by t.notional desc
$$;

-- Per-wallet book totals for an explicit address set (screener columns).
create or replace function public.position_wallet_totals(p_addresses text[])
returns table (
    wallet_address text,
    notional       double precision,
    unrealized     double precision
)
language sql
stable
as $$
    select p.wallet_address,
           coalesce(sum(p.notional_usd), 0)::double precision,
           coalesce(sum(p.unrealized_pnl), 0)::double precision
    from public.positions p
    where p.wallet_address = any(p_addresses)
    group by p.wallet_address
$$;

-- The anon role is never granted: every page reaches these behind a session.
grant execute on function public.alert_buckets(bigint, bigint, integer, text, text, text, text[]) to authenticated;
grant execute on function public.alert_window_stats(bigint, bigint, text[], text) to authenticated;
grant execute on function public.alert_top_entities(bigint, bigint, text, integer, text) to authenticated;
grant execute on function public.alert_entity_series(bigint, bigint, integer, text, text[]) to authenticated;
grant execute on function public.alert_wallet_counts(bigint, bigint, text[]) to authenticated;
grant execute on function public.position_totals() to authenticated;
grant execute on function public.position_top_markets(integer) to authenticated;
grant execute on function public.position_wallet_totals(text[]) to authenticated;
