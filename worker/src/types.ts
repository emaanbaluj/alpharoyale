import type { Database } from "./database.types";

// Type aliases for table rows from the Database schema
export type PriceDataRow = Database["public"]["Tables"]["price_data"]["Row"];
export type GameStateRow = Database["public"]["Tables"]["game_state"]["Row"];
export type GameRow = Database["public"]["Tables"]["games"]["Row"];
export type GamePlayerRow = Database["public"]["Tables"]["game_players"]["Row"];
export type PositionRow = Database["public"]["Tables"]["positions"]["Row"];
export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];