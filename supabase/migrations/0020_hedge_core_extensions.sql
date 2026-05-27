-- HEDGE Edge v2 — extensions + helper for audit hash chain
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- Hash chain helper: hex(sha256(prev_hash || canonical(row_jsonb)))
-- Use canonical_json (key-sorted) to produce stable hashes across writers.
create or replace function hedge_canonical_json(payload jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(
    (
      select string_agg(
        format('%s:%s', to_jsonb(k.key)::text, k.value::text),
        ','
        order by k.key
      )
      from jsonb_each(payload) as k
    ),
    ''
  )
$$;

create or replace function hedge_chain_hash(prev_hash text, payload jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select encode(
    digest(coalesce(prev_hash, '') || hedge_canonical_json(payload), 'sha256'),
    'hex'
  )
$$;

comment on function hedge_chain_hash is
  'Computes the audit chain hash for a row: sha256(prev_hash || canonical_json(payload)).';
