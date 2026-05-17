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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      crew_run_steps: {
        Row: {
          agent_name: string
          cost_usd: number
          created_at: string
          id: string
          input_text: string | null
          langfuse_span_id: string | null
          latency_ms: number | null
          output_text: string | null
          role: string | null
          run_id: string
          step_index: number
          task_name: string | null
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          agent_name: string
          cost_usd?: number
          created_at?: string
          id?: string
          input_text?: string | null
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          role?: string | null
          run_id: string
          step_index: number
          task_name?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          agent_name?: string
          cost_usd?: number
          created_at?: string
          id?: string
          input_text?: string | null
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          role?: string | null
          run_id?: string
          step_index?: number
          task_name?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "crew_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "crew_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_runs: {
        Row: {
          crew_id: string
          error_text: string | null
          finished_at: string | null
          id: string
          inputs_json: Json
          langfuse_trace_id: string | null
          result_text: string | null
          started_at: string
          status: Database["public"]["Enums"]["crew_run_status"]
          total_cost_usd: number
          total_tokens_in: number
          total_tokens_out: number
          trigger: Database["public"]["Enums"]["crew_trigger"]
        }
        Insert: {
          crew_id: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          inputs_json?: Json
          langfuse_trace_id?: string | null
          result_text?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          total_cost_usd?: number
          total_tokens_in?: number
          total_tokens_out?: number
          trigger: Database["public"]["Enums"]["crew_trigger"]
        }
        Update: {
          crew_id?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          inputs_json?: Json
          langfuse_trace_id?: string | null
          result_text?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          total_cost_usd?: number
          total_tokens_in?: number
          total_tokens_out?: number
          trigger?: Database["public"]["Enums"]["crew_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "crew_runs_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          spec_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          spec_json?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          spec_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      flow_states: {
        Row: {
          checkpoint: string
          created_at: string
          id: string
          run_id: string
          state_json: Json
        }
        Insert: {
          checkpoint: string
          created_at?: string
          id?: string
          run_id: string
          state_json: Json
        }
        Update: {
          checkpoint?: string
          created_at?: string
          id?: string
          run_id?: string
          state_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flow_states_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "crew_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
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
      crew_run_status:
        | "pending"
        | "running"
        | "paused_hitl"
        | "completed"
        | "failed"
        | "cancelled"
      crew_trigger: "morning" | "evening" | "intraday" | "on_demand" | "webhook"
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
    Enums: {
      crew_run_status: [
        "pending",
        "running",
        "paused_hitl",
        "completed",
        "failed",
        "cancelled",
      ],
      crew_trigger: ["morning", "evening", "intraday", "on_demand", "webhook"],
    },
  },
} as const
