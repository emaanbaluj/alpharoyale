create table positions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references auth.users(id),
  symbol varchar(10) not null,
  side varchar(4) not null,
  quantity decimal(20,8) not null,
  entry_price decimal(20,8) not null,
  current_price decimal(20,8),
  leverage integer default 1,
  unrealized_pnl decimal(20,2) default 0,
  opened_at timestamptz default now(),
  closed_at timestamptz,
  status varchar(20) default 'open',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_positions_game_player on positions(game_id, player_id);
create index idx_positions_status on positions(status);

-- Constraints
alter table positions
  add constraint quantity_positive check (quantity > 0),
  add constraint price_positive check (entry_price > 0),
  add constraint valid_side check (side in ('BUY', 'SELL')),
  add constraint valid_status check (status in ('open', 'closed')),
  add constraint leverage_positive check (leverage >= 1);

-- Prevent duplicate open positions
create unique index unique_open_position
on positions (game_id, player_id, symbol)
where status = 'open';

-- RLS
alter table positions enable row level security;

create policy "players view own positions"
on positions
for select using (auth.uid() = player_id);

create policy "players insert own positions"
on positions
for insert with check (auth.uid() = player_id);

create policy "players update own positions"
on positions
for update using (auth.uid() = player_id);

create policy "players delete own positions"
on positions
for delete using (auth.uid() = player_id);