export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      equity_history: {
        Row: {
          balance: number
          equity: number
          game_id: string
          game_state: number
          id: string
          player_id: string
          timestamp: string | null
        }
        Insert: {
          balance: number
          equity: number
          game_id: string
          game_state: number
          id?: string
          player_id: string
          timestamp?: string | null
        }
        Update: {
          balance?: number
          equity?: number
          game_id?: string
          game_state?: number
          id?: string
          player_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equity_history_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          balance: number
          created_at: string | null
          equity: number
          game_id: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string | null
          equity?: number
          game_id: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string | null
          equity?: number
          game_id?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_state: {
        Row: {
          current_tick: number
          id: number
          last_tick_at: string | null
          updated_at: string | null
        }
        Insert: {
          current_tick?: number
          id?: number
          last_tick_at?: string | null
          updated_at?: string | null
        }
        Update: {
          current_tick?: number
          id?: number
          last_tick_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      games: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          initial_balance: number
          player1_id: string
          player2_id: string | null
          started_at: string | null
          status: string
          updated_at: string | null
          winner_id: string | null
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          initial_balance?: number
          player1_id: string
          player2_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          winner_id?: string | null
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          initial_balance?: number
          player1_id?: string
          player2_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          winner_id?: string | null
        }
        Relationships: []
      }
      order_executions: {
        Row: {
          created_at: string | null
          execution_price: number
          game_id: string
          game_state: number
          id: string
          order_id: string
          player_id: string
          quantity: number
          side: string
          symbol: string
        }
        Insert: {
          created_at?: string | null
          execution_price: number
          game_id: string
          game_state: number
          id?: string
          order_id: string
          player_id: string
          quantity: number
          side: string
          symbol: string
        }
        Update: {
          created_at?: string | null
          execution_price?: number
          game_id?: string
          game_state?: number
          id?: string
          order_id?: string
          player_id?: string
          quantity?: number
          side?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_executions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_executions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          filled_at: string | null
          filled_price: number | null
          game_id: string
          id: string
          order_type: string
          player_id: string
          position_id: string | null
          price: number | null
          quantity: number
          side: string
          status: string
          symbol: string
          trigger_price: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          filled_at?: string | null
          filled_price?: number | null
          game_id: string
          id?: string
          order_type: string
          player_id: string
          position_id?: string | null
          price?: number | null
          quantity: number
          side: string
          status?: string
          symbol: string
          trigger_price?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          filled_at?: string | null
          filled_price?: number | null
          game_id?: string
          id?: string
          order_type?: string
          player_id?: string
          position_id?: string | null
          price?: number | null
          quantity?: number
          side?: string
          status?: string
          symbol?: string
          trigger_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          closed_at: string | null
          created_at: string | null
          current_price: number | null
          entry_price: number
          game_id: string
          id: string
          leverage: number | null
          opened_at: string | null
          player_id: string
          quantity: number
          side: string
          status: string | null
          symbol: string
          unrealized_pnl: number | null
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          current_price?: number | null
          entry_price: number
          game_id: string
          id?: string
          leverage?: number | null
          opened_at?: string | null
          player_id: string
          quantity: number
          side: string
          status?: string | null
          symbol: string
          unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          current_price?: number | null
          entry_price?: number
          game_id?: string
          id?: string
          leverage?: number | null
          opened_at?: string | null
          player_id?: string
          quantity?: number
          side?: string
          status?: string | null
          symbol?: string
          unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      price_data: {
        Row: {
          created_at: string | null
          game_state: number
          id: string
          price: number
          symbol: string
          timestamp: string
        }
        Insert: {
          created_at?: string | null
          game_state: number
          id?: string
          price: number
          symbol: string
          timestamp: string
        }
        Update: {
          created_at?: string | null
          game_state?: number
          id?: string
          price?: number
          symbol?: string
          timestamp?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
