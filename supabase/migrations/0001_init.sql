-- Init schema myswarms — users + sessions avec RLS
create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  created_at timestamptz default now()
);

create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz
);

alter table users enable row level security;
alter table sessions enable row level security;

drop policy if exists "users: own data" on users;
drop policy if exists "sessions: own data" on sessions;

create policy "users: own data" on users for all using (auth.uid() = id);
create policy "sessions: own data" on sessions for all using (auth.uid() = user_id);
