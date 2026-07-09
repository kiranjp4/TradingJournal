-- Trading Journal - KJP
-- Run this in Supabase Dashboard → SQL Editor

create table if not exists journal_sheets (
  slug text primary key,
  title text not null,
  sheet_name text not null,
  icon text default 'book',
  col_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists journal_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_slug text not null references journal_sheets(slug) on delete cascade,
  row_index integer not null,
  cells jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (sheet_slug, row_index)
);

create index if not exists journal_rows_sheet_slug_idx on journal_rows(sheet_slug);
create index if not exists journal_rows_row_index_idx on journal_rows(sheet_slug, row_index);

alter table journal_sheets enable row level security;
alter table journal_rows enable row level security;

drop policy if exists "Authenticated users can read sheets" on journal_sheets;
drop policy if exists "Authenticated users can manage sheets" on journal_sheets;
drop policy if exists "Authenticated users can read rows" on journal_rows;
drop policy if exists "Authenticated users can manage rows" on journal_rows;

create policy "Authenticated users can read sheets"
  on journal_sheets for select
  to authenticated
  using (true);

create policy "Authenticated users can manage sheets"
  on journal_sheets for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can read rows"
  on journal_rows for select
  to authenticated
  using (true);

create policy "Authenticated users can manage rows"
  on journal_rows for all
  to authenticated
  using (true)
  with check (true);
