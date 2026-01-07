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
    v_balance       numeric;
    v_cost          numeric := 0;
    v_tick          integer;
    v_market_price  numeric;
    v_position_qty  numeric;
    v_position_side text;
    v_order         orders;
begin
    ------------------------------------------------------------------
    -- 0. Validate side & quantity
    ------------------------------------------------------------------
    if p_side not in ('BUY', 'SELL') then
        raise exception 'Invalid order side: %', p_side;
    end if;

    if p_quantity <= 0 then
        raise exception 'Quantity must be positive';
    end if;

    ------------------------------------------------------------------
    -- 1. Get current global game tick
    ------------------------------------------------------------------
    select current_tick
    into v_tick
    from game_state
    limit 1;

    if v_tick is null then
        raise exception 'Global game state not initialized';
    end if;

    ------------------------------------------------------------------
    -- 2. Get authoritative market price
    ------------------------------------------------------------------
    select price
    into v_market_price
    from price_data
    where symbol = p_symbol
      and game_state = v_tick;

    if v_market_price is null then
        raise exception
            'No price data for symbol % at tick %',
            p_symbol, v_tick;
    end if;

    ------------------------------------------------------------------
    -- 3. Order-type semantics
    ------------------------------------------------------------------
    if p_order_type = 'MARKET' then
        v_cost := p_quantity * v_market_price;

    elsif p_order_type = 'LIMIT' then
        if p_price is null then
            raise exception 'Price is required for LIMIT orders';
        end if;
        v_cost := p_quantity * p_price;

    elsif p_order_type in ('TAKE_PROFIT', 'STOP_LOSS') then
        if p_trigger_price is null then
            raise exception
                'Trigger price is required for % orders',
                p_order_type;
        end if;

        if p_position_id is null then
            raise exception
                '% orders require a position_id',
                p_order_type;
        end if;

        -- Validate referenced position
        select quantity, side
        into v_position_qty, v_position_side
        from positions
        where id = p_position_id
          and game_id = p_game_id
          and player_id = p_player_id
          and symbol = p_symbol
          and status = 'open';

        if v_position_qty is null then
            raise exception 'Referenced position not found or closed';
        end if;

        if p_quantity > v_position_qty then
            raise exception
                'TP/SL quantity exceeds position quantity';
        end if;

        -- TP/SL must CLOSE the position directionally
        if p_side = v_position_side then
            raise exception
                '% orders must close the position, not extend it',
                p_order_type;
        end if;

        -- TP / SL do NOT reserve cash
        v_cost := 0;

    else
        raise exception 'Invalid order type: %', p_order_type;
    end if;

    ------------------------------------------------------------------
    -- 4. BUY-side balance handling (MARKET / LIMIT only)
    ------------------------------------------------------------------
    if p_side = 'BUY'
       and p_order_type in ('MARKET', 'LIMIT') then

        select balance
        into v_balance
        from game_players
        where game_id = p_game_id
          and user_id = p_player_id
        for update;

        if v_balance is null then
            raise exception 'Balance not found for player %', p_player_id;
        end if;

        if v_balance < v_cost then
            raise exception 'Insufficient balance';
        end if;

        update game_players
        set balance = balance - v_cost
        where game_id = p_game_id
          and user_id = p_player_id;
    end if;

    ------------------------------------------------------------------
    -- 5. Insert order
    ------------------------------------------------------------------
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
        case
            when p_order_type = 'MARKET' then v_market_price
            when p_order_type = 'LIMIT' then p_price
            else null
        end,
        p_trigger_price,
        p_position_id,
        'pending'
    )
    returning * into v_order;

    return v_order;
end;
$$;
