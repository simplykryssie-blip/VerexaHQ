// Verexa Tax Office v2 -- Supabase database types
// Project: daxpavvsotvsyqqntddc (Verexa Tax Office v2)
// Phase 0: Platform Foundation
//
// Hand-authored to match the shape produced by `supabase gen types typescript`.
// Regenerate with the Supabase CLI/MCP once available in this environment:
//   supabase gen types typescript --project-id daxpavvsotvsyqqntddc > v2/types/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          workspace_type: string
          status: string
          timezone: string
          primary_contact_email: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          workspace_type?: string
          status?: string
          timezone?: string
          primary_contact_email?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          workspace_type?: string
          status?: string
          timezone?: string
          primary_contact_email?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          first_name: string | null
          last_name: string | null
          display_name: string | null
          phone: string | null
          avatar_url: string | null
          default_workspace_id: string | null
          is_platform_admin: boolean
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          first_name?: string | null
          last_name?: string | null
          display_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          default_workspace_id?: string | null
          is_platform_admin?: boolean
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          display_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          default_workspace_id?: string | null
          is_platform_admin?: boolean
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_default_workspace_id_fkey"
            columns: ["default_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          id: string
          key: string
          category: string
          description: string
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          category: string
          description: string
          created_at?: string
        }
        Update: {
          id?: string
          key?: string
          category?: string
          description?: string
          created_at?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          id: string
          workspace_id: string | null
          name: string
          slug: string
          description: string | null
          is_system_role: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          name: string
          slug: string
          description?: string | null
          is_system_role?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          name?: string
          slug?: string
          description?: string | null
          is_system_role?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          role_id: string
          permission_id: string
          created_at: string
        }
        Insert: {
          role_id: string
          permission_id: string
          created_at?: string
        }
        Update: {
          role_id?: string
          permission_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_users: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          role_id: string
          is_owner: boolean
          status: string
          invited_by: string | null
          invited_at: string | null
          joined_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role_id: string
          is_owner?: boolean
          status?: string
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          user_id?: string
          role_id?: string
          is_owner?: boolean
          status?: string
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_locations: {
        Row: {
          id: string
          workspace_id: string
          name: string
          is_primary: boolean
          address_line1: string | null
          address_line2: string | null
          city: string | null
          state: string | null
          postal_code: string | null
          country: string
          phone: string | null
          email: string | null
          timezone: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          is_primary?: boolean
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          state?: string | null
          postal_code?: string | null
          country?: string
          phone?: string | null
          email?: string | null
          timezone?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          is_primary?: boolean
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          state?: string | null
          postal_code?: string | null
          country?: string
          phone?: string | null
          email?: string | null
          timezone?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_locations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      branding: {
        Row: {
          workspace_id: string
          display_name: string | null
          logo_url: string | null
          favicon_url: string | null
          primary_color: string
          secondary_color: string
          accent_color: string
          portal_subdomain: string | null
          custom_domain: string | null
          email_from_name: string | null
          support_email: string | null
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          workspace_id: string
          display_name?: string | null
          logo_url?: string | null
          favicon_url?: string | null
          primary_color?: string
          secondary_color?: string
          accent_color?: string
          portal_subdomain?: string | null
          custom_domain?: string | null
          email_from_name?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          workspace_id?: string
          display_name?: string | null
          logo_url?: string | null
          favicon_url?: string | null
          primary_color?: string
          secondary_color?: string
          accent_color?: string
          portal_subdomain?: string | null
          custom_domain?: string | null
          email_from_name?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branding_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          workspace_id: string
          key: string
          value: Json
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          key: string
          value?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          key?: string
          value?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          id: string
          key: string
          name: string
          description: string | null
          module: string
          is_core: boolean
          default_enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          description?: string | null
          module: string
          is_core?: boolean
          default_enabled?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          key?: string
          name?: string
          description?: string | null
          module?: string
          is_core?: boolean
          default_enabled?: boolean
          created_at?: string
        }
        Relationships: []
      }
      workspace_feature_flags: {
        Row: {
          id: string
          workspace_id: string
          feature_flag_id: string
          is_enabled: boolean
          config: Json
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          feature_flag_id: string
          is_enabled?: boolean
          config?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          feature_flag_id?: string
          is_enabled?: boolean
          config?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_feature_flags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_feature_flags_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          id: string
          workspace_id: string | null
          actor_id: string | null
          actor_role: string | null
          entity_type: string
          entity_id: string | null
          action: string
          severity: string
          before_data: Json | null
          after_data: Json | null
          metadata: Json
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          actor_id?: string | null
          actor_role?: string | null
          entity_type: string
          entity_id?: string | null
          action: string
          severity?: string
          before_data?: Json | null
          after_data?: Json | null
          metadata?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          actor_id?: string | null
          actor_role?: string | null
          entity_type?: string
          entity_id?: string | null
          action?: string
          severity?: string
          before_data?: Json | null
          after_data?: Json | null
          metadata?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          id: string
          workspace_id: string
          actor_id: string | null
          entity_type: string
          entity_id: string | null
          activity_type: string
          description: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          actor_id?: string | null
          entity_type: string
          entity_id?: string | null
          activity_type: string
          description: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          actor_id?: string | null
          entity_type?: string
          entity_id?: string | null
          activity_type?: string
          description?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          id: string
          workspace_id: string | null
          recipient_user_id: string | null
          recipient_email: string | null
          recipient_phone: string | null
          channel: string
          template_key: string
          payload: Json
          status: string
          scheduled_at: string
          sent_at: string | null
          error: string | null
          attempts: number
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          recipient_user_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          channel: string
          template_key: string
          payload?: Json
          status?: string
          scheduled_at?: string
          sent_at?: string | null
          error?: string | null
          attempts?: number
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          recipient_user_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          channel?: string
          template_key?: string
          payload?: Json
          status?: string
          scheduled_at?: string
          sent_at?: string | null
          error?: string | null
          attempts?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_workspace_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      is_platform_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      is_workspace_admin: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { p_workspace_id: string; p_permission_key: string }
        Returns: boolean
      }
      create_workspace: {
        Args: {
          p_name: string
          p_workspace_type?: string
          p_timezone?: string
        }
        Returns: string
      }
      get_my_workspaces: {
        Args: Record<PropertyKey, never>
        Returns: {
          workspace_id: string
          workspace_name: string
          workspace_slug: string
          workspace_type: string
          role_slug: string
          role_name: string
          is_owner: boolean
          status: string
        }[]
      }
      invite_workspace_user: {
        Args: { p_workspace_id: string; p_user_id: string; p_role_id: string }
        Returns: string
      }
      accept_workspace_invitation: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      revoke_workspace_user: {
        Args: { p_workspace_id: string; p_user_id: string }
        Returns: undefined
      }
      set_feature_flag: {
        Args: {
          p_workspace_id: string
          p_flag_key: string
          p_enabled: boolean
          p_config?: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never
