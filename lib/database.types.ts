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
          event_type: string | null
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
          event_type?: string | null
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
          event_type?: string | null
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
      appointments: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_at: string
          engagement_id: string | null
          id: string
          location: string | null
          meeting_url: string | null
          portal_visible: boolean
          staff_id: string | null
          start_at: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at: string
          engagement_id?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          portal_visible?: boolean
          staff_id?: string | null
          start_at: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string
          engagement_id?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          portal_visible?: boolean
          staff_id?: string | null
          start_at?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "appointments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "appointments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          ai_metadata: Json | null
          category: string | null
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size_bytes: number | null
          folder_id: string | null
          id: string
          is_archived: boolean
          is_favorite: boolean
          is_latest_version: boolean
          is_locked: boolean
          mime_type: string | null
          replaces_attachment_id: string | null
          search_vector: unknown
          storage_path: string
          tags: string[] | null
          uploaded_by: string | null
          version: number | null
          visibility: string
          workspace_id: string
        }
        Insert: {
          ai_metadata?: Json | null
          category?: string | null
          created_at?: string
          entity_id: string
          entity_type?: string
          file_name: string
          file_size_bytes?: number | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_latest_version?: boolean
          is_locked?: boolean
          mime_type?: string | null
          replaces_attachment_id?: string | null
          search_vector?: unknown
          storage_path: string
          tags?: string[] | null
          uploaded_by?: string | null
          version?: number | null
          visibility?: string
          workspace_id: string
        }
        Update: {
          ai_metadata?: Json | null
          category?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size_bytes?: number | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_latest_version?: boolean
          is_locked?: boolean
          mime_type?: string | null
          replaces_attachment_id?: string | null
          search_vector?: unknown
          storage_path?: string
          tags?: string[] | null
          uploaded_by?: string | null
          version?: number | null
          visibility?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_replaces_attachment_id_fkey"
            columns: ["replaces_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_workspace_id_fkey"
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
      automation_execution_logs: {
        Row: {
          automation_id: string
          engagement_id: string | null
          error_message: string | null
          executed_at: string | null
          execution_data: Json | null
          id: string
          status: string
          workflow_run_id: string | null
          workspace_id: string
        }
        Insert: {
          automation_id: string
          engagement_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          execution_data?: Json | null
          id?: string
          status: string
          workflow_run_id?: string | null
          workspace_id: string
        }
        Update: {
          automation_id?: string
          engagement_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          execution_data?: Json | null
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
            foreignKeyName: "automation_execution_logs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "automation_execution_logs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
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
          ai_config: Json | null
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
          ai_config?: Json | null
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
          ai_config?: Json | null
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
          billing_email: string | null
          business_email: string | null
          business_phone: string | null
          custom_domain: string | null
          dba: string | null
          display_name: string | null
          email_from_name: string | null
          email_header_logo_url: string | null
          logo_url: string | null
          notification_email: string | null
          pdf_header_logo_url: string | null
          portal_logo_url: string | null
          portal_subdomain: string | null
          primary_color: string
          reply_to_email: string | null
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
          billing_email?: string | null
          business_email?: string | null
          business_phone?: string | null
          custom_domain?: string | null
          dba?: string | null
          display_name?: string | null
          email_from_name?: string | null
          email_header_logo_url?: string | null
          logo_url?: string | null
          notification_email?: string | null
          pdf_header_logo_url?: string | null
          portal_logo_url?: string | null
          portal_subdomain?: string | null
          primary_color?: string
          reply_to_email?: string | null
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
          billing_email?: string | null
          business_email?: string | null
          business_phone?: string | null
          custom_domain?: string | null
          dba?: string | null
          display_name?: string | null
          email_from_name?: string | null
          email_header_logo_url?: string | null
          logo_url?: string | null
          notification_email?: string | null
          pdf_header_logo_url?: string | null
          portal_logo_url?: string | null
          portal_subdomain?: string | null
          primary_color?: string
          reply_to_email?: string | null
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
      change_orders: {
        Row: {
          amount_delta: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          description: string
          engagement_id: string
          id: string
          quote_id: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_delta?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          engagement_id: string
          id?: string
          quote_id?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_delta?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          engagement_id?: string
          id?: string
          quote_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "change_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "change_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_workspace_id_fkey"
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
      client_ledger: {
        Row: {
          amount: number
          balance_after: number
          client_id: string
          created_at: string
          description: string | null
          entry_type: string
          id: string
          reference_id: string | null
          reference_table: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          client_id: string
          created_at?: string
          description?: string | null
          entry_type: string
          id?: string
          reference_id?: string | null
          reference_table?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          client_id?: string
          created_at?: string
          description?: string | null
          entry_type?: string
          id?: string
          reference_id?: string | null
          reference_table?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ledger_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ledger_workspace_id_fkey"
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
          invitation_token: string
          invited_at: string
          invited_by: string | null
          invited_email: string
          invited_name: string | null
          is_primary: boolean
          status: string
          token_expires_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          display_order?: number
          id?: string
          invitation_token?: string
          invited_at?: string
          invited_by?: string | null
          invited_email: string
          invited_name?: string | null
          is_primary?: boolean
          status?: string
          token_expires_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          display_order?: number
          id?: string
          invitation_token?: string
          invited_at?: string
          invited_by?: string | null
          invited_email?: string
          invited_name?: string | null
          is_primary?: boolean
          status?: string
          token_expires_at?: string
          user_id?: string | null
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
          related_dob: string | null
          related_name: string | null
          related_ssn_encrypted: string | null
          related_ssn_last4: string | null
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
          related_dob?: string | null
          related_name?: string | null
          related_ssn_encrypted?: string | null
          related_ssn_last4?: string | null
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
          related_dob?: string | null
          related_name?: string | null
          related_ssn_encrypted?: string | null
          related_ssn_last4?: string | null
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
      clients: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          business_name: string | null
          city: string | null
          client_number: string | null
          client_type: string
          country: string
          created_at: string
          created_by: string | null
          custom_fields: Json
          date_of_birth: string | null
          default_compliance_officer_id: string | null
          default_reviewer_id: string | null
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
          relationship_manager_id: string | null
          search_vector: unknown
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
          client_number?: string | null
          client_type?: string
          country?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          date_of_birth?: string | null
          default_compliance_officer_id?: string | null
          default_reviewer_id?: string | null
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
          relationship_manager_id?: string | null
          search_vector?: unknown
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
          client_number?: string | null
          client_type?: string
          country?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          date_of_birth?: string | null
          default_compliance_officer_id?: string | null
          default_reviewer_id?: string | null
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
          relationship_manager_id?: string | null
          search_vector?: unknown
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
            foreignKeyName: "clients_default_compliance_officer_id_fkey"
            columns: ["default_compliance_officer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_default_reviewer_id_fkey"
            columns: ["default_reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_merged_into_client_id_fkey"
            columns: ["merged_into_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_relationship_manager_id_fkey"
            columns: ["relationship_manager_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
      communication_preferences: {
        Row: {
          client_id: string
          do_not_contact: boolean
          email_opt_in: boolean
          id: string
          preferred_channel: string
          sms_opt_in: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          do_not_contact?: boolean
          email_opt_in?: boolean
          id?: string
          preferred_channel?: string
          sms_opt_in?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          do_not_contact?: boolean
          email_opt_in?: boolean
          id?: string
          preferred_channel?: string
          sms_opt_in?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_preferences_workspace_id_fkey"
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
      consent_records: {
        Row: {
          accepted_at: string
          client_id: string | null
          consent_type: string
          created_at: string
          id: string
          ip_address: unknown
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
          ip_address?: unknown
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
          ip_address?: unknown
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
      dashboard_widgets: {
        Row: {
          config: Json
          created_at: string
          dashboard_id: string
          display_order: number
          grid_position: Json
          id: string
          is_visible: boolean
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
          is_visible?: boolean
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
          is_visible?: boolean
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
      document_folder_template_items: {
        Row: {
          created_at: string
          display_order: number
          document_folder_template_id: string
          id: string
          name: string
          parent_item_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          document_folder_template_id: string
          id?: string
          name: string
          parent_item_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          document_folder_template_id?: string
          id?: string
          name?: string
          parent_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_folder_template_items_document_folder_template_id_fkey"
            columns: ["document_folder_template_id"]
            isOneToOne: false
            referencedRelation: "document_folder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folder_template_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "document_folder_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folder_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          module: string
          name: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          module: string
          name: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          module?: string
          name?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_folder_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folder_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          created_at: string
          created_by: string | null
          display_order: number
          entity_id: string
          entity_type: string
          id: string
          name: string
          parent_folder_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_order?: number
          entity_id: string
          entity_type: string
          id?: string
          name: string
          parent_folder_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_order?: number
          entity_id?: string
          entity_type?: string
          id?: string
          name?: string
          parent_folder_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_request_item_statuses: {
        Row: {
          document_request_id: string
          document_request_item_id: string | null
          fulfilled_by_attachment_id: string | null
          id: string
          is_required: boolean
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          document_request_id: string
          document_request_item_id?: string | null
          fulfilled_by_attachment_id?: string | null
          id?: string
          is_required?: boolean
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          document_request_id?: string
          document_request_item_id?: string | null
          fulfilled_by_attachment_id?: string | null
          id?: string
          is_required?: boolean
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_request_item_statuses_document_request_id_fkey"
            columns: ["document_request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_request_item_statuses_document_request_item_id_fkey"
            columns: ["document_request_item_id"]
            isOneToOne: false
            referencedRelation: "document_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_request_item_statuses_fulfilled_by_attachment_id_fkey"
            columns: ["fulfilled_by_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      document_request_items: {
        Row: {
          category: string
          conditional_logic: Json
          created_at: string
          default_folder_name: string | null
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
          default_folder_name?: string | null
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
          default_folder_name?: string | null
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
      document_requests: {
        Row: {
          created_at: string
          created_by: string | null
          document_request_template_id: string | null
          due_date: string | null
          entity_id: string
          entity_type: string
          id: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_request_template_id?: string | null
          due_date?: string | null
          entity_id: string
          entity_type?: string
          id?: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_request_template_id?: string | null
          due_date?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_document_request_template_id_fkey"
            columns: ["document_request_template_id"]
            isOneToOne: false
            referencedRelation: "document_request_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_workspace_id_fkey"
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
      email_log: {
        Row: {
          bounced_at: string | null
          created_at: string
          delivered_at: string | null
          failed_reason: string | null
          id: string
          message_id: string | null
          open_count: number
          opened_at: string | null
          provider_reference: string | null
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string | null
          template_key: string | null
          workspace_id: string
        }
        Insert: {
          bounced_at?: string | null
          created_at?: string
          delivered_at?: string | null
          failed_reason?: string | null
          id?: string
          message_id?: string | null
          open_count?: number
          opened_at?: string | null
          provider_reference?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_key?: string | null
          workspace_id: string
        }
        Update: {
          bounced_at?: string | null
          created_at?: string
          delivered_at?: string | null
          failed_reason?: string | null
          id?: string
          message_id?: string | null
          open_count?: number
          opened_at?: string | null
          provider_reference?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_workspace_id_fkey"
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
            foreignKeyName: "engagement_assignment_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_assignment_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_assignment_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_assignment_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_assignment_history_new_user_id_fkey"
            columns: ["new_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_assignment_history_previous_user_id_fkey"
            columns: ["previous_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
          is_public: boolean
          merge_fields: Json
          name: string
          public_token: string
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
          is_public?: boolean
          merge_fields?: Json
          name: string
          public_token?: string
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
          is_public?: boolean
          merge_fields?: Json
          name?: string
          public_token?: string
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
      engagement_letter_public_signatures: {
        Row: {
          client_id: string
          created_at: string
          engagement_letter_template_id: string
          filed_as_attachment: boolean
          id: string
          resolved_body_html: string
          signed_at: string
          signer_email: string
          signer_name: string
          signer_phone: string | null
          typed_name: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          engagement_letter_template_id: string
          filed_as_attachment?: boolean
          id?: string
          resolved_body_html: string
          signed_at?: string
          signer_email: string
          signer_name: string
          signer_phone?: string | null
          typed_name: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          engagement_letter_template_id?: string
          filed_as_attachment?: boolean
          id?: string
          resolved_body_html?: string
          signed_at?: string
          signer_email?: string
          signer_name?: string
          signer_phone?: string | null
          typed_name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_letter_public_signatures_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_letter_public_signatures_engagement_letter_templ_fkey"
            columns: ["engagement_letter_template_id"]
            isOneToOne: false
            referencedRelation: "engagement_letter_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_letter_public_signatures_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_pricing: {
        Row: {
          base_amount: number | null
          created_at: string
          created_by: string | null
          discount_amount: number
          engagement_id: string
          final_amount: number | null
          id: string
          notes: string | null
          pricing_method: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_amount?: number | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          engagement_id: string
          final_amount?: number | null
          id?: string
          notes?: string | null
          pricing_method?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_amount?: number | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          engagement_id?: string
          final_amount?: number | null
          id?: string
          notes?: string | null
          pricing_method?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_pricing_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_pricing_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_pricing_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_pricing_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_pricing_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
            referencedRelation: "compliance_pending_reviews_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_review_actions_engagement_share_id_fkey"
            columns: ["engagement_share_id"]
            isOneToOne: false
            referencedRelation: "compliance_shared_engagements_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_review_actions_engagement_share_id_fkey"
            columns: ["engagement_share_id"]
            isOneToOne: false
            referencedRelation: "engagement_shares"
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
            foreignKeyName: "engagement_status_history_audit_reference_fkey"
            columns: ["audit_reference"]
            isOneToOne: false
            referencedRelation: "audit_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_status_history_audit_reference_fkey"
            columns: ["audit_reference"]
            isOneToOne: false
            referencedRelation: "compliance_permission_changes_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_status_history_audit_reference_fkey"
            columns: ["audit_reference"]
            isOneToOne: false
            referencedRelation: "compliance_security_events_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_status_history_audit_reference_fkey"
            columns: ["audit_reference"]
            isOneToOne: false
            referencedRelation: "compliance_sensitive_data_reveals_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_status_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_status_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_status_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
        ]
      }
      engagement_tax_details: {
        Row: {
          created_at: string
          efile_accepted_at: string | null
          efile_rejected_reason: string | null
          efile_status: string
          efile_transmitted_at: string | null
          engagement_id: string
          extension_due_date: string | null
          extension_filed_date: string | null
          federal_balance_due: number | null
          federal_refund_amount: number | null
          filing_status: string | null
          is_amended: boolean
          is_extended: boolean
          original_engagement_id: string | null
          return_type: string | null
          tax_year: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          efile_accepted_at?: string | null
          efile_rejected_reason?: string | null
          efile_status?: string
          efile_transmitted_at?: string | null
          engagement_id: string
          extension_due_date?: string | null
          extension_filed_date?: string | null
          federal_balance_due?: number | null
          federal_refund_amount?: number | null
          filing_status?: string | null
          is_amended?: boolean
          is_extended?: boolean
          original_engagement_id?: string | null
          return_type?: string | null
          tax_year?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          efile_accepted_at?: string | null
          efile_rejected_reason?: string | null
          efile_status?: string
          efile_transmitted_at?: string | null
          engagement_id?: string
          extension_due_date?: string | null
          extension_filed_date?: string | null
          federal_balance_due?: number | null
          federal_refund_amount?: number | null
          filing_status?: string | null
          is_amended?: boolean
          is_extended?: boolean
          original_engagement_id?: string | null
          return_type?: string | null
          tax_year?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_tax_details_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_tax_details_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_tax_details_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_tax_details_original_engagement_id_fkey"
            columns: ["original_engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_tax_details_original_engagement_id_fkey"
            columns: ["original_engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_tax_details_original_engagement_id_fkey"
            columns: ["original_engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_tax_details_workspace_id_fkey"
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
          completed_date: string | null
          compliance_officer_id: string | null
          created_at: string | null
          current_stage: string | null
          due_date: string | null
          engagement_number: string | null
          id: string
          internal_reference: string | null
          open_date: string | null
          owner_workspace_id: string | null
          pipeline_id: string | null
          pipeline_stage_id: string | null
          priority: Database["public"]["Enums"]["engagement_priority"] | null
          review_status: Database["public"]["Enums"]["review_status"] | null
          reviewer_id: string | null
          search_vector: unknown
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
          completed_date?: string | null
          compliance_officer_id?: string | null
          created_at?: string | null
          current_stage?: string | null
          due_date?: string | null
          engagement_number?: string | null
          id?: string
          internal_reference?: string | null
          open_date?: string | null
          owner_workspace_id?: string | null
          pipeline_id?: string | null
          pipeline_stage_id?: string | null
          priority?: Database["public"]["Enums"]["engagement_priority"] | null
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewer_id?: string | null
          search_vector?: unknown
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
          completed_date?: string | null
          compliance_officer_id?: string | null
          created_at?: string | null
          current_stage?: string | null
          due_date?: string | null
          engagement_number?: string | null
          id?: string
          internal_reference?: string | null
          open_date?: string | null
          owner_workspace_id?: string | null
          pipeline_id?: string | null
          pipeline_stage_id?: string | null
          priority?: Database["public"]["Enums"]["engagement_priority"] | null
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewer_id?: string | null
          search_vector?: unknown
          service_id?: string | null
          shared_status?: string | null
          status?: string
          updated_at?: string
          workflow_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagements_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
            foreignKeyName: "engagements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
            foreignKeyName: "engagements_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
            foreignKeyName: "engagements_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "processes"
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
      invoices: {
        Row: {
          amount_paid: number
          client_id: string
          created_at: string
          created_by: string | null
          discount_amount: number
          due_date: string | null
          engagement_id: string | null
          expected_deposit_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string
          line_items: Json
          notes: string | null
          payment_method: string | null
          sent_at: string | null
          status: string
          stripe_checkout_url: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_paid?: number
          client_id: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date?: string | null
          engagement_id?: string | null
          expected_deposit_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string
          line_items?: Json
          notes?: string | null
          payment_method?: string | null
          sent_at?: string | null
          status?: string
          stripe_checkout_url?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_paid?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date?: string | null
          engagement_id?: string | null
          expected_deposit_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string
          line_items?: Json
          notes?: string | null
          payment_method?: string | null
          sent_at?: string | null
          status?: string
          stripe_checkout_url?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "invoices_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      irs_notices: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          notice_date: string
          notice_type: string
          resolution_notes: string | null
          resolved_at: string | null
          response_due_date: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          notice_date: string
          notice_type: string
          resolution_notes?: string | null
          resolved_at?: string | null
          response_due_date?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          notice_date?: string
          notice_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          response_due_date?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "irs_notices_workspace_id_fkey"
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
          ip_address: unknown
          success: boolean
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          success: boolean
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
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
      message_threads: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          last_message_at: string | null
          status: string
          subject: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type?: string
          id?: string
          last_message_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          last_message_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_internal: boolean
          read_at: string | null
          sender_id: string | null
          sender_type: string
          thread_id: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          read_at?: string | null
          sender_id?: string | null
          sender_type?: string
          thread_id: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          read_at?: string | null
          sender_id?: string | null
          sender_type?: string
          thread_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
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
          search_vector: unknown
          subject: string | null
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
          search_vector?: unknown
          subject?: string | null
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
          search_vector?: unknown
          subject?: string | null
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
      notification_preferences: {
        Row: {
          channel: string
          created_at: string
          enabled: boolean
          event_type: string
          id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          enabled?: boolean
          event_type: string
          id?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          enabled?: boolean
          event_type?: string
          id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          error: string | null
          event_type: string | null
          id: string
          max_attempts: number
          payload: Json
          priority: string | null
          read_at: string | null
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
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          max_attempts?: number
          payload?: Json
          priority?: string | null
          read_at?: string | null
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
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          max_attempts?: number
          payload?: Json
          priority?: string | null
          read_at?: string | null
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
      organizer_response_answers: {
        Row: {
          id: string
          instance_index: number
          organizer_field_id: string
          organizer_response_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          id?: string
          instance_index?: number
          organizer_field_id: string
          organizer_response_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          id?: string
          instance_index?: number
          organizer_field_id?: string
          organizer_response_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_response_answers_organizer_field_id_fkey"
            columns: ["organizer_field_id"]
            isOneToOne: false
            referencedRelation: "organizer_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_response_answers_organizer_response_id_fkey"
            columns: ["organizer_response_id"]
            isOneToOne: false
            referencedRelation: "organizer_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_responses: {
        Row: {
          client_id: string
          created_at: string
          engagement_id: string | null
          filed_as_attachment: boolean
          id: string
          is_public_submission: boolean
          organizer_template_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          engagement_id?: string | null
          filed_as_attachment?: boolean
          id?: string
          is_public_submission?: boolean
          organizer_template_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          engagement_id?: string | null
          filed_as_attachment?: boolean
          id?: string
          is_public_submission?: boolean
          organizer_template_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_responses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_responses_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_responses_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "organizer_responses_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "organizer_responses_organizer_template_id_fkey"
            columns: ["organizer_template_id"]
            isOneToOne: false
            referencedRelation: "organizer_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_responses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          is_public: boolean
          name: string
          public_token: string
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
          is_public?: boolean
          name: string
          public_token?: string
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
          is_public?: boolean
          name?: string
          public_token?: string
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
      payment_methods: {
        Row: {
          brand: string | null
          client_id: string
          created_at: string
          exp_month: number | null
          exp_year: number | null
          external_reference: string | null
          id: string
          is_default: boolean
          last4: string | null
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brand?: string | null
          client_id: string
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          external_reference?: string | null
          id?: string
          is_default?: boolean
          last4?: string | null
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brand?: string | null
          client_id?: string
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          external_reference?: string | null
          id?: string
          is_default?: boolean
          last4?: string | null
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          installment_number: number
          invoice_id: string
          paid_payment_id: string | null
          status: string
          stripe_checkout_url: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          installment_number: number
          invoice_id: string
          paid_payment_id?: string | null
          status?: string
          stripe_checkout_url?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          invoice_id?: string
          paid_payment_id?: string | null
          status?: string
          stripe_checkout_url?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_paid_payment_id_fkey"
            columns: ["paid_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          currency: string
          id: string
          invoice_id: string | null
          notes: string | null
          payment_date: string
          payment_method_id: string | null
          recorded_by: string | null
          reference: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method_id?: string | null
          recorded_by?: string | null
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method_id?: string | null
          recorded_by?: string | null
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
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
      platform_subscription_plans: {
        Row: {
          base_price_cents: number
          created_at: string
          currency: string
          email_overage_rate_cents: number
          id: string
          included_seats: number
          is_active: boolean
          name: string
          per_seat_price_cents: number
          slug: string
          sms_overage_rate_cents: number
          storage_overage_rate_cents: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          base_price_cents: number
          created_at?: string
          currency?: string
          email_overage_rate_cents?: number
          id?: string
          included_seats?: number
          is_active?: boolean
          name: string
          per_seat_price_cents?: number
          slug: string
          sms_overage_rate_cents?: number
          storage_overage_rate_cents?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          base_price_cents?: number
          created_at?: string
          currency?: string
          email_overage_rate_cents?: number
          id?: string
          included_seats?: number
          is_active?: boolean
          name?: string
          per_seat_price_cents?: number
          slug?: string
          sms_overage_rate_cents?: number
          storage_overage_rate_cents?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
          critical_threshold: string | null
          display_order: number
          due_date_rule: Json
          entry_conditions: Json
          expected_duration: string | null
          id: string
          name: string
          notify_on_entry: Json
          process_id: string
          reviewer_role_id: string | null
          updated_at: string
          warning_threshold: string | null
        }
        Insert: {
          completion_rule?: string
          created_at?: string
          critical_threshold?: string | null
          display_order?: number
          due_date_rule?: Json
          entry_conditions?: Json
          expected_duration?: string | null
          id?: string
          name: string
          notify_on_entry?: Json
          process_id: string
          reviewer_role_id?: string | null
          updated_at?: string
          warning_threshold?: string | null
        }
        Update: {
          completion_rule?: string
          created_at?: string
          critical_threshold?: string | null
          display_order?: number
          due_date_rule?: Json
          entry_conditions?: Json
          expected_duration?: string | null
          id?: string
          name?: string
          notify_on_entry?: Json
          process_id?: string
          reviewer_role_id?: string | null
          updated_at?: string
          warning_threshold?: string | null
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
      provider_status: {
        Row: {
          consecutive_failures: number
          is_configured: boolean
          last_check_at: string | null
          last_error: string | null
          last_failure_at: string | null
          last_success_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          is_configured?: boolean
          last_check_at?: string | null
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          is_configured?: boolean
          last_check_at?: string | null
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          declined_at: string | null
          discount_amount: number
          engagement_id: string | null
          id: string
          line_items: Json
          notes: string | null
          quote_number: string | null
          sent_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          title: string
          total_amount: number
          updated_at: string
          valid_until: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          discount_amount?: number
          engagement_id?: string | null
          id?: string
          line_items?: Json
          notes?: string | null
          quote_number?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          title: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          discount_amount?: number
          engagement_id?: string | null
          id?: string
          line_items?: Json
          notes?: string | null
          quote_number?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          title?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "quotes_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          created_at: string
          id: number
          rate_key: string
        }
        Insert: {
          created_at?: string
          id?: never
          rate_key: string
        }
        Update: {
          created_at?: string
          id?: never
          rate_key?: string
        }
        Relationships: []
      }
      recurring_billing: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          engagement_id: string | null
          frequency: string
          id: string
          next_billing_date: string
          payment_method_id: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id?: string | null
          frequency: string
          id?: string
          next_billing_date: string
          payment_method_id?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id?: string | null
          frequency?: string
          id?: string
          next_billing_date?: string
          payment_method_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_billing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_billing_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_billing_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_billing_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "recurring_billing_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "recurring_billing_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_billing_workspace_id_fkey"
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
          document_folder_template_id: string | null
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
          document_folder_template_id?: string | null
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
          document_folder_template_id?: string | null
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
            foreignKeyName: "services_document_folder_template_id_fkey"
            columns: ["document_folder_template_id"]
            isOneToOne: false
            referencedRelation: "document_folder_templates"
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
      signature_request_signers: {
        Row: {
          access_token: string
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          id: string
          sign_order: number
          signature_image_path: string | null
          signature_request_id: string
          signature_type: string | null
          signed_at: string | null
          signer_email: string | null
          signer_name: string
          status: string
          typed_name: string | null
          user_agent: string | null
        }
        Insert: {
          access_token?: string
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          id?: string
          sign_order?: number
          signature_image_path?: string | null
          signature_request_id: string
          signature_type?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name: string
          status?: string
          typed_name?: string | null
          user_agent?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          id?: string
          sign_order?: number
          signature_image_path?: string | null
          signature_request_id?: string
          signature_type?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string
          status?: string
          typed_name?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_request_signers_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_requests: {
        Row: {
          attachment_id: string
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attachment_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attachment_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_requests_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_log: {
        Row: {
          body: string
          created_at: string
          delivered_at: string | null
          failed_reason: string | null
          id: string
          message_id: string | null
          provider_reference: string | null
          recipient_phone: string
          sent_at: string | null
          status: string
          template_key: string | null
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          delivered_at?: string | null
          failed_reason?: string | null
          id?: string
          message_id?: string | null
          provider_reference?: string | null
          recipient_phone: string
          sent_at?: string | null
          status?: string
          template_key?: string | null
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          delivered_at?: string | null
          failed_reason?: string | null
          id?: string
          message_id?: string | null
          provider_reference?: string | null
          recipient_phone?: string
          sent_at?: string | null
          status?: string
          template_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_log_workspace_id_fkey"
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
      task_dependencies: {
        Row: {
          created_at: string
          depends_on_task_id: string
          id: string
          task_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          depends_on_task_id: string
          id?: string
          task_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          depends_on_task_id?: string
          id?: string
          task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_workspace_id_fkey"
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
          workflow_stage_id: string | null
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
          workflow_stage_id?: string | null
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
          workflow_stage_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "tasks_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "tasks_workflow_stage_id_fkey"
            columns: ["workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["workflow_stage_id"]
          },
          {
            foreignKeyName: "tasks_workflow_stage_id_fkey"
            columns: ["workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_sla_status"
            referencedColumns: ["workflow_stage_id"]
          },
          {
            foreignKeyName: "tasks_workflow_stage_id_fkey"
            columns: ["workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
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
      tax_years: {
        Row: {
          created_at: string
          id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          year?: number
        }
        Relationships: []
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
      user_widget_preferences: {
        Row: {
          created_at: string
          dashboard_widget_id: string
          display_order: number | null
          id: string
          is_visible: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dashboard_widget_id: string
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dashboard_widget_id?: string
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_widget_preferences_dashboard_widget_id_fkey"
            columns: ["dashboard_widget_id"]
            isOneToOne: false
            referencedRelation: "dashboard_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_zoom_connections: {
        Row: {
          access_token_encrypted: string | null
          connected_at: string
          created_at: string
          id: string
          refresh_token_encrypted: string | null
          refresh_token_rotated_at: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
          zoom_email: string | null
          zoom_user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          refresh_token_encrypted?: string | null
          refresh_token_rotated_at?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          zoom_email?: string | null
          zoom_user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          refresh_token_encrypted?: string | null
          refresh_token_rotated_at?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          zoom_email?: string | null
          zoom_user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          attempts: number
          event_type: string
          external_id: string | null
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          event_type: string
          external_id?: string | null
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          event_type?: string
          external_id?: string | null
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
            foreignKeyName: "fk_current_stage"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["workflow_stage_id"]
          },
          {
            foreignKeyName: "fk_current_stage"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_sla_status"
            referencedColumns: ["workflow_stage_id"]
          },
          {
            foreignKeyName: "fk_current_stage"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_progress"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "workflow_runs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_reviewer_queue"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "workflow_runs_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
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
          actual_duration: string | null
          assigned_staff_id: string | null
          completed_at: string | null
          created_at: string | null
          display_order: number
          due_date: string | null
          estimated_duration: string | null
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
          actual_duration?: string | null
          assigned_staff_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          display_order: number
          due_date?: string | null
          estimated_duration?: string | null
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
          actual_duration?: string | null
          assigned_staff_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          display_order?: number
          due_date?: string | null
          estimated_duration?: string | null
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
            foreignKeyName: "workflow_stages_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
            foreignKeyName: "workflow_stages_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
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
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role_id: string
          status: string
          token: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role_id: string
          status?: string
          token?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role_id?: string
          status?: string
          token?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      workspace_subscription_invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          hosted_invoice_url: string | null
          id: string
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: string
          stripe_invoice_id: string
          workspace_id: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          created_at?: string
          hosted_invoice_url?: string | null
          id?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status: string
          stripe_invoice_id: string
          workspace_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          hosted_invoice_url?: string | null
          id?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_invoice_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscription_invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          card_funding_type: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          locked_plan_snapshot: Json | null
          plan_id: string
          price_change_effective_date: string | null
          price_change_notice_sent_at: string | null
          seat_count: number
          stripe_customer_id: string | null
          stripe_status: string
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          card_funding_type?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          locked_plan_snapshot?: Json | null
          plan_id: string
          price_change_effective_date?: string | null
          price_change_notice_sent_at?: string | null
          seat_count?: number
          stripe_customer_id?: string | null
          stripe_status?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          card_funding_type?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          locked_plan_snapshot?: Json | null
          plan_id?: string
          price_change_effective_date?: string | null
          price_change_notice_sent_at?: string | null
          seat_count?: number
          stripe_customer_id?: string | null
          stripe_status?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
          mailing_address: string | null
          name: string
          phone: string | null
          primary_contact_email: string | null
          slug: string
          status: string
          stripe_charges_enabled: boolean
          stripe_connect_account_type: string | null
          stripe_connect_status: string
          stripe_connect_updated_at: string | null
          stripe_connected_account_id: string | null
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          suspension_reason: string | null
          timezone: string
          updated_at: string
          website: string | null
          workspace_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_ero?: boolean
          is_ptin_preparer?: boolean
          is_service_bureau?: boolean
          mailing_address?: string | null
          name: string
          phone?: string | null
          primary_contact_email?: string | null
          slug: string
          status?: string
          stripe_charges_enabled?: boolean
          stripe_connect_account_type?: string | null
          stripe_connect_status?: string
          stripe_connect_updated_at?: string | null
          stripe_connected_account_id?: string | null
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
          workspace_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_ero?: boolean
          is_ptin_preparer?: boolean
          is_service_bureau?: boolean
          mailing_address?: string | null
          name?: string
          phone?: string | null
          primary_contact_email?: string | null
          slug?: string
          status?: string
          stripe_charges_enabled?: boolean
          stripe_connect_account_type?: string | null
          stripe_connect_status?: string
          stripe_connect_updated_at?: string | null
          stripe_connected_account_id?: string | null
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
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
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          consent_type?: string | null
          id?: string | null
          user_id?: string | null
          version?: string | null
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          consent_type?: string | null
          id?: string | null
          user_id?: string | null
          version?: string | null
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
      compliance_failed_logins_view: {
        Row: {
          created_at: string | null
          display_name: string | null
          failure_reason: string | null
          id: string | null
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
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
      compliance_mfa_status_view: {
        Row: {
          display_name: string | null
          mfa_enabled: boolean | null
          mfa_enrolled_at: string | null
          role_name: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
        Insert: {
          created_at?: string | null
          engagement_id?: string | null
          expires_at?: string | null
          id?: string | null
          shared_by?: string | null
          shared_items?: Json | null
          shared_with_workspace_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          engagement_id?: string | null
          expires_at?: string | null
          id?: string | null
          shared_by?: string | null
          shared_items?: Json | null
          shared_with_workspace_id?: string | null
          workspace_id?: string | null
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
        Insert: {
          action?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
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
        Insert: {
          action?: string | null
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          metadata?: Json | null
          severity?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          metadata?: Json | null
          severity?: string | null
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
        Insert: {
          action?: string | null
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
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
        Insert: {
          created_at?: string | null
          decision_notes?: string | null
          engagement_id?: string | null
          expires_at?: string | null
          id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_by?: string | null
          shared_with_workspace_id?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          decision_notes?: string | null
          engagement_id?: string | null
          expires_at?: string | null
          id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_by?: string | null
          shared_with_workspace_id?: string | null
          status?: string | null
          workspace_id?: string | null
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
      v_engagement_progress: {
        Row: {
          document_progress_pct: number | null
          engagement_id: string | null
          engagement_number: string | null
          overall_progress_pct: number | null
          task_progress_pct: number | null
          workflow_status:
            | Database["public"]["Enums"]["workflow_run_status"]
            | null
        }
        Relationships: []
      }
      v_reviewer_queue: {
        Row: {
          client_id: string | null
          due_date: string | null
          engagement_id: string | null
          engagement_number: string | null
          reviewer_id: string | null
          stage_name: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_stage_status"] | null
          workflow_stage_id: string | null
          workspace_id: string | null
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
      v_staff_productivity: {
        Row: {
          engagements_completed_this_month: number | null
          open_engagements: number | null
          pending_reviews: number | null
          staff_id: string | null
          tasks_completed: number | null
          tasks_overdue: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tax_season_metrics: {
        Row: {
          accepted: number | null
          amended: number | null
          extended: number | null
          not_filed: number | null
          open_irs_notices: number | null
          rejected: number | null
          tax_year: number | null
          total_returns: number | null
          transmitted: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_tax_details_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_workflow_sla_status: {
        Row: {
          due_date: string | null
          expected_duration: string | null
          sla_category: string | null
          stage_name: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_stage_status"] | null
          time_elapsed: string | null
          workflow_run_id: string | null
          workflow_stage_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stages_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_config_object_share: {
        Args: { p_share_id: string }
        Returns: string
      }
      accept_portal_invitation: { Args: { p_token: string }; Returns: string }
      accept_workspace_invitation: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      accept_workspace_invitation_by_token: {
        Args: { p_token: string }
        Returns: string
      }
      add_process_stage: {
        Args: { p_service_id: string; p_stage_name: string }
        Returns: string
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
      archive_config_object_share: {
        Args: { p_share_id: string }
        Returns: undefined
      }
      check_rate_limit: {
        Args: { p_key: string; p_max_hits: number; p_window_seconds: number }
        Returns: boolean
      }
      check_stage_readiness: {
        Args: { p_workflow_stage_id: string }
        Returns: {
          is_ready: boolean
          missing_requirements: string[]
        }[]
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
          display_name: string
          last_seen_at: string
          role_name: string
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
      create_client_relationship: {
        Args: {
          p_client_id: string
          p_related_client_id?: string
          p_related_dob?: string
          p_related_name: string
          p_related_ssn?: string
          p_relationship_type: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_document_request: {
        Args: {
          p_due_date?: string
          p_entity_id: string
          p_entity_type: string
          p_template_id: string
          p_title: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_engagement: {
        Args: {
          p_assigned_staff_id?: string
          p_client_id: string
          p_priority?: Database["public"]["Enums"]["engagement_priority"]
          p_service_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_notification: {
        Args: {
          p_channels?: string[]
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_payload?: Json
          p_priority?: string
          p_recipient_user_id: string
          p_template_key: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_workspace: {
        Args: { p_name: string; p_timezone?: string; p_workspace_type?: string }
        Returns: string
      }
      create_workspace_invitation: {
        Args: { p_email: string; p_role_id: string; p_workspace_id: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role_id: string
          status: string
          token: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_workspace_ids: { Args: never; Returns: string[] }
      decline_config_object_share: {
        Args: { p_share_id: string }
        Returns: undefined
      }
      decline_signature: {
        Args: { p_reason?: string; p_signer_id: string }
        Returns: undefined
      }
      decline_signature_by_token: {
        Args: { p_reason?: string; p_token: string }
        Returns: undefined
      }
      decrypt_client_secret: { Args: { p_ciphertext: string }; Returns: string }
      decrypt_firm_secret: { Args: { p_ciphertext: string }; Returns: string }
      decrypt_zoom_secret: { Args: { p_ciphertext: string }; Returns: string }
      delete_process_stage: {
        Args: {
          p_destination_stage_id?: string
          p_new_stage_name?: string
          p_stage_id: string
        }
        Returns: undefined
      }
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
      encrypt_zoom_secret: { Args: { p_plaintext: string }; Returns: string }
      enqueue_reminder_notifications: { Args: never; Returns: number }
      ensure_default_dashboard: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      ensure_next_tax_year: { Args: never; Returns: number }
      ensure_default_pipeline: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      ensure_workspace_security_policy: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      expire_stale_engagement_shares: { Args: never; Returns: number }
      fulfill_document_request_item: {
        Args: { p_attachment_id: string; p_item_status_id: string }
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
      get_invitation_preview: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          role_name: string
          status: string
          workspace_name: string
        }[]
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
      get_portal_invitation_preview: {
        Args: { p_token: string }
        Returns: {
          client_label: string
          invited_email: string
          invited_name: string
          status: string
          token_expires_at: string
        }[]
      }
      get_public_engagement_letter_template: {
        Args: { p_token: string }
        Returns: Json
      }
      get_public_organizer_template: {
        Args: { p_token: string }
        Returns: Json
      }
      get_signature_request_by_token: {
        Args: { p_token: string }
        Returns: {
          attachment_file_name: string
          attachment_id: string
          attachment_mime_type: string
          decline_reason: string
          declined_at: string
          request_status: string
          request_title: string
          signed_at: string
          signer_id: string
          signer_name: string
          signer_status: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      get_workspace_billing_admin: {
        Args: { p_workspace_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      has_config_object_share_access: {
        Args: { p_id: string; p_table: string }
        Returns: boolean
      }
      has_permission: {
        Args: { p_permission_key: string; p_workspace_id: string }
        Returns: boolean
      }
      invite_portal_user: {
        Args: {
          p_client_id: string
          p_email: string
          p_is_primary?: boolean
          p_name?: string
        }
        Returns: {
          accepted_at: string | null
          client_id: string
          display_order: number
          id: string
          invitation_token: string
          invited_at: string
          invited_by: string | null
          invited_email: string
          invited_name: string | null
          is_primary: boolean
          status: string
          token_expires_at: string
          user_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "client_portal_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invite_workspace_user: {
        Args: { p_role_id: string; p_user_id: string; p_workspace_id: string }
        Returns: string
      }
      is_account_locked: { Args: { p_user_id: string }; Returns: boolean }
      is_notification_enabled: {
        Args: {
          p_channel: string
          p_event_type: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_portal_accessible_entity_id: {
        Args: { p_entity_id: string }
        Returns: boolean
      }
      is_portal_user: { Args: { p_client_id: string }; Returns: boolean }
      is_portal_user_for_entity: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
      is_valid_config_table: { Args: { p_table: string }; Returns: boolean }
      is_workspace_admin: { Args: { p_workspace_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      mark_all_notifications_read: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      mark_document_request_item_received: {
        Args: { p_item_status_id: string }
        Returns: undefined
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      merge_clients: {
        Args: { p_duplicate_client_id: string; p_primary_client_id: string }
        Returns: undefined
      }
      portal_client_id: { Args: never; Returns: string }
      record_consent: {
        Args: {
          p_client_id?: string
          p_consent_type: string
          p_ip_address?: unknown
          p_user_agent?: string
          p_version: string
          p_workspace_id?: string
        }
        Returns: string
      }
      record_login_attempt: {
        Args: {
          p_failure_reason?: string
          p_ip_address?: unknown
          p_success: boolean
          p_user_agent?: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      record_provider_check: {
        Args: { p_error?: string; p_provider: string; p_success: boolean }
        Returns: undefined
      }
      record_signature: {
        Args: {
          p_signature_image_path?: string
          p_signature_type: string
          p_signer_id: string
          p_typed_name?: string
        }
        Returns: undefined
      }
      record_signature_by_token: {
        Args: {
          p_signature_image_path?: string
          p_signature_type: string
          p_token: string
          p_typed_name?: string
        }
        Returns: undefined
      }
      rename_process_stage: {
        Args: { p_new_name: string; p_stage_id: string }
        Returns: undefined
      }
      reorder_organizer_fields: {
        Args: { p_field_ids: string[]; p_template_id: string }
        Returns: undefined
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
      reveal_client_ein: { Args: { p_client_id: string }; Returns: string }
      reveal_client_itin: { Args: { p_client_id: string }; Returns: string }
      reveal_client_relationship_ssn: {
        Args: { p_relationship_id: string }
        Returns: string
      }
      reveal_client_ssn: { Args: { p_client_id: string }; Returns: string }
      reveal_firm_efin: { Args: { p_workspace_id: string }; Returns: string }
      reveal_firm_ein: { Args: { p_workspace_id: string }; Returns: string }
      reveal_firm_ptin: { Args: { p_workspace_id: string }; Returns: string }
      reveal_organizer_answer: {
        Args: { p_answer_id: string }
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
      revoke_workspace_user: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      run_critical_path_smoke_tests: {
        Args: never
        Returns: {
          check_name: string
          error_detail: string
          passed: boolean
        }[]
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
      set_workspace_capabilities: {
        Args: {
          p_is_ero: boolean
          p_is_ptin_preparer: boolean
          p_is_service_bureau: boolean
          p_workspace_id: string
        }
        Returns: undefined
      }
      share_config_object: {
        Args: {
          p_id: string
          p_shared_with_workspace_id: string
          p_table: string
        }
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
      sign_public_engagement_letter: {
        Args: {
          p_email: string
          p_first_name: string
          p_last_name: string | null
          p_phone: string | null
          p_token: string
          p_typed_name: string
        }
        Returns: Json
      }
      start_engagement_workflow: {
        Args: { p_engagement_id: string; p_process_id: string }
        Returns: string
      }
      submit_organizer_response: {
        Args: { p_response_id: string }
        Returns: undefined
      }
      submit_public_organizer_response: {
        Args: {
          p_answers: Json
          p_email: string
          p_first_name: string
          p_last_name: string | null
          p_phone: string | null
          p_token: string
        }
        Returns: Json
      }
      withdraw_engagement_share: {
        Args: { p_engagement_share_id: string }
        Returns: undefined
      }
    }
    Enums: {
      engagement_priority: "Low" | "Medium" | "High" | "Urgent"
      engagement_status:
        | "New"
        | "Waiting On Client"
        | "Waiting On Staff"
        | "In Progress"
        | "Waiting On Review"
        | "Corrections Requested"
        | "Approved"
        | "Waiting On Signature"
        | "Waiting On Payment"
        | "Ready To Release"
        | "Completed"
        | "Archived"
      review_status:
        | "Pending"
        | "In Review"
        | "Approved"
        | "Rejected"
        | "Corrections Requested"
      workflow_run_status:
        | "Pending"
        | "Active"
        | "Paused"
        | "Cancelled"
        | "Completed"
      workflow_stage_status:
        | "Pending"
        | "In Progress"
        | "Waiting"
        | "Completed"
        | "Skipped"
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
      engagement_status: [
        "New",
        "Waiting On Client",
        "Waiting On Staff",
        "In Progress",
        "Waiting On Review",
        "Corrections Requested",
        "Approved",
        "Waiting On Signature",
        "Waiting On Payment",
        "Ready To Release",
        "Completed",
        "Archived",
      ],
      review_status: [
        "Pending",
        "In Review",
        "Approved",
        "Rejected",
        "Corrections Requested",
      ],
      workflow_run_status: [
        "Pending",
        "Active",
        "Paused",
        "Cancelled",
        "Completed",
      ],
      workflow_stage_status: [
        "Pending",
        "In Progress",
        "Waiting",
        "Completed",
        "Skipped",
      ],
    },
  },
} as const
