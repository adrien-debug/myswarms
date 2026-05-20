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
      audit_template_access: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          template_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          template_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          template_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_template_access_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
        ]
      }
      chief_decisions: {
        Row: {
          action: Database["public"]["Enums"]["chief_decision_action"]
          chief_run_id: string
          created_at: string
          id: string
          owner_id: string | null
          snooze_until: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["chief_decision_action"]
          chief_run_id: string
          created_at?: string
          id?: string
          owner_id?: string | null
          snooze_until?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["chief_decision_action"]
          chief_run_id?: string
          created_at?: string
          id?: string
          owner_id?: string | null
          snooze_until?: string | null
        }
        Relationships: []
      }
      chief_run_log: {
        Row: {
          error_text: string | null
          finished_at: string | null
          id: string
          kickoff_id: string
          langfuse_trace_id: string | null
          owner_id: string | null
          result: string | null
          started_at: string
          state_json: Json | null
          status: string
          total_tokens_in: number
          total_tokens_out: number
          trigger: string
        }
        Insert: {
          error_text?: string | null
          finished_at?: string | null
          id?: string
          kickoff_id: string
          langfuse_trace_id?: string | null
          owner_id?: string | null
          result?: string | null
          started_at?: string
          state_json?: Json | null
          status: string
          total_tokens_in?: number
          total_tokens_out?: number
          trigger: string
        }
        Update: {
          error_text?: string | null
          finished_at?: string | null
          id?: string
          kickoff_id?: string
          langfuse_trace_id?: string | null
          owner_id?: string | null
          result?: string | null
          started_at?: string
          state_json?: Json | null
          status?: string
          total_tokens_in?: number
          total_tokens_out?: number
          trigger?: string
        }
        Relationships: []
      }
      chief_run_steps: {
        Row: {
          agent_name: string
          chief_run_id: string
          cost_usd: number
          created_at: string
          finished_at: string | null
          id: string
          langfuse_span_id: string | null
          latency_ms: number | null
          output_text: string | null
          owner_id: string | null
          started_at: string
          step_index: number
          task_name: string | null
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          agent_name: string
          chief_run_id: string
          cost_usd?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          owner_id?: string | null
          started_at?: string
          step_index: number
          task_name?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          agent_name?: string
          chief_run_id?: string
          cost_usd?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          owner_id?: string | null
          started_at?: string
          step_index?: number
          task_name?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: []
      }
      cockpit_chats: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cockpit_messages: {
        Row: {
          chat_id: string | null
          content: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          chat_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          chat_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "cockpit_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "cockpit_chats"
            referencedColumns: ["id"]
          },
        ]
      }
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
      swarm_agents: {
        Row: {
          created_at: string
          id: string
          max_tokens: number | null
          model_name: string | null
          model_provider: string | null
          name: string
          parent_agent_id: string | null
          position_x: number
          position_y: number
          role: Database["public"]["Enums"]["agent_role"]
          swarm_id: string
          system_prompt: string | null
          temperature: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_tokens?: number | null
          model_name?: string | null
          model_provider?: string | null
          name: string
          parent_agent_id?: string | null
          position_x?: number
          position_y?: number
          role: Database["public"]["Enums"]["agent_role"]
          swarm_id: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_tokens?: number | null
          model_name?: string | null
          model_provider?: string | null
          name?: string
          parent_agent_id?: string | null
          position_x?: number
          position_y?: number
          role?: Database["public"]["Enums"]["agent_role"]
          swarm_id?: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swarm_agents_parent_agent_id_fkey"
            columns: ["parent_agent_id"]
            isOneToOne: false
            referencedRelation: "swarm_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_agents_swarm_id_fkey"
            columns: ["swarm_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_run_steps: {
        Row: {
          agent_id: string | null
          cost_usd: number
          created_at: string
          error_text: string | null
          finished_at: string | null
          id: string
          input_text: string | null
          langfuse_span_id: string | null
          latency_ms: number | null
          output_text: string | null
          run_id: string
          status: Database["public"]["Enums"]["crew_run_status"]
          step_number: number
          task_id: string | null
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          agent_id?: string | null
          cost_usd?: number
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          input_text?: string | null
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          run_id: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          step_number: number
          task_id?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          agent_id?: string | null
          cost_usd?: number
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          input_text?: string | null
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          run_id?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          step_number?: number
          task_id?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "swarm_run_steps_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "swarm_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "swarm_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_run_steps_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "swarm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_runs: {
        Row: {
          created_at: string
          error_text: string | null
          finished_at: string | null
          id: string
          inputs_json: Json
          langfuse_trace_id: string | null
          result_text: string | null
          started_at: string
          status: Database["public"]["Enums"]["crew_run_status"]
          swarm_id: string
          total_cost_usd: number
          total_tokens_in: number
          total_tokens_out: number
          trigger: Database["public"]["Enums"]["crew_trigger"]
        }
        Insert: {
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          inputs_json?: Json
          langfuse_trace_id?: string | null
          result_text?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          swarm_id: string
          total_cost_usd?: number
          total_tokens_in?: number
          total_tokens_out?: number
          trigger: Database["public"]["Enums"]["crew_trigger"]
        }
        Update: {
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          inputs_json?: Json
          langfuse_trace_id?: string | null
          result_text?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          swarm_id?: string
          total_cost_usd?: number
          total_tokens_in?: number
          total_tokens_out?: number
          trigger?: Database["public"]["Enums"]["crew_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "swarm_runs_swarm_id_fkey"
            columns: ["swarm_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_tasks: {
        Row: {
          agent_id: string | null
          created_at: string
          depends_on_task_id: string | null
          description: string | null
          expected_output: string | null
          id: string
          name: string
          position_x: number
          position_y: number
          swarm_id: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          depends_on_task_id?: string | null
          description?: string | null
          expected_output?: string | null
          id?: string
          name: string
          position_x?: number
          position_y?: number
          swarm_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          depends_on_task_id?: string | null
          description?: string | null
          expected_output?: string | null
          id?: string
          name?: string
          position_x?: number
          position_y?: number
          swarm_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swarm_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "swarm_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_tasks_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "swarm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_tasks_swarm_id_fkey"
            columns: ["swarm_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_tool_bindings: {
        Row: {
          agent_id: string | null
          config_json: Json
          created_at: string
          id: string
          priority: number
          swarm_id: string
          tool_id: string
        }
        Insert: {
          agent_id?: string | null
          config_json?: Json
          created_at?: string
          id?: string
          priority?: number
          swarm_id: string
          tool_id: string
        }
        Update: {
          agent_id?: string | null
          config_json?: Json
          created_at?: string
          id?: string
          priority?: number
          swarm_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swarm_tool_bindings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "swarm_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_tool_bindings_swarm_id_fkey"
            columns: ["swarm_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_tool_bindings_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      swarms: {
        Row: {
          config_json: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_template: boolean
          name: string
          owner_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          config_json?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          name: string
          owner_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          config_json?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          name?: string
          owner_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      tools: {
        Row: {
          auth_type: string | null
          category: Database["public"]["Enums"]["tool_category"]
          created_at: string
          description: string | null
          endpoint_url: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          schema_json: Json
          updated_at: string
        }
        Insert: {
          auth_type?: string | null
          category: Database["public"]["Enums"]["tool_category"]
          created_at?: string
          description?: string | null
          endpoint_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          schema_json?: Json
          updated_at?: string
        }
        Update: {
          auth_type?: string | null
          category?: Database["public"]["Enums"]["tool_category"]
          created_at?: string
          description?: string | null
          endpoint_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          schema_json?: Json
          updated_at?: string
        }
        Relationships: []
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
      agent_role:
        | "coordinator"
        | "analyst"
        | "executor"
        | "reviewer"
        | "tool_runner"
      chief_decision_action: "sent" | "snoozed" | "rejected"
      crew_run_status:
        | "pending"
        | "running"
        | "paused_hitl"
        | "completed"
        | "failed"
        | "cancelled"
      crew_trigger: "morning" | "evening" | "intraday" | "on_demand" | "webhook"
      tool_category:
        | "api_call"
        | "file_io"
        | "code_execution"
        | "search"
        | "database"
        | "custom"
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
      agent_role: [
        "coordinator",
        "analyst",
        "executor",
        "reviewer",
        "tool_runner",
      ],
      chief_decision_action: ["sent", "snoozed", "rejected"],
      crew_run_status: [
        "pending",
        "running",
        "paused_hitl",
        "completed",
        "failed",
        "cancelled",
      ],
      crew_trigger: ["morning", "evening", "intraday", "on_demand", "webhook"],
      tool_category: [
        "api_call",
        "file_io",
        "code_execution",
        "search",
        "database",
        "custom",
      ],
    },
  },
} as const
