create or replace function place_order(
  p_game_id uuid,
  p_player_id uuid,
  p_symbol text,
  p_order_type text,
  p_side text,
  p_quantity numeric,
  p_price numeric,
  p_trigger_price numeric,
  p_position_id uuid
)
returns orders
language plpgsql
security definer
as $$
declare
  v_balance numeric;
  v_cost numeric;
  v_order orders;
begin
  -- Lock the balance row so no race conditions
  select balance
  into v_balance
  from game_players
  where game_id = p_game_id
    and user_id = p_player_id
  for update;

  if v_balance is null then
    raise exception 'Balance not found';
  end if;

  v_cost := p_quantity * coalesce(p_price, 0);

  if v_balance < v_cost then
    raise exception 'Insufficient balance';
  end if;

  -- Deduct balance
  update game_players
  set balance = balance - v_cost
  where game_id = p_game_id
    and user_id = p_player_id;

  -- Insert order
  insert into orders (
    game_id,
    player_id,
    symbol,
    order_type,
    side,
    quantity,
    price,
    trigger_price,
    position_id,
    status
  )
  values (
    p_game_id,
    p_player_id,
    p_symbol,
    p_order_type,
    p_side,
    p_quantity,
    p_price,
    p_trigger_price,
    p_position_id,
    'pending'
  )
  returning * into v_order;

  return v_order;
end;
$$;
