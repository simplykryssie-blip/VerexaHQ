// Synced from v2/types/database.types.ts -- regenerate/copy after schema changes, do not hand-edit here.
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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          activity_type: string
          actor_id: string | null
          created_at: string
          description: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          activity_type: string
          actor_id?: string | null
          created_at?: string
          description: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          activity_type?: string
          actor_id?: string | null
          created_at?: string
          description?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          workspace_id?: string
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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json
          severity: string
          user_agent: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          severity?: string
          user_agent?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          severity?: string
          user_agent?: string | null
          workspace_id?: string | null
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
      automation_steps: {
        Row: {
          action_config: Json
          action_type: string
          approver_role_id: string | null
          automation_id: string
          created_at: string
          delay_minutes: number
          display_order: number
          id: string
          requires_approval: boolean
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          approver_role_id?: string | null
          automation_id: string
          created_at?: string
          delay_minutes?: number
          display_order?: number
          id?: string
          requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          approver_role_id?: string | null
          automation_id?: string
          created_at?: string
          delay_minutes?: number
          display_order?: number
          id?: string
          requires_approval?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_steps_approver_role_id_fkey"
            columns: ["approver_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_steps_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          slug: string
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          slug: string
          status?: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          slug?: string
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_rules: {
        Row: {
          automatic_reminders: Json
          collections_after_days: number | null
          collections_enabled: boolean
          created_at: string
          created_by: string | null
          deposit_percent: number | null
          deposit_required: boolean
          id: string
          installment_count: number | null
          installments_allowed: boolean
          invoice_timing: string
          late_fee_amount: number | null
          late_fee_enabled: boolean
          late_fee_percent: number | null
          name: string
          payment_before_release: boolean
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          automatic_reminders?: Json
          collections_after_days?: number | null
          collections_enabled?: boolean
          created_at?: string
          created_by?: string | null
          deposit_percent?: number | null
          deposit_required?: boolean
          id?: string
          installment_count?: number | null
          installments_allowed?: boolean
          invoice_timing?: string
          late_fee_amount?: number | null
          late_fee_enabled?: boolean
          late_fee_percent?: number | null
          name: string
          payment_before_release?: boolean
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          automatic_reminders?: Json
          collections_after_days?: number | null
          collections_enabled?: boolean
          created_at?: string
          created_by?: string | null
          deposit_percent?: number | null
          deposit_required?: boolean
          id?: string
          installment_count?: number | null
          installments_allowed?: boolean
          invoice_timing?: string
          late_fee_amount?: number | null
          late_fee_enabled?: boolean
          late_fee_percent?: number | null
          name?: string
          payment_before_release?: boolean
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_components: {
        Row: {
          blueprint_id: string
          component_id: string
          component_type: string
          created_at: string
          id: string
          is_primary: boolean
        }
        Insert: {
          blueprint_id: string
          component_id: string
          component_type: string
          created_at?: string
          id?: string
          is_primary?: boolean
        }
        Update: {
          blueprint_id?: string
          component_id?: string
          component_type?: string
          created_at?: string
          id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_components_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprints: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          estimated_setup_minutes: number | null
          id: string
          name: string
          slug: string
          source_blueprint_id: string | null
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_setup_minutes?: number | null
          id?: string
          name: string
          slug: string
          source_blueprint_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_setup_minutes?: number | null
          id?: string
          name?: string
          slug?: string
          source_blueprint_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blueprints_source_blueprint_id_fkey"
            columns: ["source_blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      branding: {
        Row: {
          accent_color: string
          business_email: string | null
          business_phone: string | null
          custom_domain: string | null
          dba: string | null
          display_name: string | null
          email_from_name: string | null
          email_header_logo_url: string | null
          logo_url: string | null
          pdf_header_logo_url: string | null
          portal_logo_url: string | null
          portal_subdomain: string | null
          primary_color: string
          secondary_color: string
          sidebar_logo_url: string | null
          support_email: string | null
          support_phone: string | null
          theme_mode: string
          updated_at: string
          website_url: string | null
          workspace_id: string
        }
        Insert: {
          accent_color?: string
          business_email?: string | null
          business_phone?: string | null
          custom_domain?: string | null
          dba?: string | null
          display_name?: string | null
          email_from_name?: string | null
          email_header_logo_url?: string | null
          logo_url?: string | null
          pdf_header_logo_url?: string | null
          portal_logo_url?: string | null
          portal_subdomain?: string | null
          primary_color?: string
          secondary_color?: string
          sidebar_logo_url?: string | null
          support_email?: string | null
          support_phone?: string | null
          theme_mode?: string
          updated_at?: string
          website_url?: string | null
          workspace_id: string
        }
        Update: {
          accent_color?: string
          business_email?: string | null
          business_phone?: string | null
          custom_domain?: string | null
          dba?: string | null
          display_name?: string | null
          email_from_name?: string | null
          email_header_logo_url?: string | null
          logo_url?: string | null
          pdf_header_logo_url?: string | null
          portal_logo_url?: string | null
          portal_subdomain?: string | null
          primary_color?: string
          secondary_color?: string
          sidebar_logo_url?: string | null
          support_email?: string | null
          support_phone?: string | null
          theme_mode?: string
          updated_at?: string
          website_url?: string | null
          workspace_id?: string
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
      clients: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          business_name: string | null
          city: string | null
          client_type: string
          country: string
          created_at: string
          created_by: string | null
          custom_fields: Json
          date_of_birth: string | null
          ein_encrypted: string | null
          ein_hash: string | null
          ein_last4: string | null
          first_name: string | null
          has_portal_access: boolean
          id: string
          itin_encrypted: string | null
          itin_hash: string | null
          itin_last4: string | null
          last_name: string | null
          lifecycle_status: string
          merged_into_client_id: string | null
          normalized_email: string | null
          normalized_phone: string | null
          notes: string | null
          postal_code: string | null
          primary_email: string | null
          primary_phone: string | null
          search_vector: unknown | null
          ssn_encrypted: string | null
          ssn_hash: string | null
          ssn_last4: string | null
          state: string | null
          tags: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          business_name?: string | null
          city?: string | null
          client_type?: string
          country?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          date_of_birth?: string | null
          ein_encrypted?: string | null
          ein_hash?: string | null
          ein_last4?: string | null
          first_name?: string | null
          has_portal_access?: boolean
          id?: string
          itin_encrypted?: string | null
          itin_hash?: string | null
          itin_last4?: string | null
          last_name?: string | null
          lifecycle_status?: string
          merged_into_client_id?: string | null
          normalized_email?: string | null
          normalized_phone?: string | null
          notes?: string | null
          postal_code?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          ssn_encrypted?: string | null
          ssn_hash?: string | null
          ssn_last4?: string | null
          state?: string | null
          tags?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          business_name?: string | null
          city?: string | null
          client_type?: string
          country?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          date_of_birth?: string | null
          ein_encrypted?: string | null
          ein_hash?: string | null
          ein_last4?: string | null
          first_name?: string | null
          has_portal_access?: boolean
          id?: string
          itin_encrypted?: string | null
          itin_hash?: string | null
          itin_last4?: string | null
          last_name?: string | null
          lifecycle_status?: string
          merged_into_client_id?: string | null
          normalized_email?: string | null
          normalized_phone?: string | null
          notes?: string | null
          postal_code?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          ssn_encrypted?: string | null
          ssn_hash?: string | null
          ssn_last4?: string | null
          state?: string | null
          tags?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_merged_into_client_id_fkey"
            columns: ["merged_into_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_addresses: {
        Row: {
          address_type: string
          city: string | null
          client_id: string
          created_at: string
          display_order: number
          id: string
          is_primary: boolean
          state: string | null
          street: string | null
          updated_at: string
          workspace_id: string
          zip: string | null
        }
        Insert: {
          address_type?: string
          city?: string | null
          client_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_primary?: boolean
          state?: string | null
          street?: string | null
          updated_at?: string
          workspace_id: string
          zip?: string | null
        }
        Update: {
          address_type?: string
          city?: string | null
          client_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_primary?: boolean
          state?: string | null
          street?: string | null
          updated_at?: string
          workspace_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_addresses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_addresses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          email: string | null
          first_name: string | null
          id: string
          is_primary: boolean
          last_name: string | null
          phone: string | null
          preferred_contact_method: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          phone?: string | null
          preferred_contact_method?: string | null
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          phone?: string | null
          preferred_contact_method?: string | null
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          category: string | null
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          search_vector: unknown | null
          storage_path: string
          tags: string[] | null
          uploaded_by: string | null
          version: number | null
          workspace_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          entity_id: string
          entity_type?: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          tags?: string[] | null
          uploaded_by?: string | null
          version?: number | null
          workspace_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          tags?: string[] | null
          uploaded_by?: string | null
          version?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_emails: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          email: string
          email_type: string
          id: string
          is_primary: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          email: string
          email_type?: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          email?: string
          email_type?: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          attachments: Json | null
          author_id: string | null
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          is_internal: boolean
          is_pinned: boolean
          is_private: boolean
          mentions: Json | null
          rich_content: Json | null
          search_vector: unknown | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          body: string
          created_at?: string
          entity_id: string
          entity_type?: string
          id?: string
          is_internal?: boolean
          is_pinned?: boolean
          is_private?: boolean
          mentions?: Json | null
          rich_content?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          is_internal?: boolean
          is_pinned?: boolean
          is_private?: boolean
          mentions?: Json | null
          rich_content?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_phones: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          id: string
          is_primary: boolean
          phone_number: string
          phone_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_primary?: boolean
          phone_number: string
          phone_type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_primary?: boolean
          phone_number?: string
          phone_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_phones_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_phones_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          accepted_at: string | null
          client_id: string
          display_order: number
          id: string
          invited_at: string
          invited_by: string | null
          invited_email: string
          invited_name: string | null
          is_primary: boolean
          status: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          display_order?: number
          id?: string
          invited_at?: string
          invited_by?: string | null
          invited_email: string
          invited_name?: string | null
          is_primary?: boolean
          status?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          display_order?: number
          id?: string
          invited_at?: string
          invited_by?: string | null
          invited_email?: string
          invited_name?: string | null
          is_primary?: boolean
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_relationships: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          id: string
          notes: string | null
          related_client_id: string | null
          related_name: string | null
          relationship_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          id?: string
          notes?: string | null
          related_client_id?: string | null
          related_name?: string | null
          relationship_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          id?: string
          notes?: string | null
          related_client_id?: string | null
          related_name?: string | null
          relationship_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_relationships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_relationships_related_client_id_fkey"
            columns: ["related_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_relationships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_execution_logs: {
        Row: {
          automation_id: string
          engagement_id: string | null
          error_message: string | null
          execution_data: Json | null
          executed_at: string | null
          id: string
          status: string
          workflow_run_id: string | null
          workspace_id: string
        }
        Insert: {
          automation_id: string
          engagement_id?: string | null
          error_message?: string | null
          execution_data?: Json | null
          executed_at?: string | null
          id?: string
          status: string
          workflow_run_id?: string | null
          workspace_id: string
        }
        Update: {
          automation_id?: string
          engagement_id?: string | null
          error_message?: string | null
          execution_data?: Json | null
          executed_at?: string | null
          id?: string
          status?: string
          workflow_run_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_execution_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_logs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_logs_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      due_date_rules: {
        Row: {
          base_date_type: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          offset_days: number | null
          rule_type: string
          workspace_id: string
        }
        Insert: {
          base_date_type?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          offset_days?: number | null
          rule_type: string
          workspace_id: string
        }
        Update: {
          base_date_type?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          offset_days?: number | null
          rule_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "due_date_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_types: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          module: string
          name: string
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          module?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          module?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagements: {
        Row: {
          archived_date: string | null
          assigned_staff_id: string | null
          blueprint_id: string | null
          client_id: string
          compliance_officer_id: string | null
          completed_date: string | null
          created_at: string | null
          current_stage: string | null
          due_date: string | null
          engagement_number: string | null
          engagement_type_id: string | null
          id: string
          internal_reference: string | null
          open_date: string | null
          owner_workspace_id: string | null
          priority: Database["public"]["Enums"]["engagement_priority"] | null
          review_status: Database["public"]["Enums"]["review_status"] | null
          reviewer_id: string | null
          search_vector: unknown | null
          service_id: string | null
          shared_status: string | null
          status: string
          updated_at: string
          workflow_id: string | null
          workspace_id: string
        }
        Insert: {
          archived_date?: string | null
          assigned_staff_id?: string | null
          blueprint_id?: string | null
          client_id: string
          compliance_officer_id?: string | null
          completed_date?: string | null
          created_at?: string | null
          current_stage?: string | null
          due_date?: string | null
          engagement_number?: string | null
          engagement_type_id?: string | null
          id?: string
          internal_reference?: string | null
          open_date?: string | null
          owner_workspace_id?: string | null
          priority?: Database["public"]["Enums"]["engagement_priority"] | null
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewer_id?: string | null
          service_id?: string | null
          shared_status?: string | null
          status?: string
          updated_at?: string
          workflow_id?: string | null
          workspace_id: string
        }
        Update: {
          archived_date?: string | null
          assigned_staff_id?: string | null
          blueprint_id?: string | null
          client_id?: string
          compliance_officer_id?: string | null
          completed_date?: string | null
          created_at?: string | null
          current_stage?: string | null
          due_date?: string | null
          engagement_number?: string | null
          engagement_type_id?: string | null
          id?: string
          internal_reference?: string | null
          open_date?: string | null
          owner_workspace_id?: string | null
          priority?: Database["public"]["Enums"]["engagement_priority"] | null
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewer_id?: string | null
          service_id?: string | null
          shared_status?: string | null
          status?: string
          updated_at?: string
          workflow_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_compliance_officer_id_fkey"
            columns: ["compliance_officer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_owner_workspace_id_fkey"
            columns: ["owner_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_engagement_type_id_fkey"
            columns: ["engagement_type_id"]
            isOneToOne: false
            referencedRelation: "engagement_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_status_history: {
        Row: {
          audit_reference: string | null
          changed_at: string | null
          changed_by: string | null
          engagement_id: string
          id: string
          new_status: string
          old_status: string | null
          reason: string | null
        }
        Insert: {
          audit_reference?: string | null
          changed_at?: string | null
          changed_by?: string | null
          engagement_id: string
          id?: string
          new_status: string
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          audit_reference?: string | null
          changed_at?: string | null
          changed_by?: string | null
          engagement_id?: string
          id?: string
          new_status?: string
          old_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_status_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_status_history_audit_reference_fkey"
            columns: ["audit_reference"]
            isOneToOne: false
            referencedRelation: "audit_log"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_assignment_history: {
        Row: {
          assignment_role: string
          changed_at: string
          changed_by: string | null
          engagement_id: string
          id: string
          new_user_id: string | null
          previous_user_id: string | null
          reason: string | null
        }
        Insert: {
          assignment_role: string
          changed_at?: string
          changed_by?: string | null
          engagement_id: string
          id?: string
          new_user_id?: string | null
          previous_user_id?: string | null
          reason?: string | null
        }
        Update: {
          assignment_role?: string
          changed_at?: string
          changed_by?: string | null
          engagement_id?: string
          id?: string
          new_user_id?: string | null
          previous_user_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_assignment_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_review_actions: {
        Row: {
          action: string
          actor_id: string | null
          comment: string | null
          created_at: string
          engagement_share_id: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          engagement_share_id: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          engagement_share_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_review_actions_engagement_share_id_fkey"
            columns: ["engagement_share_id"]
            isOneToOne: false
            referencedRelation: "engagement_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string | null
          current_stage_id: string | null
          engagement_id: string
          id: string
          paused_at: string | null
          process_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_run_status"] | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_stage_id?: string | null
          engagement_id: string
          id?: string
          paused_at?: string | null
          process_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"] | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_stage_id?: string | null
          engagement_id?: string
          id?: string
          paused_at?: string | null
          process_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"] | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_current_stage"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_stages: {
        Row: {
          actual_duration: unknown | null
          assigned_staff_id: string | null
          completed_at: string | null
          created_at: string | null
          display_order: number
          due_date: string | null
          estimated_duration: unknown | null
          id: string
          notes: string | null
          process_stage_id: string
          reviewer_id: string | null
          sla_status: string | null
          stage_name: string
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_stage_status"] | null
          updated_at: string | null
          workflow_run_id: string
          workspace_id: string
        }
        Insert: {
          actual_duration?: unknown | null
          assigned_staff_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          display_order: number
          due_date?: string | null
          estimated_duration?: unknown | null
          id?: string
          notes?: string | null
          process_stage_id: string
          reviewer_id?: string | null
          sla_status?: string | null
          stage_name: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_stage_status"] | null
          updated_at?: string | null
          workflow_run_id: string
          workspace_id: string
        }
        Update: {
          actual_duration?: unknown | null
          assigned_staff_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          display_order?: number
          due_date?: string | null
          estimated_duration?: unknown | null
          id?: string
          notes?: string | null
          process_stage_id?: string
          reviewer_id?: string | null
          sla_status?: string | null
          stage_name?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_stage_status"] | null
          updated_at?: string | null
          workflow_run_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stages_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_process_stage_id_fkey"
            columns: ["process_stage_id"]
            isOneToOne: false
            referencedRelation: "process_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_staff_id: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          engagement_id: string
          id: string
          priority: string | null
          status: string
          title: string
          updated_at: string | null
          workflow_stage_id: string
          workspace_id: string
        }
        Insert: {
          assigned_staff_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          engagement_id: string
          id?: string
          priority?: string | null
          status?: string
          title: string
          updated_at?: string | null
          workflow_stage_id: string
          workspace_id: string
        }
        Update: {
          assigned_staff_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          engagement_id?: string
          id?: string
          priority?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          workflow_stage_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workflow_stage_id_fkey"
            columns: ["workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      config_object_shares: {
        Row: {
          accepted_object_id: string | null
          created_at: string
          id: string
          object_id: string
          object_type: string
          responded_at: string | null
          responded_by: string | null
          shared_by: string | null
          shared_by_workspace_id: string
          shared_with_workspace_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_object_id?: string | null
          created_at?: string
          id?: string
          object_id: string
          object_type: string
          responded_at?: string | null
          responded_by?: string | null
          shared_by?: string | null
          shared_by_workspace_id: string
          shared_with_workspace_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_object_id?: string | null
          created_at?: string
          id?: string
          object_id?: string
          object_type?: string
          responded_at?: string | null
          responded_by?: string | null
          shared_by?: string | null
          shared_by_workspace_id?: string
          shared_with_workspace_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_object_shares_shared_by_workspace_id_fkey"
            columns: ["shared_by_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "config_object_shares_shared_with_workspace_id_fkey"
            columns: ["shared_with_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          accepted_at: string
          client_id: string | null
          consent_type: string
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
          version: string
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string
          client_id?: string | null
          consent_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
          version: string
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string
          client_id?: string | null
          consent_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
          version?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_saves: {
        Row: {
          created_at: string
          draft_type: string
          entity_id: string | null
          id: string
          payload: Json
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          draft_type: string
          entity_id?: string | null
          id?: string
          payload: Json
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          draft_type?: string
          entity_id?: string | null
          id?: string
          payload?: Json
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_saves_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_shares: {
        Row: {
          created_at: string
          decision_notes: string | null
          engagement_id: string
          expires_at: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          shared_by: string | null
          shared_items: Json
          shared_with_workspace_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          decision_notes?: string | null
          engagement_id: string
          expires_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_by?: string | null
          shared_items?: Json
          shared_with_workspace_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          decision_notes?: string | null
          engagement_id?: string
          expires_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_by?: string | null
          shared_items?: Json
          shared_with_workspace_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_shares_shared_with_workspace_id_fkey"
            columns: ["shared_with_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          created_at: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success: boolean
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_devices: {
        Row: {
          device_fingerprint: string
          device_name: string | null
          expires_at: string | null
          id: string
          last_seen_at: string
          trusted_at: string
          user_id: string
        }
        Insert: {
          device_fingerprint: string
          device_name?: string | null
          expires_at?: string | null
          id?: string
          last_seen_at?: string
          trusted_at?: string
          user_id: string
        }
        Update: {
          device_fingerprint?: string
          device_name?: string | null
          expires_at?: string | null
          id?: string
          last_seen_at?: string
          trusted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_retention_policies: {
        Row: {
          archived_clients_retention_days: number | null
          archived_engagements_retention_days: number | null
          audit_logs_retention_days: number | null
          documents_retention_days: number | null
          messages_retention_days: number | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          archived_clients_retention_days?: number | null
          archived_engagements_retention_days?: number | null
          audit_logs_retention_days?: number | null
          documents_retention_days?: number | null
          messages_retention_days?: number | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_clients_retention_days?: number | null
          archived_engagements_retention_days?: number | null
          audit_logs_retention_days?: number | null
          documents_retention_days?: number | null
          messages_retention_days?: number | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_retention_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_security_policies: {
        Row: {
          lockout_duration_minutes: number
          max_failed_login_attempts: number
          mfa_required: boolean
          mfa_required_for_roles: string[]
          password_expiry_days: number | null
          password_min_length: number
          password_require_number: boolean
          password_require_symbol: boolean
          password_require_uppercase: boolean
          session_timeout_minutes: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          lockout_duration_minutes?: number
          max_failed_login_attempts?: number
          mfa_required?: boolean
          mfa_required_for_roles?: string[]
          password_expiry_days?: number | null
          password_min_length?: number
          password_require_number?: boolean
          password_require_symbol?: boolean
          password_require_uppercase?: boolean
          session_timeout_minutes?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          lockout_duration_minutes?: number
          max_failed_login_attempts?: number
          mfa_required?: boolean
          mfa_required_for_roles?: string[]
          password_expiry_days?: number | null
          password_min_length?: number
          password_require_number?: boolean
          password_require_symbol?: boolean
          password_require_uppercase?: boolean
          session_timeout_minutes?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_security_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      config_object_versions: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          object_id: string
          object_type: string
          snapshot: Json
          version_number: number
          workspace_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          object_id: string
          object_type: string
          snapshot: Json
          version_number: number
          workspace_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          object_id?: string
          object_type?: string
          snapshot?: Json
          version_number?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_object_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          config: Json
          created_at: string
          dashboard_id: string
          display_order: number
          grid_position: Json
          id: string
          title: string | null
          updated_at: string
          widget_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dashboard_id: string
          display_order?: number
          grid_position?: Json
          id?: string
          title?: string | null
          updated_at?: string
          widget_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          dashboard_id?: string
          display_order?: number
          grid_position?: Json
          id?: string
          title?: string | null
          updated_at?: string
          widget_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          role_slug: string | null
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          role_slug?: string | null
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          role_slug?: string | null
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_request_items: {
        Row: {
          category: string
          conditional_logic: Json
          created_at: string
          display_order: number
          document_request_template_id: string
          id: string
          instructions: string | null
          is_required: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category: string
          conditional_logic?: Json
          created_at?: string
          display_order?: number
          document_request_template_id: string
          id?: string
          instructions?: string | null
          is_required?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          conditional_logic?: Json
          created_at?: string
          display_order?: number
          document_request_template_id?: string
          id?: string
          instructions?: string | null
          is_required?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_request_items_document_request_template_id_fkey"
            columns: ["document_request_template_id"]
            isOneToOne: false
            referencedRelation: "document_request_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_request_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_request_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          merge_fields: Json
          name: string
          schedule_rule: Json
          slug: string
          status: string
          subject: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          body_html?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          merge_fields?: Json
          name: string
          schedule_rule?: Json
          slug: string
          status?: string
          subject: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          body_html?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          merge_fields?: Json
          name?: string
          schedule_rule?: Json
          slug?: string
          status?: string
          subject?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_letter_templates: {
        Row: {
          body_html: string
          created_at: string
          created_by: string | null
          id: string
          merge_fields: Json
          name: string
          requires_signature: boolean
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          body_html?: string
          created_at?: string
          created_by?: string | null
          id?: string
          merge_fields?: Json
          name: string
          requires_signature?: boolean
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string
          created_by?: string | null
          id?: string
          merge_fields?: Json
          name?: string
          requires_signature?: boolean
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_letter_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          default_enabled: boolean
          description: string | null
          id: string
          is_core: boolean
          key: string
          module: string
          name: string
        }
        Insert: {
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          id?: string
          is_core?: boolean
          key: string
          module: string
          name: string
        }
        Update: {
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          id?: string
          is_core?: boolean
          key?: string
          module?: string
          name?: string
        }
        Relationships: []
      }
      firm_connections: {
        Row: {
          child_workspace_id: string
          created_at: string
          id: string
          invited_by: string | null
          parent_workspace_id: string
          relationship_type: string
          responded_at: string | null
          responded_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          child_workspace_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          parent_workspace_id: string
          relationship_type: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          child_workspace_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          parent_workspace_id?: string
          relationship_type?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_connections_child_workspace_id_fkey"
            columns: ["child_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_connections_parent_workspace_id_fkey"
            columns: ["parent_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_onboarding: {
        Row: {
          branding_completed: boolean
          business_info_completed: boolean
          completed_at: string | null
          created_at: string
          current_step: number
          selected_blueprint_id: string | null
          staff_invited: boolean
          startup_method: string | null
          tax_info_completed: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          branding_completed?: boolean
          business_info_completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_step?: number
          selected_blueprint_id?: string | null
          staff_invited?: boolean
          startup_method?: string | null
          tax_info_completed?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          branding_completed?: boolean
          business_info_completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_step?: number
          selected_blueprint_id?: string | null
          staff_invited?: boolean
          startup_method?: string | null
          tax_info_completed?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_onboarding_selected_blueprint_id_fkey"
            columns: ["selected_blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_onboarding_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_tax_profile: {
        Row: {
          efin_encrypted: string | null
          efin_last4: string | null
          ein_encrypted: string | null
          ein_last4: string | null
          ptin_encrypted: string | null
          ptin_last4: string | null
          regular_office_hours: Json
          supported_filing_states: string[]
          tax_season_hours: Json
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          efin_encrypted?: string | null
          efin_last4?: string | null
          ein_encrypted?: string | null
          ein_last4?: string | null
          ptin_encrypted?: string | null
          ptin_last4?: string | null
          regular_office_hours?: Json
          supported_filing_states?: string[]
          tax_season_hours?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          efin_encrypted?: string | null
          efin_last4?: string | null
          ein_encrypted?: string | null
          ein_last4?: string | null
          ptin_encrypted?: string | null
          ptin_last4?: string | null
          regular_office_hours?: Json
          supported_filing_states?: string[]
          tax_season_hours?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_tax_profile_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number
          channel: string
          channels: string[] | null
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          payload: Json
          priority: string | null
          recipient_email: string | null
          recipient_phone: string | null
          recipient_user_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          template_key: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          channel: string
          channels?: string[] | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          priority?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_key: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          channel?: string
          channels?: string[] | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          priority?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_key?: string
          workspace_id?: string | null
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
      office_locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          name: string
          phone: string | null
          postal_code: string | null
          state: string | null
          timezone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string
          workspace_id?: string
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
      organizer_fields: {
        Row: {
          conditional_logic: Json
          created_at: string
          display_order: number
          field_type: string
          help_text: string | null
          id: string
          is_required: boolean
          label: string
          options: Json
          organizer_template_id: string
          parent_field_id: string | null
          updated_at: string
          validation: Json
        }
        Insert: {
          conditional_logic?: Json
          created_at?: string
          display_order?: number
          field_type: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label: string
          options?: Json
          organizer_template_id: string
          parent_field_id?: string | null
          updated_at?: string
          validation?: Json
        }
        Update: {
          conditional_logic?: Json
          created_at?: string
          display_order?: number
          field_type?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label?: string
          options?: Json
          organizer_template_id?: string
          parent_field_id?: string | null
          updated_at?: string
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "organizer_fields_organizer_template_id_fkey"
            columns: ["organizer_template_id"]
            isOneToOne: false
            referencedRelation: "organizer_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_fields_parent_field_id_fkey"
            columns: ["parent_field_id"]
            isOneToOne: false
            referencedRelation: "organizer_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          key: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          key: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          display_order: number
          id: string
          is_terminal: boolean
          name: string
          pipeline_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_terminal?: boolean
          name: string
          pipeline_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_terminal?: boolean
          name?: string
          pipeline_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          allow_override: boolean
          base_amount: number | null
          complexity_tiers: Json
          created_at: string
          created_by: string | null
          discount_rules: Json
          form_based_rates: Json
          hourly_rate: number | null
          id: string
          maximum_amount: number | null
          minimum_amount: number | null
          name: string
          pricing_method: string
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          allow_override?: boolean
          base_amount?: number | null
          complexity_tiers?: Json
          created_at?: string
          created_by?: string | null
          discount_rules?: Json
          form_based_rates?: Json
          hourly_rate?: number | null
          id?: string
          maximum_amount?: number | null
          minimum_amount?: number | null
          name: string
          pricing_method: string
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          allow_override?: boolean
          base_amount?: number | null
          complexity_tiers?: Json
          created_at?: string
          created_by?: string | null
          discount_rules?: Json
          form_based_rates?: Json
          hourly_rate?: number | null
          id?: string
          maximum_amount?: number | null
          minimum_amount?: number | null
          name?: string
          pricing_method?: string
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      process_stages: {
        Row: {
          completion_rule: string
          created_at: string
          display_order: number
          due_date_rule: Json
          entry_conditions: Json
          id: string
          name: string
          notify_on_entry: Json
          process_id: string
          reviewer_role_id: string | null
          updated_at: string
        }
        Insert: {
          completion_rule?: string
          created_at?: string
          display_order?: number
          due_date_rule?: Json
          entry_conditions?: Json
          id?: string
          name: string
          notify_on_entry?: Json
          process_id: string
          reviewer_role_id?: string | null
          updated_at?: string
        }
        Update: {
          completion_rule?: string
          created_at?: string
          display_order?: number
          due_date_rule?: Json
          entry_conditions?: Json
          id?: string
          name?: string
          notify_on_entry?: Json
          process_id?: string
          reviewer_role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_stages_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_stages_reviewer_role_id_fkey"
            columns: ["reviewer_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      process_tasks: {
        Row: {
          assignee_role_id: string | null
          automation_trigger: Json
          created_at: string
          description: string | null
          display_order: number
          due_date_rule: Json
          id: string
          is_required: boolean
          name: string
          process_stage_id: string
          updated_at: string
        }
        Insert: {
          assignee_role_id?: string | null
          automation_trigger?: Json
          created_at?: string
          description?: string | null
          display_order?: number
          due_date_rule?: Json
          id?: string
          is_required?: boolean
          name: string
          process_stage_id: string
          updated_at?: string
        }
        Update: {
          assignee_role_id?: string | null
          automation_trigger?: Json
          created_at?: string
          description?: string | null
          display_order?: number
          due_date_rule?: Json
          id?: string
          is_required?: boolean
          name?: string
          process_stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_tasks_assignee_role_id_fkey"
            columns: ["assignee_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_tasks_process_stage_id_fkey"
            columns: ["process_stage_id"]
            isOneToOne: false
            referencedRelation: "process_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system_role: boolean
          name: string
          slug: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name: string
          slug: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name?: string
          slug?: string
          updated_at?: string
          workspace_id?: string | null
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
      service_categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          slug: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          slug: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          slug?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          billing_rule_id: string | null
          created_at: string
          created_by: string | null
          default_price: number | null
          description: string | null
          display_order: number
          document_request_template_id: string | null
          engagement_letter_template_id: string | null
          estimated_duration_minutes: number | null
          id: string
          is_bookable: boolean
          is_portal_visible: boolean
          name: string
          organizer_template_id: string | null
          pipeline_id: string | null
          pricing_rule_id: string | null
          process_id: string | null
          requires_documents: boolean
          requires_engagement_letter: boolean
          requires_invoice: boolean
          requires_organizer: boolean
          requires_payment_before_release: boolean
          requires_review: boolean
          requires_signature: boolean
          service_category_id: string | null
          slug: string
          status: string
          tags: string[]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          billing_rule_id?: string | null
          created_at?: string
          created_by?: string | null
          default_price?: number | null
          description?: string | null
          display_order?: number
          document_request_template_id?: string | null
          engagement_letter_template_id?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_bookable?: boolean
          is_portal_visible?: boolean
          name: string
          organizer_template_id?: string | null
          pipeline_id?: string | null
          pricing_rule_id?: string | null
          process_id?: string | null
          requires_documents?: boolean
          requires_engagement_letter?: boolean
          requires_invoice?: boolean
          requires_organizer?: boolean
          requires_payment_before_release?: boolean
          requires_review?: boolean
          requires_signature?: boolean
          service_category_id?: string | null
          slug: string
          status?: string
          tags?: string[]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          billing_rule_id?: string | null
          created_at?: string
          created_by?: string | null
          default_price?: number | null
          description?: string | null
          display_order?: number
          document_request_template_id?: string | null
          engagement_letter_template_id?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_bookable?: boolean
          is_portal_visible?: boolean
          name?: string
          organizer_template_id?: string | null
          pipeline_id?: string | null
          pricing_rule_id?: string | null
          process_id?: string | null
          requires_documents?: boolean
          requires_engagement_letter?: boolean
          requires_invoice?: boolean
          requires_organizer?: boolean
          requires_payment_before_release?: boolean
          requires_review?: boolean
          requires_signature?: boolean
          service_category_id?: string | null
          slug?: string
          status?: string
          tags?: string[]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_billing_rule_id_fkey"
            columns: ["billing_rule_id"]
            isOneToOne: false
            referencedRelation: "billing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_document_request_template_id_fkey"
            columns: ["document_request_template_id"]
            isOneToOne: false
            referencedRelation: "document_request_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_engagement_letter_template_id_fkey"
            columns: ["engagement_letter_template_id"]
            isOneToOne: false
            referencedRelation: "engagement_letter_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_organizer_template_id_fkey"
            columns: ["organizer_template_id"]
            isOneToOne: false
            referencedRelation: "organizer_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          merge_fields: Json
          name: string
          schedule_rule: Json
          slug: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          merge_fields?: Json
          name: string
          schedule_rule?: Json
          slug: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          merge_fields?: Json
          name?: string
          schedule_rule?: Json
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
          workspace_id: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
          workspace_id: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
          workspace_id?: string
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
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_workspace_id: string | null
          display_name: string | null
          failed_login_count: number
          first_name: string | null
          id: string
          is_platform_admin: boolean
          last_name: string | null
          last_seen_at: string | null
          locked_until: string | null
          mfa_enabled: boolean
          mfa_enrolled_at: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_workspace_id?: string | null
          display_name?: string | null
          failed_login_count?: number
          first_name?: string | null
          id: string
          is_platform_admin?: boolean
          last_name?: string | null
          last_seen_at?: string | null
          locked_until?: string | null
          mfa_enabled?: boolean
          mfa_enrolled_at?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_workspace_id?: string | null
          display_name?: string | null
          failed_login_count?: number
          first_name?: string | null
          id?: string
          is_platform_admin?: boolean
          last_name?: string | null
          last_seen_at?: string | null
          locked_until?: string | null
          mfa_enabled?: boolean
          mfa_enrolled_at?: string | null
          phone?: string | null
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
      workspace_feature_flags: {
        Row: {
          config: Json
          feature_flag_id: string
          id: string
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          config?: Json
          feature_flag_id: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          config?: Json
          feature_flag_id?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_feature_flags_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_feature_flags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_users: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_owner: boolean
          joined_at: string | null
          role_id: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_owner?: boolean
          joined_at?: string | null
          role_id: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_owner?: boolean
          joined_at?: string | null
          role_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_ero: boolean
          is_ptin_preparer: boolean
          is_service_bureau: boolean
          name: string
          primary_contact_email: string | null
          slug: string
          status: string
          timezone: string
          updated_at: string
          workspace_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_ero?: boolean
          is_ptin_preparer?: boolean
          is_service_bureau?: boolean
          name: string
          primary_contact_email?: string | null
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
          workspace_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_ero?: boolean
          is_ptin_preparer?: boolean
          is_service_bureau?: boolean
          name?: string
          primary_contact_email?: string | null
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
          workspace_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      compliance_consent_status_view: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          consent_type: string | null
          id: string | null
          user_id: string | null
          version: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      compliance_failed_logins_view: {
        Row: {
          created_at: string | null
          display_name: string | null
          failure_reason: string | null
          id: string | null
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      compliance_mfa_status_view: {
        Row: {
          display_name: string | null
          mfa_enabled: boolean | null
          mfa_enrolled_at: string | null
          role_name: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      compliance_pending_reviews_view: {
        Row: {
          created_at: string | null
          engagement_id: string | null
          expires_at: string | null
          id: string | null
          shared_by: string | null
          shared_items: Json | null
          shared_with_workspace_id: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      compliance_permission_changes_view: {
        Row: {
          action: string | null
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      compliance_security_events_view: {
        Row: {
          action: string | null
          actor_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          metadata: Json | null
          severity: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      compliance_sensitive_data_reveals_view: {
        Row: {
          action: string | null
          actor_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      compliance_shared_engagements_view: {
        Row: {
          created_at: string | null
          decision_notes: string | null
          engagement_id: string | null
          expires_at: string | null
          id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shared_by: string | null
          shared_with_workspace_id: string | null
          status: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      v_engagement_progress: {
        Row: {
          document_progress_pct: number | null
          engagement_id: string | null
          engagement_number: string | null
          overall_progress_pct: number | null
          task_progress_pct: number | null
          workflow_status: Database["public"]["Enums"]["workflow_run_status"] | null
        }
        Relationships: []
      }
      v_reviewer_queue: {
        Row: {
          client_id: string | null
          due_date: string | null
          engagement_number: string | null
          reviewer_id: string | null
          stage_name: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_stage_status"] | null
          workflow_stage_id: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      v_workflow_sla_status: {
        Row: {
          due_date: string | null
          expected_duration: unknown | null
          sla_category: string | null
          stage_name: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_stage_status"] | null
          time_elapsed: unknown | null
          workflow_run_id: string | null
          workflow_stage_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_config_object_share: {
        Args: { p_share_id: string }
        Returns: string
      }
      accept_workspace_invitation: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      advance_onboarding_step: {
        Args: {
          p_selected_blueprint_id?: string
          p_startup_method?: string
          p_step: number
          p_workspace_id: string
        }
        Returns: undefined
      }
      apply_blueprint: {
        Args: { p_blueprint_id: string; p_workspace_id: string }
        Returns: string
      }
      check_stage_readiness: {
        Args: { p_workflow_stage_id: string }
        Returns: { is_ready: boolean; missing_requirements: string[] }[]
      }
      create_notification: {
        Args: {
          p_channels?: string[]
          p_event_type: string
          p_payload?: Json
          p_priority?: string
          p_recipient_user_id: string
          p_template_key: string
          p_workspace_id: string
        }
        Returns: string
      }
      review_comment: {
        Args: { p_comment: string; p_engagement_share_id: string }
        Returns: undefined
      }
      review_request_corrections: {
        Args: { p_comment: string; p_engagement_share_id: string }
        Returns: undefined
      }
      start_engagement_workflow: {
        Args: { p_engagement_id: string; p_process_id: string }
        Returns: string
      }
      withdraw_engagement_share: {
        Args: { p_engagement_share_id: string }
        Returns: undefined
      }
      archive_config_object_share: {
        Args: { p_share_id: string }
        Returns: undefined
      }
      compare_config_object_versions: {
        Args: {
          p_id: string
          p_table: string
          p_version_a: number
          p_version_b: number
        }
        Returns: Json
      }
      compliance_inactive_users: {
        Args: { p_inactive_since?: string; p_workspace_id: string }
        Returns: {
          display_name: string | null
          last_seen_at: string | null
          role_name: string | null
          user_id: string
          workspace_id: string
        }[]
      }
      create_client: {
        Args: {
          p_business_name?: string
          p_client_type: string
          p_date_of_birth?: string
          p_ein?: string
          p_first_name?: string
          p_itin?: string
          p_last_name?: string
          p_primary_email?: string
          p_primary_phone?: string
          p_ssn?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_workspace: {
        Args: { p_name: string; p_timezone?: string; p_workspace_type?: string }
        Returns: string
      }
      current_workspace_ids: { Args: never; Returns: string[] }
      decline_config_object_share: {
        Args: { p_share_id: string }
        Returns: undefined
      }
      decrypt_client_secret: { Args: { p_ciphertext: string }; Returns: string }
      decrypt_firm_secret: { Args: { p_ciphertext: string }; Returns: string }
      duplicate_config_object: {
        Args: {
          p_id: string
          p_new_name?: string
          p_table: string
          p_target_workspace_id?: string
        }
        Returns: string
      }
      encrypt_client_secret: { Args: { p_plaintext: string }; Returns: string }
      encrypt_firm_secret: { Args: { p_plaintext: string }; Returns: string }
      expire_stale_engagement_shares: { Args: never; Returns: number }
      has_config_object_share_access: {
        Args: { p_id: string; p_table: string }
        Returns: boolean
      }
      is_account_locked: { Args: { p_user_id: string }; Returns: boolean }
      merge_clients: {
        Args: { p_duplicate_client_id: string; p_primary_client_id: string }
        Returns: undefined
      }
      record_consent: {
        Args: {
          p_client_id?: string
          p_consent_type: string
          p_ip_address?: string
          p_user_agent?: string
          p_version: string
          p_workspace_id?: string
        }
        Returns: string
      }
      record_login_attempt: {
        Args: {
          p_failure_reason?: string
          p_ip_address?: string
          p_success: boolean
          p_user_agent?: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      reveal_client_ein: { Args: { p_client_id: string }; Returns: string }
      reveal_client_itin: { Args: { p_client_id: string }; Returns: string }
      reveal_client_ssn: { Args: { p_client_id: string }; Returns: string }
      share_config_object: {
        Args: { p_id: string; p_shared_with_workspace_id: string; p_table: string }
        Returns: string
      }
      share_engagement_with_ero: {
        Args: {
          p_engagement_id: string
          p_expires_in_days?: number
          p_shared_items?: Json
          p_shared_with_workspace_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      set_workspace_capabilities: {
        Args: {
          p_is_ero: boolean
          p_is_ptin_preparer: boolean
          p_is_service_bureau: boolean
          p_workspace_id: string
        }
        Returns: undefined
      }
      get_config_object_versions: {
        Args: { p_id: string; p_table: string }
        Returns: {
          changed_by: string | null
          created_at: string
          id: string
          object_id: string
          object_type: string
          snapshot: Json
          version_number: number
          workspace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "config_object_versions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_workspaces: {
        Args: never
        Returns: {
          is_owner: boolean
          role_name: string
          role_slug: string
          status: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
          workspace_type: string
        }[]
      }
      has_permission: {
        Args: { p_permission_key: string; p_workspace_id: string }
        Returns: boolean
      }
      invite_workspace_user: {
        Args: { p_role_id: string; p_user_id: string; p_workspace_id: string }
        Returns: string
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_valid_config_table: { Args: { p_table: string }; Returns: boolean }
      is_workspace_admin: { Args: { p_workspace_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      respond_to_engagement_share: {
        Args: {
          p_approve: boolean
          p_decision_notes?: string
          p_engagement_share_id: string
        }
        Returns: undefined
      }
      respond_to_firm_connection: {
        Args: { p_accept: boolean; p_connection_id: string }
        Returns: undefined
      }
      reveal_firm_efin: { Args: { p_workspace_id: string }; Returns: string }
      reveal_firm_ein: { Args: { p_workspace_id: string }; Returns: string }
      reveal_firm_ptin: { Args: { p_workspace_id: string }; Returns: string }
      revoke_workspace_user: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      set_config_object_status: {
        Args: { p_id: string; p_status: string; p_table: string }
        Returns: undefined
      }
      set_feature_flag: {
        Args: {
          p_config?: Json
          p_enabled: boolean
          p_flag_key: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      set_firm_tax_profile: {
        Args: {
          p_clear_efin?: boolean
          p_clear_ein?: boolean
          p_clear_ptin?: boolean
          p_efin?: string
          p_ein?: string
          p_ptin?: string
          p_regular_office_hours?: Json
          p_supported_filing_states?: string[]
          p_tax_season_hours?: Json
          p_workspace_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      engagement_priority: "Low" | "Medium" | "High" | "Urgent"
      review_status: "Pending" | "In Review" | "Approved" | "Rejected" | "Corrections Requested"
      workflow_run_status: "Pending" | "Active" | "Paused" | "Cancelled" | "Completed"
      workflow_stage_status: "Pending" | "In Progress" | "Waiting" | "Completed" | "Skipped"
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
      engagement_priority: ["Low", "Medium", "High", "Urgent"],
      review_status: ["Pending", "In Review", "Approved", "Rejected", "Corrections Requested"],
      workflow_run_status: ["Pending", "Active", "Paused", "Cancelled", "Completed"],
      workflow_stage_status: ["Pending", "In Progress", "Waiting", "Completed", "Skipped"],
    },
  },
} as const
