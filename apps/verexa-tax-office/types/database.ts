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
      appointment_types: {
        Row: {
          booking_settings: Json
          buffer_after_minutes: number
          buffer_before_minutes: number
          color: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          location_type: Database["public"]["Enums"]["appointment_location_type"]
          name: string
          price: number
          requires_payment: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          booking_settings?: Json
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          color?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          location_type?: Database["public"]["Enums"]["appointment_location_type"]
          name: string
          price?: number
          requires_payment?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          booking_settings?: Json
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          color?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          location_type?: Database["public"]["Enums"]["appointment_location_type"]
          name?: string
          price?: number
          requires_payment?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "appointment_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_type_id: string | null
          assigned_user_id: string | null
          client_id: string | null
          client_notes: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          engagement_id: string | null
          external_calendar_id: string | null
          external_event_id: string | null
          id: string
          internal_notes: string | null
          lead_id: string | null
          location_text: string | null
          location_type: Database["public"]["Enums"]["appointment_location_type"]
          meeting_url: string | null
          reminder_settings: Json
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          timezone: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          appointment_type_id?: string | null
          assigned_user_id?: string | null
          client_id?: string | null
          client_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          engagement_id?: string | null
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          internal_notes?: string | null
          lead_id?: string | null
          location_text?: string | null
          location_type?: Database["public"]["Enums"]["appointment_location_type"]
          meeting_url?: string | null
          reminder_settings?: Json
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          timezone?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          appointment_type_id?: string | null
          assigned_user_id?: string | null
          client_id?: string | null
          client_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          engagement_id?: string | null
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          internal_notes?: string | null
          lead_id?: string | null
          location_text?: string | null
          location_type?: Database["public"]["Enums"]["appointment_location_type"]
          meeting_url?: string | null
          reminder_settings?: Json
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          timezone?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_appointment_type_id_fkey"
            columns: ["appointment_type_id"]
            isOneToOne: false
            referencedRelation: "appointment_types"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          request_id: string | null
          user_agent: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          request_id?: string | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          request_id?: string | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          failed_at: string | null
          id: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          scheduled_for: string
          status: Database["public"]["Enums"]["automation_job_status"]
          updated_at: string
          workflow_run_id: string | null
          workflow_run_step_id: string | null
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          failed_at?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          scheduled_for?: string
          status?: Database["public"]["Enums"]["automation_job_status"]
          updated_at?: string
          workflow_run_id?: string | null
          workflow_run_step_id?: string | null
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          failed_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          scheduled_for?: string
          status?: Database["public"]["Enums"]["automation_job_status"]
          updated_at?: string
          workflow_run_id?: string | null
          workflow_run_step_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_jobs_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_jobs_workflow_run_step_id_fkey"
            columns: ["workflow_run_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_run_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "automation_jobs_workspace_id_fkey"
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
          country: string
          created_at: string
          id: string
          is_primary: boolean
          line1: string | null
          line2: string | null
          postal_code: string | null
          state: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          workspace_id: string
        }
        Insert: {
          address_type?: string
          city?: string | null
          client_id: string
          country?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          line1?: string | null
          line2?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          workspace_id: string
        }
        Update: {
          address_type?: string
          city?: string | null
          client_id?: string
          country?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          line1?: string | null
          line2?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          workspace_id?: string
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
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      client_communication_preferences: {
        Row: {
          client_id: string
          created_at: string
          email_consent: boolean
          email_consented_at: string | null
          email_suppressed: boolean
          id: string
          invalid_email: boolean
          invalid_phone: boolean
          preferred_contact_method: string | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          sms_consent: boolean
          sms_consent_source: string | null
          sms_consented_at: string | null
          sms_suppressed: boolean
          timezone: string
          unsubscribe_reason: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email_consent?: boolean
          email_consented_at?: string | null
          email_suppressed?: boolean
          id?: string
          invalid_email?: boolean
          invalid_phone?: boolean
          preferred_contact_method?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sms_consent?: boolean
          sms_consent_source?: string | null
          sms_consented_at?: string | null
          sms_suppressed?: boolean
          timezone?: string
          unsubscribe_reason?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email_consent?: boolean
          email_consented_at?: string | null
          email_suppressed?: boolean
          id?: string
          invalid_email?: boolean
          invalid_phone?: boolean
          preferred_contact_method?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sms_consent?: boolean
          sms_consent_source?: string | null
          sms_consented_at?: string | null
          sms_suppressed?: boolean
          timezone?: string
          unsubscribe_reason?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_communication_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_communication_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "client_communication_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          auth_user_id: string | null
          can_access_portal: boolean
          can_receive_email: boolean
          can_receive_sms: boolean
          city: string | null
          client_id: string
          contact_type: Database["public"]["Enums"]["contact_type"]
          country: string
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          label: string | null
          last_name: string | null
          metadata: Json
          phone: string | null
          phone_extension: string | null
          postal_code: string | null
          state: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          auth_user_id?: string | null
          can_access_portal?: boolean
          can_receive_email?: boolean
          can_receive_sms?: boolean
          city?: string | null
          client_id: string
          contact_type?: Database["public"]["Enums"]["contact_type"]
          country?: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          label?: string | null
          last_name?: string | null
          metadata?: Json
          phone?: string | null
          phone_extension?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          auth_user_id?: string | null
          can_access_portal?: boolean
          can_receive_email?: boolean
          can_receive_sms?: boolean
          city?: string | null
          client_id?: string
          contact_type?: Database["public"]["Enums"]["contact_type"]
          country?: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          label?: string | null
          last_name?: string | null
          metadata?: Json
          phone?: string | null
          phone_extension?: string | null
          postal_code?: string | null
          state?: string | null
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
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      client_form_assignments: {
        Row: {
          assigned_at: string | null
          assignment_status: string
          change_request_message: string | null
          changed_requested_at: string | null
          client_id: string
          client_message: string | null
          created_at: string | null
          due_date: string | null
          id: string
          internal_notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          service_id: string | null
          started_at: string | null
          submitted_at: string | null
          template_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assignment_status?: string
          change_request_message?: string | null
          changed_requested_at?: string | null
          client_id: string
          client_message?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          internal_notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          service_id?: string | null
          started_at?: string | null
          submitted_at?: string | null
          template_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assignment_status?: string
          change_request_message?: string | null
          changed_requested_at?: string | null
          client_id?: string
          client_message?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          internal_notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          service_id?: string | null
          started_at?: string | null
          submitted_at?: string | null
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_form_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "v_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ownerships: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_current: boolean
          notes: string | null
          owner_user_id: string | null
          ownership_type: Database["public"]["Enums"]["ownership_type"]
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          owner_user_id?: string | null
          ownership_type?: Database["public"]["Enums"]["ownership_type"]
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          owner_user_id?: string | null
          ownership_type?: Database["public"]["Enums"]["ownership_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ownerships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ownerships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "client_ownerships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archived_at: string | null
          assigned_user_id: string | null
          client_type: Database["public"]["Enums"]["client_type"]
          company: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          display_name: string | null
          ein_last4: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          metadata: Json
          notes: string | null
          owner_user_id: string | null
          owner_workspace_id: string | null
          phone: string | null
          portal_status: string
          portal_user_id: string | null
          preferred_contact_method:
            | Database["public"]["Enums"]["contact_method"]
            | null
          preferred_language: string
          preferred_name: string | null
          source: string | null
          ssn_last4: string | null
          status: string
          timezone: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          assigned_user_id?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          ein_last4?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          metadata?: Json
          notes?: string | null
          owner_user_id?: string | null
          owner_workspace_id?: string | null
          phone?: string | null
          portal_status?: string
          portal_user_id?: string | null
          preferred_contact_method?:
            | Database["public"]["Enums"]["contact_method"]
            | null
          preferred_language?: string
          preferred_name?: string | null
          source?: string | null
          ssn_last4?: string | null
          status?: string
          timezone?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          assigned_user_id?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          ein_last4?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          metadata?: Json
          notes?: string | null
          owner_user_id?: string | null
          owner_workspace_id?: string | null
          phone?: string | null
          portal_status?: string
          portal_user_id?: string | null
          preferred_contact_method?:
            | Database["public"]["Enums"]["contact_method"]
            | null
          preferred_language?: string
          preferred_name?: string | null
          source?: string | null
          ssn_last4?: string | null
          status?: string
          timezone?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_owner_workspace_id_fkey"
            columns: ["owner_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "clients_owner_workspace_id_fkey"
            columns: ["owner_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      communication_events: {
        Row: {
          created_at: string
          event_at: string
          event_type: string
          id: number
          outbox_id: string | null
          payload: Json
          provider: Database["public"]["Enums"]["integration_provider"] | null
          provider_message_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_at?: string
          event_type: string
          id?: never
          outbox_id?: string | null
          payload?: Json
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          provider_message_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_at?: string
          event_type?: string
          id?: never
          outbox_id?: string | null
          payload?: Json
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          provider_message_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_events_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "communication_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "communication_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_outbox: {
        Row: {
          attempt_count: number
          body_html: string | null
          body_text: string | null
          channel: Database["public"]["Enums"]["outbox_channel"]
          client_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          engagement_id: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          max_attempts: number
          metadata: Json
          provider: Database["public"]["Enums"]["integration_provider"] | null
          provider_message_id: string | null
          recipient_address: string
          recipient_user_id: string | null
          scheduled_for: string
          sender_address: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          subject: string | null
          template_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          body_html?: string | null
          body_text?: string | null
          channel: Database["public"]["Enums"]["outbox_channel"]
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          engagement_id?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          max_attempts?: number
          metadata?: Json
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          provider_message_id?: string | null
          recipient_address: string
          recipient_user_id?: string | null
          scheduled_for?: string
          sender_address?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          subject?: string | null
          template_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          body_html?: string | null
          body_text?: string | null
          channel?: Database["public"]["Enums"]["outbox_channel"]
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          engagement_id?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          max_attempts?: number
          metadata?: Json
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          provider_message_id?: string | null
          recipient_address?: string
          recipient_user_id?: string | null
          scheduled_for?: string
          sender_address?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          subject?: string | null
          template_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_outbox_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_outbox_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_outbox_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_outbox_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_outbox_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "communication_outbox_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_cases: {
        Row: {
          assigned_to_user_id: string | null
          case_type: Database["public"]["Enums"]["compliance_case_type"]
          client_id: string
          created_at: string
          description: string | null
          due_at: string | null
          engagement_id: string | null
          id: string
          intake_submission_id: string | null
          metadata: Json
          opened_at: string
          opened_by: string | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          status: Database["public"]["Enums"]["compliance_case_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          case_type: Database["public"]["Enums"]["compliance_case_type"]
          client_id: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          engagement_id?: string | null
          id?: string
          intake_submission_id?: string | null
          metadata?: Json
          opened_at?: string
          opened_by?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          status?: Database["public"]["Enums"]["compliance_case_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to_user_id?: string | null
          case_type?: Database["public"]["Enums"]["compliance_case_type"]
          client_id?: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          engagement_id?: string | null
          id?: string
          intake_submission_id?: string | null
          metadata?: Json
          opened_at?: string
          opened_by?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          status?: Database["public"]["Enums"]["compliance_case_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_cases_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_cases_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_cases_intake_submission_id_fkey"
            columns: ["intake_submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "compliance_cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_checklist_items: {
        Row: {
          checklist_id: string
          created_at: string
          description: string | null
          evidence_document_id: string | null
          id: string
          is_required: boolean
          item_key: string
          label: string
          notes: string | null
          result: Database["public"]["Enums"]["review_result"]
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          description?: string | null
          evidence_document_id?: string | null
          id?: string
          is_required?: boolean
          item_key: string
          label: string
          notes?: string | null
          result?: Database["public"]["Enums"]["review_result"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          description?: string | null
          evidence_document_id?: string | null
          id?: string
          is_required?: boolean
          item_key?: string
          label?: string
          notes?: string | null
          result?: Database["public"]["Enums"]["review_result"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "compliance_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checklist_items_evidence_document_id_fkey"
            columns: ["evidence_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checklist_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "compliance_checklist_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_checklists: {
        Row: {
          assigned_to_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          compliance_case_id: string
          created_at: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["review_result"]
          template_id: string | null
          template_version_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          compliance_case_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["review_result"]
          template_id?: string | null
          template_version_id?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          compliance_case_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["review_result"]
          template_id?: string | null
          template_version_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checklists_compliance_case_id_fkey"
            columns: ["compliance_case_id"]
            isOneToOne: false
            referencedRelation: "compliance_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checklists_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checklists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "compliance_checklists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_flags: {
        Row: {
          compliance_case_id: string | null
          created_at: string
          explanation: string | null
          field_key: string | null
          flag_code: string
          id: string
          intake_submission_id: string | null
          is_resolved: boolean
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          source: string
          title: string
          workspace_id: string
        }
        Insert: {
          compliance_case_id?: string | null
          created_at?: string
          explanation?: string | null
          field_key?: string | null
          flag_code: string
          id?: string
          intake_submission_id?: string | null
          is_resolved?: boolean
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          source?: string
          title: string
          workspace_id: string
        }
        Update: {
          compliance_case_id?: string | null
          created_at?: string
          explanation?: string | null
          field_key?: string | null
          flag_code?: string
          id?: string
          intake_submission_id?: string | null
          is_resolved?: boolean
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          source?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_flags_compliance_case_id_fkey"
            columns: ["compliance_case_id"]
            isOneToOne: false
            referencedRelation: "compliance_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_flags_intake_submission_id_fkey"
            columns: ["intake_submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_flags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "compliance_flags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          subject: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          subject?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          subject?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_logs: {
        Row: {
          action: Database["public"]["Enums"]["document_access_action"]
          actor_client_contact_id: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          document_id: string | null
          id: number
          ip_address: unknown
          request_id: string | null
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["document_access_action"]
          actor_client_contact_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          document_id?: string | null
          id?: never
          ip_address?: unknown
          request_id?: string | null
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["document_access_action"]
          actor_client_contact_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          document_id?: string | null
          id?: never
          ip_address?: unknown
          request_id?: string | null
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_logs_actor_client_contact_id_fkey"
            columns: ["actor_client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "document_access_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_categories: {
        Row: {
          applies_to: string[]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          metadata: Json
          name: string
          parent_category_id: string | null
          slug: string
          sort_order: number
          tax_document_code: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          applies_to?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          metadata?: Json
          name: string
          parent_category_id?: string | null
          slug: string
          sort_order?: number
          tax_document_code?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          applies_to?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          metadata?: Json
          name?: string
          parent_category_id?: string | null
          slug?: string
          sort_order?: number
          tax_document_code?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "document_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_links: {
        Row: {
          created_at: string
          document_id: string
          entity_id: string
          entity_type: string
          id: string
          linked_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          entity_id: string
          entity_type: string
          id?: string
          linked_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          entity_id?: string
          entity_type?: string
          id?: string
          linked_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "document_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_request_items: {
        Row: {
          accepted_file_count: number
          allowed_mime_types: string[]
          category_id: string | null
          completed_at: string | null
          created_at: string
          custom_label: string | null
          description: string | null
          document_label: string
          id: string
          is_required: boolean
          maximum_files: number | null
          metadata: Json
          minimum_files: number
          request_id: string
          sort_order: number
          status: Database["public"]["Enums"]["document_request_item_status"]
          tax_year: number | null
          updated_at: string
          uploaded_file_count: number
          waived_by: string | null
          waiver_reason: string | null
          workspace_id: string
        }
        Insert: {
          accepted_file_count?: number
          allowed_mime_types?: string[]
          category_id?: string | null
          completed_at?: string | null
          created_at?: string
          custom_label?: string | null
          description?: string | null
          document_label: string
          id?: string
          is_required?: boolean
          maximum_files?: number | null
          metadata?: Json
          minimum_files?: number
          request_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["document_request_item_status"]
          tax_year?: number | null
          updated_at?: string
          uploaded_file_count?: number
          waived_by?: string | null
          waiver_reason?: string | null
          workspace_id: string
        }
        Update: {
          accepted_file_count?: number
          allowed_mime_types?: string[]
          category_id?: string | null
          completed_at?: string | null
          created_at?: string
          custom_label?: string | null
          description?: string | null
          document_label?: string
          id?: string
          is_required?: boolean
          maximum_files?: number | null
          metadata?: Json
          minimum_files?: number
          request_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["document_request_item_status"]
          tax_year?: number | null
          updated_at?: string
          uploaded_file_count?: number
          waived_by?: string | null
          waiver_reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_request_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "v_missing_document_aging"
            referencedColumns: ["document_request_id"]
          },
          {
            foreignKeyName: "document_request_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "document_request_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_request_template_items: {
        Row: {
          allowed_mime_types: string[]
          category_id: string | null
          created_at: string
          custom_label: string | null
          description: string | null
          document_label: string
          id: string
          is_required: boolean
          maximum_files: number | null
          minimum_files: number
          request_template_id: string
          settings: Json
          sort_order: number
        }
        Insert: {
          allowed_mime_types?: string[]
          category_id?: string | null
          created_at?: string
          custom_label?: string | null
          description?: string | null
          document_label: string
          id?: string
          is_required?: boolean
          maximum_files?: number | null
          minimum_files?: number
          request_template_id: string
          settings?: Json
          sort_order?: number
        }
        Update: {
          allowed_mime_types?: string[]
          category_id?: string | null
          created_at?: string
          custom_label?: string | null
          description?: string | null
          document_label?: string
          id?: string
          is_required?: boolean
          maximum_files?: number | null
          minimum_files?: number
          request_template_id?: string
          settings?: Json
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_request_template_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_request_template_items_request_template_id_fkey"
            columns: ["request_template_id"]
            isOneToOne: false
            referencedRelation: "document_request_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_request_templates: {
        Row: {
          created_at: string
          default_client_message: string | null
          default_due_days: number | null
          id: string
          settings: Json
          template_id: string
          template_version_id: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          default_client_message?: string | null
          default_due_days?: number | null
          id?: string
          settings?: Json
          template_id: string
          template_version_id: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          default_client_message?: string | null
          default_due_days?: number | null
          id?: string
          settings?: Json
          template_id?: string
          template_version_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_request_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: true
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_request_templates_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_request_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
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
          assigned_to_user_id: string | null
          client_id: string
          client_message: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          engagement_id: string | null
          expires_at: string | null
          id: string
          internal_notes: string | null
          metadata: Json
          reminder_settings: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["document_request_status"]
          template_id: string | null
          template_version_id: string | null
          title: string
          updated_at: string
          viewed_at: string | null
          workspace_id: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          client_id: string
          client_message?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          engagement_id?: string | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          metadata?: Json
          reminder_settings?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["document_request_status"]
          template_id?: string | null
          template_version_id?: string | null
          title: string
          updated_at?: string
          viewed_at?: string | null
          workspace_id: string
        }
        Update: {
          assigned_to_user_id?: string | null
          client_id?: string
          client_message?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          engagement_id?: string | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          metadata?: Json
          reminder_settings?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["document_request_status"]
          template_id?: string | null
          template_version_id?: string | null
          title?: string
          updated_at?: string
          viewed_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      document_reviews: {
        Row: {
          client_message: string | null
          created_at: string
          document_id: string
          id: string
          internal_notes: string | null
          metadata: Json
          reason_code: string | null
          request_item_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["document_review_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_message?: string | null
          created_at?: string
          document_id: string
          id?: string
          internal_notes?: string | null
          metadata?: Json
          reason_code?: string | null
          request_item_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["document_review_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_message?: string | null
          created_at?: string
          document_id?: string
          id?: string
          internal_notes?: string | null
          metadata?: Json
          reason_code?: string | null
          request_item_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["document_review_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reviews_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "document_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "document_reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          bucket_id: string
          category_id: string | null
          checksum_sha256: string | null
          client_id: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          document_date: string | null
          engagement_id: string | null
          file_extension: string | null
          file_size_bytes: number | null
          household_member_id: string | null
          id: string
          is_latest_version: boolean
          metadata: Json
          mime_type: string | null
          notes: string | null
          original_filename: string
          replaces_document_id: string | null
          request_item_id: string | null
          source: Database["public"]["Enums"]["document_source"]
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string
          tax_year: number | null
          updated_at: string
          uploaded_at: string
          uploaded_by_client_contact_id: string | null
          uploaded_by_user_id: string | null
          version_number: number
          visibility: Database["public"]["Enums"]["document_visibility"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          bucket_id: string
          category_id?: string | null
          checksum_sha256?: string | null
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          document_date?: string | null
          engagement_id?: string | null
          file_extension?: string | null
          file_size_bytes?: number | null
          household_member_id?: string | null
          id?: string
          is_latest_version?: boolean
          metadata?: Json
          mime_type?: string | null
          notes?: string | null
          original_filename: string
          replaces_document_id?: string | null
          request_item_id?: string | null
          source?: Database["public"]["Enums"]["document_source"]
          status?: Database["public"]["Enums"]["document_status"]
          storage_path: string
          tax_year?: number | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by_client_contact_id?: string | null
          uploaded_by_user_id?: string | null
          version_number?: number
          visibility?: Database["public"]["Enums"]["document_visibility"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string
          category_id?: string | null
          checksum_sha256?: string | null
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          document_date?: string | null
          engagement_id?: string | null
          file_extension?: string | null
          file_size_bytes?: number | null
          household_member_id?: string | null
          id?: string
          is_latest_version?: boolean
          metadata?: Json
          mime_type?: string | null
          notes?: string | null
          original_filename?: string
          replaces_document_id?: string | null
          request_item_id?: string | null
          source?: Database["public"]["Enums"]["document_source"]
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string
          tax_year?: number | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by_client_contact_id?: string | null
          uploaded_by_user_id?: string | null
          version_number?: number
          visibility?: Database["public"]["Enums"]["document_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_household_member_id_fkey"
            columns: ["household_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_replaces_document_id_fkey"
            columns: ["replaces_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "document_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_client_contact_id_fkey"
            columns: ["uploaded_by_client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efile_events: {
        Row: {
          acknowledgment_code: string | null
          created_at: string
          created_by: string | null
          engagement_id: string
          event_type: Database["public"]["Enums"]["efile_event_type"]
          external_submission_id: string | null
          id: number
          occurred_at: string
          payload: Json
          rejection_code: string | null
          rejection_message: string | null
          workspace_id: string
        }
        Insert: {
          acknowledgment_code?: string | null
          created_at?: string
          created_by?: string | null
          engagement_id: string
          event_type: Database["public"]["Enums"]["efile_event_type"]
          external_submission_id?: string | null
          id?: never
          occurred_at?: string
          payload?: Json
          rejection_code?: string | null
          rejection_message?: string | null
          workspace_id: string
        }
        Update: {
          acknowledgment_code?: string | null
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          event_type?: Database["public"]["Enums"]["efile_event_type"]
          external_submission_id?: string | null
          id?: never
          occurred_at?: string
          payload?: Json
          rejection_code?: string | null
          rejection_message?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efile_events_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efile_events_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efile_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "efile_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignment_role: Database["public"]["Enums"]["membership_role"]
          ended_at: string | null
          engagement_id: string
          id: string
          is_primary: boolean
          removed_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_role: Database["public"]["Enums"]["membership_role"]
          ended_at?: string | null
          engagement_id: string
          id?: string
          is_primary?: boolean
          removed_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_role?: Database["public"]["Enums"]["membership_role"]
          ended_at?: string | null
          engagement_id?: string
          id?: string
          is_primary?: boolean
          removed_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_assignments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_assignments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "engagement_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_letters: {
        Row: {
          accepted_at: string | null
          body_html: string
          client_id: string
          created_at: string
          created_by: string | null
          engagement_id: string | null
          expires_at: string | null
          id: string
          sent_at: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          body_html: string
          client_id: string
          created_at?: string
          created_by?: string | null
          engagement_id?: string | null
          expires_at?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          body_html?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          engagement_id?: string | null
          expires_at?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_letters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_letters_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_letters_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_letters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_letters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "engagement_letters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_notes: {
        Row: {
          author_user_id: string | null
          body: string
          created_at: string
          engagement_id: string
          id: string
          is_client_visible: boolean
          is_pinned: boolean
          note_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          created_at?: string
          engagement_id: string
          id?: string
          is_client_visible?: boolean
          is_pinned?: boolean
          note_type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          created_at?: string
          engagement_id?: string
          id?: string
          is_client_visible?: boolean
          is_pinned?: boolean
          note_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_notes_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_notes_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "engagement_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_reference_sequences: {
        Row: {
          last_number: number
          tax_year: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          last_number?: number
          tax_year: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          last_number?: number
          tax_year?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_reference_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "engagement_reference_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_shares: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"]
          allowed_modules: string[]
          can_reshare: boolean
          created_at: string
          engagement_id: string
          expires_at: string | null
          id: string
          owner_workspace_id: string
          revoked_at: string | null
          shared_by: string | null
          shared_with_workspace_id: string
          starts_at: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"]
          allowed_modules?: string[]
          can_reshare?: boolean
          created_at?: string
          engagement_id: string
          expires_at?: string | null
          id?: string
          owner_workspace_id: string
          revoked_at?: string | null
          shared_by?: string | null
          shared_with_workspace_id: string
          starts_at?: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"]
          allowed_modules?: string[]
          can_reshare?: boolean
          created_at?: string
          engagement_id?: string
          expires_at?: string | null
          id?: string
          owner_workspace_id?: string
          revoked_at?: string | null
          shared_by?: string | null
          shared_with_workspace_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_shares_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_shares_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_shares_owner_workspace_id_fkey"
            columns: ["owner_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "engagement_shares_owner_workspace_id_fkey"
            columns: ["owner_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_shares_shared_with_workspace_id_fkey"
            columns: ["shared_with_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "engagement_shares_shared_with_workspace_id_fkey"
            columns: ["shared_with_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_status_history: {
        Row: {
          activity_type: string
          changed_at: string
          changed_by: string | null
          description: string | null
          engagement_id: string
          from_status: Database["public"]["Enums"]["engagement_status"] | null
          id: number
          metadata: Json
          new_value: string | null
          notes: string | null
          old_value: string | null
          reason: string | null
          status_source: string
          to_status: Database["public"]["Enums"]["engagement_status"] | null
          workspace_id: string
        }
        Insert: {
          activity_type?: string
          changed_at?: string
          changed_by?: string | null
          description?: string | null
          engagement_id: string
          from_status?: Database["public"]["Enums"]["engagement_status"] | null
          id?: never
          metadata?: Json
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          reason?: string | null
          status_source?: string
          to_status?: Database["public"]["Enums"]["engagement_status"] | null
          workspace_id: string
        }
        Update: {
          activity_type?: string
          changed_at?: string
          changed_by?: string | null
          description?: string | null
          engagement_id?: string
          from_status?: Database["public"]["Enums"]["engagement_status"] | null
          id?: never
          metadata?: Json
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          reason?: string | null
          status_source?: string
          to_status?: Database["public"]["Enums"]["engagement_status"] | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_status_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_status_history_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_status_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "engagement_status_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ero_office_profiles: {
        Row: {
          created_at: string
          efin_last4: string | null
          external_tax_software: string | null
          filing_mode: string
          metadata: Json
          principal_name: string | null
          responsible_official_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          efin_last4?: string | null
          external_tax_software?: string | null
          filing_mode?: string
          metadata?: Json
          principal_name?: string | null
          responsible_official_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          efin_last4?: string | null
          external_tax_software?: string | null
          filing_mode?: string
          metadata?: Json
          principal_name?: string | null
          responsible_official_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ero_office_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ero_office_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      form_calculations: {
        Row: {
          created_at: string
          expression: string
          id: string
          referenced_field_keys: string[]
          rounding_scale: number | null
          settings: Json
          target_field_id: string
          template_version_id: string
        }
        Insert: {
          created_at?: string
          expression: string
          id?: string
          referenced_field_keys?: string[]
          rounding_scale?: number | null
          settings?: Json
          target_field_id: string
          template_version_id: string
        }
        Update: {
          created_at?: string
          expression?: string
          id?: string
          referenced_field_keys?: string[]
          rounding_scale?: number | null
          settings?: Json
          target_field_id?: string
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_calculations_target_field_id_fkey"
            columns: ["target_field_id"]
            isOneToOne: true
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_calculations_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_conditions: {
        Row: {
          action: string
          comparison_value: Json | null
          created_at: string
          id: string
          logical_group: string
          operator: Database["public"]["Enums"]["condition_operator"]
          sort_order: number
          source_field_id: string
          target_field_id: string | null
          target_section_id: string | null
          template_version_id: string
        }
        Insert: {
          action?: string
          comparison_value?: Json | null
          created_at?: string
          id?: string
          logical_group?: string
          operator: Database["public"]["Enums"]["condition_operator"]
          sort_order?: number
          source_field_id: string
          target_field_id?: string | null
          target_section_id?: string | null
          template_version_id: string
        }
        Update: {
          action?: string
          comparison_value?: Json | null
          created_at?: string
          id?: string
          logical_group?: string
          operator?: Database["public"]["Enums"]["condition_operator"]
          sort_order?: number
          source_field_id?: string
          target_field_id?: string | null
          target_section_id?: string | null
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_conditions_source_field_id_fkey"
            columns: ["source_field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_conditions_target_field_id_fkey"
            columns: ["target_field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_conditions_target_section_id_fkey"
            columns: ["target_section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_conditions_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          component_type: Database["public"]["Enums"]["form_component_type"]
          created_at: string
          default_value: Json | null
          description: string | null
          field_key: string
          help_text: string | null
          id: string
          is_locked: boolean
          is_required: boolean
          is_staff_only: boolean
          label: string | null
          options: Json
          placeholder: string | null
          section_id: string | null
          settings: Json
          sort_order: number
          template_version_id: string
          updated_at: string
          validation: Json
        }
        Insert: {
          component_type: Database["public"]["Enums"]["form_component_type"]
          created_at?: string
          default_value?: Json | null
          description?: string | null
          field_key: string
          help_text?: string | null
          id?: string
          is_locked?: boolean
          is_required?: boolean
          is_staff_only?: boolean
          label?: string | null
          options?: Json
          placeholder?: string | null
          section_id?: string | null
          settings?: Json
          sort_order?: number
          template_version_id: string
          updated_at?: string
          validation?: Json
        }
        Update: {
          component_type?: Database["public"]["Enums"]["form_component_type"]
          created_at?: string
          default_value?: Json | null
          description?: string | null
          field_key?: string
          help_text?: string | null
          id?: string
          is_locked?: boolean
          is_required?: boolean
          is_staff_only?: boolean
          label?: string | null
          options?: Json
          placeholder?: string | null
          section_id?: string | null
          settings?: Json
          sort_order?: number
          template_version_id?: string
          updated_at?: string
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_fields_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_questions: {
        Row: {
          component_type:
            | Database["public"]["Enums"]["form_component_type"]
            | null
          created_at: string | null
          field_key: string | null
          help_text: string | null
          id: string
          is_locked: boolean
          is_required: boolean
          is_staff_only: boolean
          label: string
          options: Json | null
          question_type: string
          section_id: string | null
          settings: Json
          sort_order: number
          template_id: string
          updated_at: string | null
          validation: Json
        }
        Insert: {
          component_type?:
            | Database["public"]["Enums"]["form_component_type"]
            | null
          created_at?: string | null
          field_key?: string | null
          help_text?: string | null
          id?: string
          is_locked?: boolean
          is_required?: boolean
          is_staff_only?: boolean
          label: string
          options?: Json | null
          question_type?: string
          section_id?: string | null
          settings?: Json
          sort_order?: number
          template_id: string
          updated_at?: string | null
          validation?: Json
        }
        Update: {
          component_type?:
            | Database["public"]["Enums"]["form_component_type"]
            | null
          created_at?: string | null
          field_key?: string | null
          help_text?: string | null
          id?: string
          is_locked?: boolean
          is_required?: boolean
          is_staff_only?: boolean
          label?: string
          options?: Json | null
          question_type?: string
          section_id?: string | null
          settings?: Json
          sort_order?: number
          template_id?: string
          updated_at?: string | null
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "v_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_response_answers: {
        Row: {
          answer_json: Json | null
          answer_text: string | null
          answered_at: string | null
          assignment_id: string
          id: string
          question_id: string
          updated_at: string | null
        }
        Insert: {
          answer_json?: Json | null
          answer_text?: string | null
          answered_at?: string | null
          assignment_id: string
          id?: string
          question_id: string
          updated_at?: string | null
        }
        Update: {
          answer_json?: Json | null
          answer_text?: string | null
          answered_at?: string | null
          assignment_id?: string
          id?: string
          question_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_response_answers_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "client_form_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_answers_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_client_form_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_answers_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_client_portal_forms"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "form_response_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_locked: boolean
          is_repeatable: boolean
          max_repetitions: number | null
          min_repetitions: number | null
          parent_section_id: string | null
          section_key: string
          settings: Json
          sort_order: number
          template_version_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean
          is_repeatable?: boolean
          max_repetitions?: number | null
          min_repetitions?: number | null
          parent_section_id?: string | null
          section_key: string
          settings?: Json
          sort_order?: number
          template_version_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean
          is_repeatable?: boolean
          max_repetitions?: number | null
          min_repetitions?: number | null
          parent_section_id?: string | null
          section_key?: string
          settings?: Json
          sort_order?: number
          template_version_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_sections_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_sections_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          active_version_id: string | null
          archived_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system_template: boolean
          metadata: Json
          template_category: string
          template_name: string
          template_record_id: string | null
          updated_at: string | null
          visibility: Database["public"]["Enums"]["template_visibility"]
          workspace_id: string
        }
        Insert: {
          active_version_id?: string | null
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          metadata?: Json
          template_category: string
          template_name: string
          template_record_id?: string | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["template_visibility"]
          workspace_id: string
        }
        Update: {
          active_version_id?: string | null
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          metadata?: Json
          template_category?: string
          template_name?: string
          template_record_id?: string | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["template_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_active_version_id_fkey"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_template_record_id_fkey"
            columns: ["template_record_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "form_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          childcare_provider_required: boolean
          client_id: string | null
          created_at: string
          date_of_birth: string | null
          driver_license_expires_on: string | null
          driver_license_last4: string | null
          driver_license_state: string | null
          email: string | null
          first_name: string
          household_id: string
          id: string
          identity_pin_last4: string | null
          is_dependent: boolean
          is_disabled: boolean | null
          is_primary_taxpayer: boolean
          is_spouse: boolean
          is_student: boolean | null
          last_name: string
          metadata: Json
          middle_name: string | null
          months_in_home: number | null
          occupation: string | null
          phone: string | null
          relationship: string
          sort_order: number
          ssn_last4: string | null
          suffix: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          childcare_provider_required?: boolean
          client_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          driver_license_expires_on?: string | null
          driver_license_last4?: string | null
          driver_license_state?: string | null
          email?: string | null
          first_name: string
          household_id: string
          id?: string
          identity_pin_last4?: string | null
          is_dependent?: boolean
          is_disabled?: boolean | null
          is_primary_taxpayer?: boolean
          is_spouse?: boolean
          is_student?: boolean | null
          last_name: string
          metadata?: Json
          middle_name?: string | null
          months_in_home?: number | null
          occupation?: string | null
          phone?: string | null
          relationship: string
          sort_order?: number
          ssn_last4?: string | null
          suffix?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          childcare_provider_required?: boolean
          client_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          driver_license_expires_on?: string | null
          driver_license_last4?: string | null
          driver_license_state?: string | null
          email?: string | null
          first_name?: string
          household_id?: string
          id?: string
          identity_pin_last4?: string | null
          is_dependent?: boolean
          is_disabled?: boolean | null
          is_primary_taxpayer?: boolean
          is_spouse?: boolean
          is_student?: boolean | null
          last_name?: string
          metadata?: Json
          middle_name?: string | null
          months_in_home?: number | null
          occupation?: string | null
          phone?: string | null
          relationship?: string
          sort_order?: number
          ssn_last4?: string | null
          suffix?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "tax_households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "household_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_answer_history: {
        Row: {
          answer_id: string | null
          change_reason: Database["public"]["Enums"]["intake_revision_reason"]
          changed_at: string
          changed_by: string | null
          field_id: string
          field_key: string
          id: string
          new_value: Json | null
          old_value: Json | null
          submission_id: string
          workspace_id: string
        }
        Insert: {
          answer_id?: string | null
          change_reason?: Database["public"]["Enums"]["intake_revision_reason"]
          changed_at?: string
          changed_by?: string | null
          field_id: string
          field_key: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          submission_id: string
          workspace_id: string
        }
        Update: {
          answer_id?: string | null
          change_reason?: Database["public"]["Enums"]["intake_revision_reason"]
          changed_at?: string
          changed_by?: string | null
          field_id?: string
          field_key?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          submission_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_answer_history_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "intake_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_answer_history_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_answer_history_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_answer_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_answer_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_answers: {
        Row: {
          answer_value: Json | null
          answered_at: string
          answered_by_client_contact_id: string | null
          answered_by_user_id: string | null
          clarification_message: string | null
          confirmed_by_client: boolean
          field_id: string
          field_key: string
          id: string
          is_staff_override: boolean
          rolled_forward: boolean
          source: string
          status: Database["public"]["Enums"]["intake_answer_status"]
          submission_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          workspace_id: string
        }
        Insert: {
          answer_value?: Json | null
          answered_at?: string
          answered_by_client_contact_id?: string | null
          answered_by_user_id?: string | null
          clarification_message?: string | null
          confirmed_by_client?: boolean
          field_id: string
          field_key: string
          id?: string
          is_staff_override?: boolean
          rolled_forward?: boolean
          source?: string
          status?: Database["public"]["Enums"]["intake_answer_status"]
          submission_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id: string
        }
        Update: {
          answer_value?: Json | null
          answered_at?: string
          answered_by_client_contact_id?: string | null
          answered_by_user_id?: string | null
          clarification_message?: string | null
          confirmed_by_client?: boolean
          field_id?: string
          field_key?: string
          id?: string
          is_staff_override?: boolean
          rolled_forward?: boolean
          source?: string
          status?: Database["public"]["Enums"]["intake_answer_status"]
          submission_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_answers_answered_by_client_contact_id_fkey"
            columns: ["answered_by_client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_answers_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_answers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_answers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_compliance_rules: {
        Row: {
          case_type: Database["public"]["Enums"]["compliance_case_type"]
          comparison_value: Json | null
          create_case: boolean
          created_at: string
          explanation: string | null
          flag_code: string
          id: string
          metadata: Json
          operator: Database["public"]["Enums"]["condition_operator"]
          priority: number
          risk_level: Database["public"]["Enums"]["risk_level"]
          source_field_key: string
          template_version_id: string
          title: string
        }
        Insert: {
          case_type: Database["public"]["Enums"]["compliance_case_type"]
          comparison_value?: Json | null
          create_case?: boolean
          created_at?: string
          explanation?: string | null
          flag_code: string
          id?: string
          metadata?: Json
          operator: Database["public"]["Enums"]["condition_operator"]
          priority?: number
          risk_level?: Database["public"]["Enums"]["risk_level"]
          source_field_key: string
          template_version_id: string
          title: string
        }
        Update: {
          case_type?: Database["public"]["Enums"]["compliance_case_type"]
          comparison_value?: Json | null
          create_case?: boolean
          created_at?: string
          explanation?: string | null
          flag_code?: string
          id?: string
          metadata?: Json
          operator?: Database["public"]["Enums"]["condition_operator"]
          priority?: number
          risk_level?: Database["public"]["Enums"]["risk_level"]
          source_field_key?: string
          template_version_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_compliance_rules_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_deductions_credits: {
        Row: {
          amount_estimate: number | null
          applies_to_person_id: string | null
          created_at: string
          details: Json
          document_id: string | null
          document_received: boolean
          id: string
          item_type: string
          submission_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_estimate?: number | null
          applies_to_person_id?: string | null
          created_at?: string
          details?: Json
          document_id?: string | null
          document_received?: boolean
          id?: string
          item_type: string
          submission_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_estimate?: number | null
          applies_to_person_id?: string | null
          created_at?: string
          details?: Json
          document_id?: string | null
          document_received?: boolean
          id?: string
          item_type?: string
          submission_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_deductions_credits_applies_to_person_id_fkey"
            columns: ["applies_to_person_id"]
            isOneToOne: false
            referencedRelation: "intake_household_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_deductions_credits_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_deductions_credits_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_deductions_credits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_deductions_credits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_document_rules: {
        Row: {
          category_slug: string | null
          comparison_value: Json | null
          created_at: string
          description: string | null
          document_label: string
          id: string
          is_required: boolean
          maximum_files: number | null
          metadata: Json
          minimum_files: number
          operator: Database["public"]["Enums"]["condition_operator"]
          priority: number
          source_field_key: string
          template_version_id: string
        }
        Insert: {
          category_slug?: string | null
          comparison_value?: Json | null
          created_at?: string
          description?: string | null
          document_label: string
          id?: string
          is_required?: boolean
          maximum_files?: number | null
          metadata?: Json
          minimum_files?: number
          operator: Database["public"]["Enums"]["condition_operator"]
          priority?: number
          source_field_key: string
          template_version_id: string
        }
        Update: {
          category_slug?: string | null
          comparison_value?: Json | null
          created_at?: string
          description?: string | null
          document_label?: string
          id?: string
          is_required?: boolean
          maximum_files?: number | null
          metadata?: Json
          minimum_files?: number
          operator?: Database["public"]["Enums"]["condition_operator"]
          priority?: number
          source_field_key?: string
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_document_rules_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_household_people: {
        Row: {
          confirmed_by_client: boolean
          created_at: string
          date_of_birth: string | null
          details: Json
          first_name: string | null
          household_member_id: string | null
          id: string
          identity_pin_last4: string | null
          is_disabled: boolean | null
          is_student: boolean | null
          last_name: string | null
          middle_name: string | null
          months_in_home: number | null
          occupation: string | null
          person_role: string
          relationship: string | null
          rolled_forward: boolean
          sort_order: number
          ssn_last4: string | null
          submission_id: string
          suffix: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          confirmed_by_client?: boolean
          created_at?: string
          date_of_birth?: string | null
          details?: Json
          first_name?: string | null
          household_member_id?: string | null
          id?: string
          identity_pin_last4?: string | null
          is_disabled?: boolean | null
          is_student?: boolean | null
          last_name?: string | null
          middle_name?: string | null
          months_in_home?: number | null
          occupation?: string | null
          person_role: string
          relationship?: string | null
          rolled_forward?: boolean
          sort_order?: number
          ssn_last4?: string | null
          submission_id: string
          suffix?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          confirmed_by_client?: boolean
          created_at?: string
          date_of_birth?: string | null
          details?: Json
          first_name?: string | null
          household_member_id?: string | null
          id?: string
          identity_pin_last4?: string | null
          is_disabled?: boolean | null
          is_student?: boolean | null
          last_name?: string | null
          middle_name?: string | null
          months_in_home?: number | null
          occupation?: string | null
          person_role?: string
          relationship?: string | null
          rolled_forward?: boolean
          sort_order?: number
          ssn_last4?: string | null
          submission_id?: string
          suffix?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_household_people_household_member_id_fkey"
            columns: ["household_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_household_people_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_household_people_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_household_people_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_income_sources: {
        Row: {
          amount_estimate: number | null
          created_at: string
          details: Json
          document_id: string | null
          document_received: boolean
          household_person_id: string | null
          id: string
          income_type: string
          payer_ein_last4: string | null
          payer_name: string | null
          submission_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_estimate?: number | null
          created_at?: string
          details?: Json
          document_id?: string | null
          document_received?: boolean
          household_person_id?: string | null
          id?: string
          income_type: string
          payer_ein_last4?: string | null
          payer_name?: string | null
          submission_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_estimate?: number | null
          created_at?: string
          details?: Json
          document_id?: string | null
          document_received?: boolean
          household_person_id?: string | null
          id?: string
          income_type?: string
          payer_ein_last4?: string | null
          payer_name?: string | null
          submission_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_income_sources_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_income_sources_household_person_id_fkey"
            columns: ["household_person_id"]
            isOneToOne: false
            referencedRelation: "intake_household_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_income_sources_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_income_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_income_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_repeatable_entities: {
        Row: {
          confirmed_by_client: boolean
          created_at: string
          created_by: string | null
          data: Json
          display_name: string | null
          entity_key: string | null
          entity_type: Database["public"]["Enums"]["intake_entity_type"]
          id: string
          is_complete: boolean
          person_id: string | null
          rolled_forward: boolean
          sort_order: number
          submission_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          confirmed_by_client?: boolean
          created_at?: string
          created_by?: string | null
          data?: Json
          display_name?: string | null
          entity_key?: string | null
          entity_type: Database["public"]["Enums"]["intake_entity_type"]
          id?: string
          is_complete?: boolean
          person_id?: string | null
          rolled_forward?: boolean
          sort_order?: number
          submission_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          confirmed_by_client?: boolean
          created_at?: string
          created_by?: string | null
          data?: Json
          display_name?: string | null
          entity_key?: string | null
          entity_type?: Database["public"]["Enums"]["intake_entity_type"]
          id?: string
          is_complete?: boolean
          person_id?: string | null
          rolled_forward?: boolean
          sort_order?: number
          submission_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_repeatable_entities_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "intake_household_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_repeatable_entities_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_repeatable_entities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_repeatable_entities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_review_actions: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          details: Json
          field_id: string | null
          id: string
          section_id: string | null
          submission_id: string
          workspace_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by?: string | null
          details?: Json
          field_id?: string | null
          id?: string
          section_id?: string | null
          submission_id: string
          workspace_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          details?: Json
          field_id?: string | null
          id?: string
          section_id?: string | null
          submission_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_review_actions_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_review_actions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_review_actions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_review_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_review_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_review_comments: {
        Row: {
          comment: string
          created_at: string
          created_by: string | null
          field_id: string | null
          id: string
          is_client_visible: boolean
          resolved_at: string | null
          resolved_by: string | null
          submission_id: string
          workspace_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          created_by?: string | null
          field_id?: string | null
          id?: string
          is_client_visible?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          submission_id: string
          workspace_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          created_by?: string | null
          field_id?: string | null
          id?: string
          is_client_visible?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          submission_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_review_comments_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_review_comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_review_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_review_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_review_sections: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          notes: string | null
          result: Database["public"]["Enums"]["review_result"]
          reviewed_at: string | null
          reviewed_by: string | null
          section_id: string
          submission_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          result?: Database["public"]["Enums"]["review_result"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id: string
          submission_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          result?: Database["public"]["Enums"]["review_result"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id?: string
          submission_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_review_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_review_sections_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_review_sections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_review_sections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_submission_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          reason: Database["public"]["Enums"]["intake_revision_reason"]
          reason_details: string | null
          revision_number: number
          snapshot: Json
          submission_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason: Database["public"]["Enums"]["intake_revision_reason"]
          reason_details?: string | null
          revision_number: number
          snapshot: Json
          submission_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["intake_revision_reason"]
          reason_details?: string | null
          revision_number?: number
          snapshot?: Json
          submission_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_submission_revisions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submission_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_submission_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_submissions: {
        Row: {
          adaptive_version: number
          approved_at: string | null
          assigned_at: string
          assigned_by: string | null
          change_request_message: string | null
          changes_requested_at: string | null
          client_certification: Json
          client_id: string
          created_at: string
          current_section_id: string | null
          due_date: string | null
          engagement_id: string | null
          household_id: string | null
          id: string
          last_saved_at: string | null
          locked_at: string | null
          locked_by: string | null
          metadata: Json
          progress_percent: number
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          review_summary: Json
          reviewed_at: string | null
          reviewed_by: string | null
          revision_number: number
          source_submission_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["intake_submission_status"]
          submitted_at: string | null
          tax_year: number | null
          template_id: string
          template_version_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          adaptive_version?: number
          approved_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          change_request_message?: string | null
          changes_requested_at?: string | null
          client_certification?: Json
          client_id: string
          created_at?: string
          current_section_id?: string | null
          due_date?: string | null
          engagement_id?: string | null
          household_id?: string | null
          id?: string
          last_saved_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          progress_percent?: number
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          review_summary?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_number?: number
          source_submission_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["intake_submission_status"]
          submitted_at?: string | null
          tax_year?: number | null
          template_id: string
          template_version_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          adaptive_version?: number
          approved_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          change_request_message?: string | null
          changes_requested_at?: string | null
          client_certification?: Json
          client_id?: string
          created_at?: string
          current_section_id?: string | null
          due_date?: string | null
          engagement_id?: string | null
          household_id?: string | null
          id?: string
          last_saved_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          progress_percent?: number
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          review_summary?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_number?: number
          source_submission_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["intake_submission_status"]
          submitted_at?: string | null
          tax_year?: number | null
          template_id?: string
          template_version_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_current_section_id_fkey"
            columns: ["current_section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "tax_households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_source_submission_id_fkey"
            columns: ["source_submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_validation_results: {
        Row: {
          code: string
          created_at: string
          field_id: string | null
          field_key: string | null
          id: string
          is_resolved: boolean
          message: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          submission_id: string
          workspace_id: string
        }
        Insert: {
          code: string
          created_at?: string
          field_id?: string | null
          field_key?: string | null
          id?: string
          is_resolved?: boolean
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          submission_id: string
          workspace_id: string
        }
        Update: {
          code?: string
          created_at?: string
          field_id?: string | null
          field_key?: string | null
          id?: string
          is_resolved?: boolean
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          submission_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_validation_results_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_validation_results_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intake_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_validation_results_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "intake_validation_results_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health_checks: {
        Row: {
          checked_at: string
          details: Json
          id: number
          provider: Database["public"]["Enums"]["integration_provider"]
          response_ms: number | null
          status: string
          workspace_id: string
        }
        Insert: {
          checked_at?: string
          details?: Json
          id?: never
          provider: Database["public"]["Enums"]["integration_provider"]
          response_ms?: number | null
          status: string
          workspace_id: string
        }
        Update: {
          checked_at?: string
          details?: Json
          id?: never
          provider?: Database["public"]["Enums"]["integration_provider"]
          response_ms?: number | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_health_checks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "integration_health_checks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          discount_amount: number
          id: string
          invoice_id: string
          line_total: number | null
          quantity: number
          service_id: string | null
          sort_order: number
          tax_amount: number
          unit_price: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          discount_amount?: number
          id?: string
          invoice_id: string
          line_total?: number | null
          quantity?: number
          service_id?: string | null
          sort_order?: number
          tax_amount?: number
          unit_price?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          discount_amount?: number
          id?: string
          invoice_id?: string
          line_total?: number | null
          quantity?: number
          service_id?: string | null
          sort_order?: number
          tax_amount?: number
          unit_price?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "invoice_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reference_sequences: {
        Row: {
          next_number: number
          prefix: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          next_number?: number
          prefix?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          next_number?: number
          prefix?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reference_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "invoice_reference_sequences_workspace_id_fkey"
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
          balance_due: number | null
          client_id: string
          client_message: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          due_date: string | null
          engagement_id: string | null
          external_invoice_id: string | null
          external_processor: string | null
          id: string
          internal_notes: string | null
          invoice_number: string
          issue_date: string
          metadata: Json
          paid_at: string | null
          payment_terms: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          viewed_at: string | null
          voided_at: string | null
          workspace_id: string
        }
        Insert: {
          amount_paid?: number
          balance_due?: number | null
          client_id: string
          client_message?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_date?: string | null
          engagement_id?: string | null
          external_invoice_id?: string | null
          external_processor?: string | null
          id?: string
          internal_notes?: string | null
          invoice_number: string
          issue_date?: string
          metadata?: Json
          paid_at?: string | null
          payment_terms?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
          workspace_id: string
        }
        Update: {
          amount_paid?: number
          balance_due?: number | null
          client_id?: string
          client_message?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_date?: string | null
          engagement_id?: string | null
          external_invoice_id?: string | null
          external_processor?: string | null
          id?: string
          internal_notes?: string | null
          invoice_number?: string
          issue_date?: string
          metadata?: Json
          paid_at?: string | null
          payment_terms?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
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
            foreignKeyName: "invoices_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      leads: {
        Row: {
          assigned_user_id: string | null
          company: string | null
          consultation_at: string | null
          converted_at: string | null
          converted_client_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          estimated_value: number
          first_name: string
          id: string
          last_name: string
          lost_reason: string | null
          metadata: Json
          notes: string | null
          phone: string | null
          referral_name: string | null
          service_interest: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_user_id?: string | null
          company?: string | null
          consultation_at?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_value?: number
          first_name: string
          id?: string
          last_name: string
          lost_reason?: string | null
          metadata?: Json
          notes?: string | null
          phone?: string | null
          referral_name?: string | null
          service_interest?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_user_id?: string | null
          company?: string | null
          consultation_at?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_value?: number
          first_name?: string
          id?: string
          last_name?: string
          lost_reason?: string | null
          metadata?: Json
          notes?: string | null
          phone?: string | null
          referral_name?: string | null
          service_interest?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_document_id: string | null
          body: string
          client_visible: boolean
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_type: string
          sender_user_id: string
          workspace_id: string
        }
        Insert: {
          attachment_document_id?: string | null
          body: string
          client_visible?: boolean
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_type: string
          sender_user_id: string
          workspace_id: string
        }
        Update: {
          attachment_document_id?: string | null
          body?: string
          client_visible?: boolean
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_type?: string
          sender_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_attachment_document_id_fkey"
            columns: ["attachment_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      notifications: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          is_read: boolean
          message: string | null
          title: string
          type: string
          workspace_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          title: string
          type: string
          workspace_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          title?: string
          type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
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
          engagement_id: string | null
          failure_reason: string | null
          id: string
          invoice_id: string | null
          metadata: Json
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string | null
          processor: string | null
          processor_payment_id: string | null
          recorded_by: string | null
          reference_number: string | null
          refunded_amount: number
          status: Database["public"]["Enums"]["payment_record_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          currency?: string
          engagement_id?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string | null
          processor?: string | null
          processor_payment_id?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_record_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          engagement_id?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string | null
          processor?: string | null
          processor_payment_id?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_record_status"]
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
            foreignKeyName: "payments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
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
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      portal_activity_logs: {
        Row: {
          action: string
          client_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          ip_address: unknown
          metadata: Json
          user_agent: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          client_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          client_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "portal_activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_profiles: {
        Row: {
          created_at: string
          credential_number_masked: string | null
          credential_type: string | null
          id: string
          is_ero: boolean
          legal_name: string | null
          metadata: Json
          profile_status: string
          ptin_expires_on: string | null
          ptin_last4: string | null
          states_served: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_number_masked?: string | null
          credential_type?: string | null
          id?: string
          is_ero?: boolean
          legal_name?: string | null
          metadata?: Json
          profile_status?: string
          ptin_expires_on?: string | null
          ptin_last4?: string | null
          states_served?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credential_number_masked?: string | null
          credential_type?: string | null
          id?: string
          is_ero?: boolean
          legal_name?: string | null
          metadata?: Json
          profile_status?: string
          ptin_expires_on?: string | null
          ptin_last4?: string | null
          states_served?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          appointment_id: string | null
          channel: Database["public"]["Enums"]["outbox_channel"]
          client_id: string | null
          created_at: string
          created_by: string | null
          document_request_id: string | null
          engagement_id: string | null
          error_message: string | null
          id: string
          invoice_id: string | null
          outbox_id: string | null
          payload: Json
          recipient_address: string | null
          reminder_type: string
          scheduled_for: string
          sent_at: string | null
          signature_request_id: string | null
          skipped_reason: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          template_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          appointment_id?: string | null
          channel: Database["public"]["Enums"]["outbox_channel"]
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          document_request_id?: string | null
          engagement_id?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          outbox_id?: string | null
          payload?: Json
          recipient_address?: string | null
          reminder_type: string
          scheduled_for: string
          sent_at?: string | null
          signature_request_id?: string | null
          skipped_reason?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          template_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          appointment_id?: string | null
          channel?: Database["public"]["Enums"]["outbox_channel"]
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          document_request_id?: string | null
          engagement_id?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          outbox_id?: string | null
          payload?: Json
          recipient_address?: string | null
          reminder_type?: string
          scheduled_for?: string
          sent_at?: string | null
          signature_request_id?: string | null
          skipped_reason?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          template_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_document_request_id_fkey"
            columns: ["document_request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_document_request_id_fkey"
            columns: ["document_request_id"]
            isOneToOne: false
            referencedRelation: "v_missing_document_aging"
            referencedColumns: ["document_request_id"]
          },
          {
            foreignKeyName: "reminders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "communication_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      return_release_controls: {
        Row: {
          created_at: string
          engagement_id: string
          id: string
          payment_satisfied_at: string | null
          release_notes: string | null
          released_at: string | null
          released_by: string | null
          require_payment: boolean
          require_review_approval: boolean
          require_signature: boolean
          review_satisfied_at: string | null
          signature_satisfied_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          engagement_id: string
          id?: string
          payment_satisfied_at?: string | null
          release_notes?: string | null
          released_at?: string | null
          released_by?: string | null
          require_payment?: boolean
          require_review_approval?: boolean
          require_signature?: boolean
          review_satisfied_at?: string | null
          signature_satisfied_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          engagement_id?: string
          id?: string
          payment_satisfied_at?: string | null
          release_notes?: string | null
          released_at?: string | null
          released_by?: string | null
          require_payment?: boolean
          require_review_approval?: boolean
          require_signature?: boolean
          review_satisfied_at?: string | null
          signature_satisfied_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_release_controls_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_release_controls_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_release_controls_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "return_release_controls_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      service_bureau_profiles: {
        Row: {
          created_at: string
          default_office_settings: Json
          support_email: string | null
          support_phone: string | null
          updated_at: string
          white_label_enabled: boolean
          workspace_id: string
        }
        Insert: {
          created_at?: string
          default_office_settings?: Json
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          white_label_enabled?: boolean
          workspace_id: string
        }
        Update: {
          created_at?: string
          default_office_settings?: Json
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          white_label_enabled?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_bureau_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "service_bureau_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          client_id: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      signature_access_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          signature_request_id: string
          signer_id: string
          token_hash: string
          used_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          signature_request_id: string
          signer_id: string
          token_hash: string
          used_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          signature_request_id?: string
          signer_id?: string
          token_hash?: string
          used_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_access_tokens_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_access_tokens_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "signature_signers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_access_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "signature_access_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_certificates: {
        Row: {
          certificate_document_id: string | null
          certificate_number: string
          completed_at: string
          created_at: string
          document_sha256: string | null
          evidence_summary: Json
          id: string
          signature_request_id: string
          signed_document_id: string | null
          signer_summary: Json
          workspace_id: string
        }
        Insert: {
          certificate_document_id?: string | null
          certificate_number: string
          completed_at: string
          created_at?: string
          document_sha256?: string | null
          evidence_summary?: Json
          id?: string
          signature_request_id: string
          signed_document_id?: string | null
          signer_summary?: Json
          workspace_id: string
        }
        Update: {
          certificate_document_id?: string | null
          certificate_number?: string
          completed_at?: string
          created_at?: string
          document_sha256?: string | null
          evidence_summary?: Json
          id?: string
          signature_request_id?: string
          signed_document_id?: string | null
          signer_summary?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_certificates_certificate_document_id_fkey"
            columns: ["certificate_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_certificates_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: true
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_certificates_signed_document_id_fkey"
            columns: ["signed_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_certificates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "signature_certificates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_events: {
        Row: {
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          event_at: string
          event_type: string
          evidence: Json
          id: number
          ip_address: unknown
          signature_request_id: string
          signer_id: string | null
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_at?: string
          event_type: string
          evidence?: Json
          id?: never
          ip_address?: unknown
          signature_request_id: string
          signer_id?: string | null
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_at?: string
          event_type?: string
          evidence?: Json
          id?: never
          ip_address?: unknown
          signature_request_id?: string
          signer_id?: string | null
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_events_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "signature_signers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "signature_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_requests: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          engagement_id: string | null
          engagement_letter_id: string | null
          expires_at: string | null
          external_provider: string | null
          external_request_id: string | null
          id: string
          message: string | null
          metadata: Json
          sent_at: string | null
          signing_order_required: boolean
          status: Database["public"]["Enums"]["signature_request_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          engagement_id?: string | null
          engagement_letter_id?: string | null
          expires_at?: string | null
          external_provider?: string | null
          external_request_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          sent_at?: string | null
          signing_order_required?: boolean
          status?: Database["public"]["Enums"]["signature_request_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          engagement_id?: string | null
          engagement_letter_id?: string | null
          expires_at?: string | null
          external_provider?: string | null
          external_request_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          sent_at?: string | null
          signing_order_required?: boolean
          status?: Database["public"]["Enums"]["signature_request_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_engagement_letter_id_fkey"
            columns: ["engagement_letter_id"]
            isOneToOne: false
            referencedRelation: "engagement_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      signature_signers: {
        Row: {
          client_contact_id: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          email: string
          id: string
          ip_address: unknown
          name: string
          role: string | null
          signature_data: Json
          signature_request_id: string
          signed_at: string | null
          signing_order: number
          status: Database["public"]["Enums"]["signer_status"]
          updated_at: string
          user_agent: string | null
          user_id: string | null
          viewed_at: string | null
          workspace_id: string
        }
        Insert: {
          client_contact_id?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          email: string
          id?: string
          ip_address?: unknown
          name: string
          role?: string | null
          signature_data?: Json
          signature_request_id: string
          signed_at?: string | null
          signing_order?: number
          status?: Database["public"]["Enums"]["signer_status"]
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          viewed_at?: string | null
          workspace_id: string
        }
        Update: {
          client_contact_id?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          email?: string
          id?: string
          ip_address?: unknown
          name?: string
          role?: string | null
          signature_data?: Json
          signature_request_id?: string
          signed_at?: string | null
          signing_order?: number
          status?: Database["public"]["Enums"]["signer_status"]
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          viewed_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_signers_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_signers_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_signers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "signature_signers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_availability_rules: {
        Row: {
          appointment_type_id: string | null
          created_at: string
          effective_from: string | null
          effective_to: string | null
          ends_at: string
          id: string
          is_active: boolean
          starts_at: string
          timezone: string
          updated_at: string
          user_id: string
          weekday: number
          workspace_id: string
        }
        Insert: {
          appointment_type_id?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          ends_at: string
          id?: string
          is_active?: boolean
          starts_at: string
          timezone?: string
          updated_at?: string
          user_id: string
          weekday: number
          workspace_id: string
        }
        Update: {
          appointment_type_id?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          ends_at?: string
          id?: string
          is_active?: boolean
          starts_at?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          weekday?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_availability_rules_appointment_type_id_fkey"
            columns: ["appointment_type_id"]
            isOneToOne: false
            referencedRelation: "appointment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "staff_availability_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_blackout_periods: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          reason: string | null
          starts_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          reason?: string | null
          starts_at: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          reason?: string | null
          starts_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_blackout_periods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "staff_blackout_periods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          annual_price: number | null
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_clients: number | null
          max_staff: number | null
          max_storage_gb: number | null
          monthly_price: number
          name: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          annual_price?: number | null
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_clients?: number | null
          max_staff?: number | null
          max_storage_gb?: number | null
          monthly_price?: number
          name: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          annual_price?: number | null
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_clients?: number | null
          max_staff?: number | null
          max_storage_gb?: number | null
          monthly_price?: number
          name?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          author_user_id: string | null
          body: string
          client_visible: boolean
          created_at: string
          id: string
          task_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          client_visible?: boolean
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          client_visible?: boolean
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "task_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by_user_id: string | null
          assigned_to_user_id: string | null
          checklist: Json
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          engagement_id: string | null
          id: string
          lead_id: string | null
          metadata: Json
          priority: Database["public"]["Enums"]["task_priority"]
          recurrence_rule: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_by_user_id?: string | null
          assigned_to_user_id?: string | null
          checklist?: Json
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          engagement_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_rule?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_by_user_id?: string | null
          assigned_to_user_id?: string | null
          checklist?: Json
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          engagement_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_rule?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      tax_deadline_rules: {
        Row: {
          created_at: string
          extension_due_date: string | null
          id: string
          internal_lead_days: number
          is_active: boolean
          jurisdiction: string
          metadata: Json
          original_due_date: string
          return_type: Database["public"]["Enums"]["tax_return_type"]
          tax_year: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          extension_due_date?: string | null
          id?: string
          internal_lead_days?: number
          is_active?: boolean
          jurisdiction?: string
          metadata?: Json
          original_due_date: string
          return_type: Database["public"]["Enums"]["tax_return_type"]
          tax_year: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          extension_due_date?: string | null
          id?: string
          internal_lead_days?: number
          is_active?: boolean
          jurisdiction?: string
          metadata?: Json
          original_due_date?: string
          return_type?: Database["public"]["Enums"]["tax_return_type"]
          tax_year?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_deadline_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "tax_deadline_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_engagements: {
        Row: {
          archived_at: string | null
          assigned_at: string | null
          balance_due: number | null
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          document_request_id: string | null
          due_date: string | null
          efile_authorization_received: boolean
          efile_status: Database["public"]["Enums"]["engagement_efile_status"]
          engagement_number: string | null
          engagement_type: Database["public"]["Enums"]["engagement_type"]
          ero_workspace_id: string | null
          extension_due_date: string | null
          extension_filed: boolean
          extension_requested: boolean
          external_return_id: string | null
          external_tax_software: string | null
          federal_return_required: boolean
          filed_at: string | null
          filing_status: string | null
          household_id: string | null
          id: string
          internal_due_date: string | null
          internal_notes: string | null
          jurisdiction: string | null
          local_return_required: boolean
          metadata: Json
          opened_at: string | null
          payment_status: Database["public"]["Enums"]["engagement_payment_status"]
          primary_preparer_user_id: string | null
          priority: Database["public"]["Enums"]["engagement_priority"]
          refund_amount: number | null
          responsible_staff_user_id: string | null
          return_type: Database["public"]["Enums"]["tax_return_type"] | null
          reviewed_at: string | null
          reviewer_user_id: string | null
          service_bureau_workspace_id: string | null
          service_id: string | null
          settings: Json
          started_at: string | null
          state_return_required: boolean
          status: Database["public"]["Enums"]["engagement_status"]
          status_source: string
          submitted_for_review_at: string | null
          tax_year: number | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          assigned_at?: string | null
          balance_due?: number | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_request_id?: string | null
          due_date?: string | null
          efile_authorization_received?: boolean
          efile_status?: Database["public"]["Enums"]["engagement_efile_status"]
          engagement_number?: string | null
          engagement_type: Database["public"]["Enums"]["engagement_type"]
          ero_workspace_id?: string | null
          extension_due_date?: string | null
          extension_filed?: boolean
          extension_requested?: boolean
          external_return_id?: string | null
          external_tax_software?: string | null
          federal_return_required?: boolean
          filed_at?: string | null
          filing_status?: string | null
          household_id?: string | null
          id?: string
          internal_due_date?: string | null
          internal_notes?: string | null
          jurisdiction?: string | null
          local_return_required?: boolean
          metadata?: Json
          opened_at?: string | null
          payment_status?: Database["public"]["Enums"]["engagement_payment_status"]
          primary_preparer_user_id?: string | null
          priority?: Database["public"]["Enums"]["engagement_priority"]
          refund_amount?: number | null
          responsible_staff_user_id?: string | null
          return_type?: Database["public"]["Enums"]["tax_return_type"] | null
          reviewed_at?: string | null
          reviewer_user_id?: string | null
          service_bureau_workspace_id?: string | null
          service_id?: string | null
          settings?: Json
          started_at?: string | null
          state_return_required?: boolean
          status?: Database["public"]["Enums"]["engagement_status"]
          status_source?: string
          submitted_for_review_at?: string | null
          tax_year?: number | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          assigned_at?: string | null
          balance_due?: number | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_request_id?: string | null
          due_date?: string | null
          efile_authorization_received?: boolean
          efile_status?: Database["public"]["Enums"]["engagement_efile_status"]
          engagement_number?: string | null
          engagement_type?: Database["public"]["Enums"]["engagement_type"]
          ero_workspace_id?: string | null
          extension_due_date?: string | null
          extension_filed?: boolean
          extension_requested?: boolean
          external_return_id?: string | null
          external_tax_software?: string | null
          federal_return_required?: boolean
          filed_at?: string | null
          filing_status?: string | null
          household_id?: string | null
          id?: string
          internal_due_date?: string | null
          internal_notes?: string | null
          jurisdiction?: string | null
          local_return_required?: boolean
          metadata?: Json
          opened_at?: string | null
          payment_status?: Database["public"]["Enums"]["engagement_payment_status"]
          primary_preparer_user_id?: string | null
          priority?: Database["public"]["Enums"]["engagement_priority"]
          refund_amount?: number | null
          responsible_staff_user_id?: string | null
          return_type?: Database["public"]["Enums"]["tax_return_type"] | null
          reviewed_at?: string | null
          reviewer_user_id?: string | null
          service_bureau_workspace_id?: string | null
          service_id?: string | null
          settings?: Json
          started_at?: string | null
          state_return_required?: boolean
          status?: Database["public"]["Enums"]["engagement_status"]
          status_source?: string
          submitted_for_review_at?: string | null
          tax_year?: number | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_engagements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_engagements_document_request_id_fkey"
            columns: ["document_request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_engagements_document_request_id_fkey"
            columns: ["document_request_id"]
            isOneToOne: false
            referencedRelation: "v_missing_document_aging"
            referencedColumns: ["document_request_id"]
          },
          {
            foreignKeyName: "tax_engagements_ero_workspace_id_fkey"
            columns: ["ero_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "tax_engagements_ero_workspace_id_fkey"
            columns: ["ero_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_engagements_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "tax_households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_engagements_service_bureau_workspace_id_fkey"
            columns: ["service_bureau_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "tax_engagements_service_bureau_workspace_id_fkey"
            columns: ["service_bureau_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_engagements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_engagements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "tax_engagements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_households: {
        Row: {
          created_at: string
          filing_status: string | null
          household_name: string
          id: string
          metadata: Json
          primary_address: Json
          primary_client_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          filing_status?: string | null
          household_name: string
          id?: string
          metadata?: Json
          primary_address?: Json
          primary_client_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          filing_status?: string | null
          household_name?: string
          id?: string
          metadata?: Json
          primary_address?: Json
          primary_client_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_households_primary_client_id_fkey"
            columns: ["primary_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_households_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "tax_households_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_installations: {
        Row: {
          id: string
          installed_at: string
          installed_by: string | null
          installed_template_id: string
          installed_workspace_id: string
          last_synced_at: string | null
          last_synced_version_id: string | null
          source_template_id: string
          source_version_id: string | null
          update_mode: Database["public"]["Enums"]["template_update_mode"]
        }
        Insert: {
          id?: string
          installed_at?: string
          installed_by?: string | null
          installed_template_id: string
          installed_workspace_id: string
          last_synced_at?: string | null
          last_synced_version_id?: string | null
          source_template_id: string
          source_version_id?: string | null
          update_mode?: Database["public"]["Enums"]["template_update_mode"]
        }
        Update: {
          id?: string
          installed_at?: string
          installed_by?: string | null
          installed_template_id?: string
          installed_workspace_id?: string
          last_synced_at?: string | null
          last_synced_version_id?: string | null
          source_template_id?: string
          source_version_id?: string | null
          update_mode?: Database["public"]["Enums"]["template_update_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "template_installations_installed_template_id_fkey"
            columns: ["installed_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_installations_installed_workspace_id_fkey"
            columns: ["installed_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "template_installations_installed_workspace_id_fkey"
            columns: ["installed_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_installations_last_synced_version_id_fkey"
            columns: ["last_synced_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_installations_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_installations_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      template_locked_components: {
        Row: {
          component_key: string
          created_at: string
          id: string
          lock_type: string
          locked_by: string | null
          reason: string | null
          template_version_id: string
        }
        Insert: {
          component_key: string
          created_at?: string
          id?: string
          lock_type?: string
          locked_by?: string | null
          reason?: string | null
          template_version_id: string
        }
        Update: {
          component_key?: string
          created_at?: string
          id?: string
          lock_type?: string
          locked_by?: string | null
          reason?: string | null
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_locked_components_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      template_shares: {
        Row: {
          can_customize: boolean
          can_reshare: boolean
          created_at: string
          expires_at: string | null
          id: string
          owner_workspace_id: string | null
          permission: Database["public"]["Enums"]["template_share_permission"]
          revoked_at: string | null
          shared_by: string | null
          shared_with_user_id: string | null
          shared_with_workspace_id: string | null
          starts_at: string
          template_id: string
          update_mode: Database["public"]["Enums"]["template_update_mode"]
        }
        Insert: {
          can_customize?: boolean
          can_reshare?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_workspace_id?: string | null
          permission?: Database["public"]["Enums"]["template_share_permission"]
          revoked_at?: string | null
          shared_by?: string | null
          shared_with_user_id?: string | null
          shared_with_workspace_id?: string | null
          starts_at?: string
          template_id: string
          update_mode?: Database["public"]["Enums"]["template_update_mode"]
        }
        Update: {
          can_customize?: boolean
          can_reshare?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_workspace_id?: string | null
          permission?: Database["public"]["Enums"]["template_share_permission"]
          revoked_at?: string | null
          shared_by?: string | null
          shared_with_user_id?: string | null
          shared_with_workspace_id?: string | null
          starts_at?: string
          template_id?: string
          update_mode?: Database["public"]["Enums"]["template_update_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "template_shares_owner_workspace_id_fkey"
            columns: ["owner_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "template_shares_owner_workspace_id_fkey"
            columns: ["owner_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_shares_shared_with_workspace_id_fkey"
            columns: ["shared_with_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "template_shares_shared_with_workspace_id_fkey"
            columns: ["shared_with_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_shares_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          change_summary: string | null
          content: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          published_at: string | null
          published_by: string | null
          schema_version: number
          status: Database["public"]["Enums"]["template_status"]
          template_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          published_at?: string | null
          published_by?: string | null
          schema_version?: number
          status?: Database["public"]["Enums"]["template_status"]
          template_id: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          published_at?: string | null
          published_by?: string | null
          schema_version?: number
          status?: Database["public"]["Enums"]["template_status"]
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          allow_workspace_customization: boolean
          archived_at: string | null
          category: string | null
          created_at: string
          created_by: string | null
          current_version_id: string | null
          description: string | null
          id: string
          is_required: boolean
          is_system_template: boolean
          kind: Database["public"]["Enums"]["template_kind"]
          latest_published_version_id: string | null
          metadata: Json
          name: string
          original_workspace_id: string | null
          published_at: string | null
          source_template_id: string | null
          status: Database["public"]["Enums"]["template_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["template_visibility"]
          workspace_id: string | null
        }
        Insert: {
          allow_workspace_customization?: boolean
          archived_at?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          id?: string
          is_required?: boolean
          is_system_template?: boolean
          kind: Database["public"]["Enums"]["template_kind"]
          latest_published_version_id?: string | null
          metadata?: Json
          name: string
          original_workspace_id?: string | null
          published_at?: string | null
          source_template_id?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["template_visibility"]
          workspace_id?: string | null
        }
        Update: {
          allow_workspace_customization?: boolean
          archived_at?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          id?: string
          is_required?: boolean
          is_system_template?: boolean
          kind?: Database["public"]["Enums"]["template_kind"]
          latest_published_version_id?: string | null
          metadata?: Json
          name?: string
          original_workspace_id?: string | null
          published_at?: string | null
          source_template_id?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["template_visibility"]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_latest_published_version_id_fkey"
            columns: ["latest_published_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_original_workspace_id_fkey"
            columns: ["original_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "templates_original_workspace_id_fkey"
            columns: ["original_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "templates_workspace_id_fkey"
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
          display_name: string | null
          first_name: string | null
          is_platform_admin: boolean
          last_name: string | null
          phone: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          is_platform_admin?: boolean
          last_name?: string | null
          phone?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          is_platform_admin?: boolean
          last_name?: string | null
          phone?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          error_message: string | null
          event_id: string
          event_type: string
          failed_at: string | null
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          scheduled_for: string
          status: Database["public"]["Enums"]["outbox_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          error_message?: string | null
          event_id: string
          event_type: string
          failed_at?: string | null
          id?: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          scheduled_for?: string
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          failed_at?: string | null
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          scheduled_for?: string
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "webhook_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          created_by: string | null
          endpoint_url: string
          id: string
          is_active: boolean
          last_delivery_at: string | null
          last_error: string | null
          last_status_code: number | null
          name: string
          secret_reference: string | null
          subscribed_events: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          endpoint_url: string
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_error?: string | null
          last_status_code?: number | null
          name: string
          secret_reference?: string | null
          subscribed_events?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          endpoint_url?: string
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_error?: string | null
          last_status_code?: number | null
          name?: string
          secret_reference?: string | null
          subscribed_events?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "webhook_endpoints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_action_outbox: {
        Row: {
          action_type: string
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string
          payload: Json
          processed_at: string | null
          scheduled_for: string
          status: Database["public"]["Enums"]["automation_job_status"]
          workflow_run_id: string
          workflow_run_step_id: string
          workspace_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          payload?: Json
          processed_at?: string | null
          scheduled_for?: string
          status?: Database["public"]["Enums"]["automation_job_status"]
          workflow_run_id: string
          workflow_run_step_id: string
          workspace_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          payload?: Json
          processed_at?: string | null
          scheduled_for?: string
          status?: Database["public"]["Enums"]["automation_job_status"]
          workflow_run_id?: string
          workflow_run_step_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_action_outbox_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_action_outbox_workflow_run_step_id_fkey"
            columns: ["workflow_run_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_run_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_action_outbox_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workflow_action_outbox_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_approvals: {
        Row: {
          due_at: string | null
          id: string
          instructions: string | null
          metadata: Json
          requested_at: string
          requested_by: string | null
          requested_from_role:
            | Database["public"]["Enums"]["membership_role"]
            | null
          requested_from_user_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          title: string
          workflow_run_id: string
          workflow_run_step_id: string
          workspace_id: string
        }
        Insert: {
          due_at?: string | null
          id?: string
          instructions?: string | null
          metadata?: Json
          requested_at?: string
          requested_by?: string | null
          requested_from_role?:
            | Database["public"]["Enums"]["membership_role"]
            | null
          requested_from_user_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          title: string
          workflow_run_id: string
          workflow_run_step_id: string
          workspace_id: string
        }
        Update: {
          due_at?: string | null
          id?: string
          instructions?: string | null
          metadata?: Json
          requested_at?: string
          requested_by?: string | null
          requested_from_role?:
            | Database["public"]["Enums"]["membership_role"]
            | null
          requested_from_user_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          title?: string
          workflow_run_id?: string
          workflow_run_step_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_approvals_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_approvals_workflow_run_step_id_fkey"
            columns: ["workflow_run_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_run_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workflow_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_connections: {
        Row: {
          condition_expression: Json | null
          created_at: string
          id: string
          label: string | null
          priority: number
          source_handle: string | null
          source_node_id: string
          target_handle: string | null
          target_node_id: string
          workflow_definition_id: string
        }
        Insert: {
          condition_expression?: Json | null
          created_at?: string
          id?: string
          label?: string | null
          priority?: number
          source_handle?: string | null
          source_node_id: string
          target_handle?: string | null
          target_node_id: string
          workflow_definition_id: string
        }
        Update: {
          condition_expression?: Json | null
          created_at?: string
          id?: string
          label?: string | null
          priority?: number
          source_handle?: string | null
          source_node_id?: string
          target_handle?: string | null
          target_node_id?: string
          workflow_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_connections_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_connections_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_connections_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_definitions: {
        Row: {
          allow_manual_start: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          max_concurrent_runs: number
          name: string
          settings: Json
          template_id: string
          template_version_id: string
          trigger_config: Json
          trigger_type: Database["public"]["Enums"]["workflow_trigger_type"]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          allow_manual_start?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_concurrent_runs?: number
          name: string
          settings?: Json
          template_id: string
          template_version_id: string
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["workflow_trigger_type"]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          allow_manual_start?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_concurrent_runs?: number
          name?: string
          settings?: Json
          template_id?: string
          template_version_id?: string
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["workflow_trigger_type"]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_definitions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_definitions_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: true
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_definitions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workflow_definitions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_data: Json
          event_type: Database["public"]["Enums"]["workflow_event_type"]
          id: number
          workflow_run_id: string
          workflow_run_step_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_data?: Json
          event_type: Database["public"]["Enums"]["workflow_event_type"]
          id?: never
          workflow_run_id: string
          workflow_run_step_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_data?: Json
          event_type?: Database["public"]["Enums"]["workflow_event_type"]
          id?: never
          workflow_run_id?: string
          workflow_run_step_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_events_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_events_workflow_run_step_id_fkey"
            columns: ["workflow_run_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_run_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workflow_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_nodes: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          is_locked: boolean
          label: string
          node_key: string
          node_type: Database["public"]["Enums"]["workflow_node_type"]
          position_x: number
          position_y: number
          retry_policy: Json
          timeout_seconds: number | null
          updated_at: string
          workflow_definition_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean
          label: string
          node_key: string
          node_type: Database["public"]["Enums"]["workflow_node_type"]
          position_x?: number
          position_y?: number
          retry_policy?: Json
          timeout_seconds?: number | null
          updated_at?: string
          workflow_definition_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean
          label?: string
          node_key?: string
          node_type?: Database["public"]["Enums"]["workflow_node_type"]
          position_x?: number
          position_y?: number
          retry_policy?: Json
          timeout_seconds?: number | null
          updated_at?: string
          workflow_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_nodes_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_run_steps: {
        Row: {
          assigned_user_id: string | null
          attempt_count: number
          available_at: string | null
          completed_at: string | null
          created_at: string
          error_data: Json | null
          failed_at: string | null
          id: string
          input_data: Json
          output_data: Json
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_step_status"]
          updated_at: string
          workflow_node_id: string
          workflow_run_id: string
        }
        Insert: {
          assigned_user_id?: string | null
          attempt_count?: number
          available_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_data?: Json | null
          failed_at?: string | null
          id?: string
          input_data?: Json
          output_data?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          updated_at?: string
          workflow_node_id: string
          workflow_run_id: string
        }
        Update: {
          assigned_user_id?: string | null
          attempt_count?: number
          available_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_data?: Json | null
          failed_at?: string | null
          id?: string
          input_data?: Json
          output_data?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          updated_at?: string
          workflow_node_id?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_run_steps_workflow_node_id_fkey"
            columns: ["workflow_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_run_steps_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          cancelled_at: string | null
          client_id: string | null
          completed_at: string | null
          context: Json
          created_at: string
          current_node_ids: string[]
          engagement_id: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["workflow_run_status"]
          template_version_id: string
          trigger_event_id: string | null
          trigger_type: Database["public"]["Enums"]["workflow_trigger_type"]
          updated_at: string
          waiting_until: string | null
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_node_ids?: string[]
          engagement_id?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          template_version_id: string
          trigger_event_id?: string | null
          trigger_type: Database["public"]["Enums"]["workflow_trigger_type"]
          updated_at?: string
          waiting_until?: string | null
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_node_ids?: string[]
          engagement_id?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          template_version_id?: string
          trigger_event_id?: string | null
          trigger_type?: Database["public"]["Enums"]["workflow_trigger_type"]
          updated_at?: string
          waiting_until?: string | null
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      workflow_waits: {
        Row: {
          created_at: string
          id: string
          release_at: string | null
          release_event_filter: Json
          release_event_type: string | null
          released_at: string | null
          released_by: string | null
          wait_type: string
          workflow_run_id: string
          workflow_run_step_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          release_at?: string | null
          release_event_filter?: Json
          release_event_type?: string | null
          released_at?: string | null
          released_by?: string | null
          wait_type: string
          workflow_run_id: string
          workflow_run_step_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          release_at?: string | null
          release_event_filter?: Json
          release_event_type?: string | null
          released_at?: string | null
          released_by?: string | null
          wait_type?: string
          workflow_run_id?: string
          workflow_run_step_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_waits_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_waits_workflow_run_step_id_fkey"
            columns: ["workflow_run_step_id"]
            isOneToOne: true
            referencedRelation: "workflow_run_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_waits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workflow_waits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_integrations: {
        Row: {
          configuration: Json
          created_at: string
          created_by: string | null
          credential_reference: string | null
          display_name: string | null
          id: string
          is_enabled: boolean
          last_error: string | null
          last_verified_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          created_by?: string | null
          credential_reference?: string | null
          display_name?: string | null
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_verified_at?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          created_by?: string | null
          credential_reference?: string | null
          display_name?: string | null
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_verified_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_integrations_workspace_id_fkey"
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
          created_at: string
          email: string
          expires_at: string
          id: string
          invitation_terms: Json
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["membership_role"]
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invitation_terms?: Json
          invited_by?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["membership_role"]
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invitation_terms?: Json
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["membership_role"]
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      workspace_members: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          invited_by: string | null
          joined_at: string | null
          permissions: Json
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["membership_status"]
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          permissions?: Json
          role: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          permissions?: Json
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_relationships: {
        Row: {
          created_at: string
          created_by: string | null
          data_access_scope: Json
          ends_on: string | null
          id: string
          relationship_type: Database["public"]["Enums"]["relationship_type"]
          source_workspace_id: string
          starts_on: string | null
          status: Database["public"]["Enums"]["relationship_status"]
          target_workspace_id: string
          template_sharing_scope: Json
          terms: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_access_scope?: Json
          ends_on?: string | null
          id?: string
          relationship_type: Database["public"]["Enums"]["relationship_type"]
          source_workspace_id: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["relationship_status"]
          target_workspace_id: string
          template_sharing_scope?: Json
          terms?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_access_scope?: Json
          ends_on?: string | null
          id?: string
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
          source_workspace_id?: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["relationship_status"]
          target_workspace_id?: string
          template_sharing_scope?: Json
          terms?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_relationships_source_workspace_id_fkey"
            columns: ["source_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_relationships_source_workspace_id_fkey"
            columns: ["source_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_relationships_target_workspace_id_fkey"
            columns: ["target_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_relationships_target_workspace_id_fkey"
            columns: ["target_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          external_customer_id: string | null
          external_processor: string | null
          external_subscription_id: string | null
          id: string
          metadata: Json
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          external_customer_id?: string | null
          external_processor?: string | null
          external_subscription_id?: string | null
          id?: string
          metadata?: Json
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          external_customer_id?: string | null
          external_processor?: string | null
          external_subscription_id?: string | null
          id?: string
          metadata?: Json
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      workspaces: {
        Row: {
          archived_at: string | null
          branding: Json
          created_at: string | null
          dba_name: string | null
          email: string | null
          id: string
          legal_name: string | null
          name: string
          owner_user_id: string | null
          phone: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["workspace_status"]
          updated_at: string | null
          website: string | null
          workspace_type: Database["public"]["Enums"]["workspace_type"]
        }
        Insert: {
          archived_at?: string | null
          branding?: Json
          created_at?: string | null
          dba_name?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name: string
          owner_user_id?: string | null
          phone?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["workspace_status"]
          updated_at?: string | null
          website?: string | null
          workspace_type?: Database["public"]["Enums"]["workspace_type"]
        }
        Update: {
          archived_at?: string | null
          branding?: Json
          created_at?: string | null
          dba_name?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          owner_user_id?: string | null
          phone?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["workspace_status"]
          updated_at?: string | null
          website?: string | null
          workspace_type?: Database["public"]["Enums"]["workspace_type"]
        }
        Relationships: []
      }
      zoom_meetings: {
        Row: {
          agenda: string | null
          appointment_id: string
          created_at: string
          duration_minutes: number
          host_user_id: string | null
          id: string
          join_url: string | null
          password: string | null
          provider_payload: Json
          settings: Json
          start_url: string | null
          starts_at: string
          status: string
          timezone: string
          topic: string
          updated_at: string
          workspace_id: string
          zoom_meeting_id: string | null
          zoom_occurrence_id: string | null
        }
        Insert: {
          agenda?: string | null
          appointment_id: string
          created_at?: string
          duration_minutes: number
          host_user_id?: string | null
          id?: string
          join_url?: string | null
          password?: string | null
          provider_payload?: Json
          settings?: Json
          start_url?: string | null
          starts_at: string
          status?: string
          timezone?: string
          topic: string
          updated_at?: string
          workspace_id: string
          zoom_meeting_id?: string | null
          zoom_occurrence_id?: string | null
        }
        Update: {
          agenda?: string | null
          appointment_id?: string
          created_at?: string
          duration_minutes?: number
          host_user_id?: string | null
          id?: string
          join_url?: string | null
          password?: string | null
          provider_payload?: Json
          settings?: Json
          start_url?: string | null
          starts_at?: string
          status?: string
          timezone?: string
          topic?: string
          updated_at?: string
          workspace_id?: string
          zoom_meeting_id?: string | null
          zoom_occurrence_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zoom_meetings_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_meetings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "zoom_meetings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_client_form_assignments: {
        Row: {
          answered_questions: number | null
          assigned_at: string | null
          assignment_status: string | null
          change_request_message: string | null
          changed_requested_at: string | null
          client_company: string | null
          client_email: string | null
          client_first_name: string | null
          client_id: string | null
          client_last_name: string | null
          client_message: string | null
          created_at: string | null
          due_date: string | null
          id: string | null
          internal_notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          service_id: string | null
          service_name: string | null
          started_at: string | null
          submitted_at: string | null
          template_category: string | null
          template_description: string | null
          template_id: string | null
          template_name: string | null
          total_questions: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_form_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "v_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      v_client_portal_forms: {
        Row: {
          answered_questions: number | null
          assigned_at: string | null
          assignment_id: string | null
          assignment_status: string | null
          client_id: string | null
          client_message: string | null
          description: string | null
          due_date: string | null
          is_overdue: boolean | null
          started_at: string | null
          submitted_at: string | null
          template_category: string | null
          template_id: string | null
          template_name: string | null
          total_questions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_form_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "v_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      v_engagement_work_queue: {
        Row: {
          balance_due: number | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          due_date: string | null
          engagement_number: string | null
          id: string | null
          internal_due_date: string | null
          missing_document_count: number | null
          open_task_count: number | null
          primary_preparer_user_id: string | null
          priority: Database["public"]["Enums"]["engagement_priority"] | null
          return_type: Database["public"]["Enums"]["tax_return_type"] | null
          reviewer_user_id: string | null
          status: Database["public"]["Enums"]["engagement_status"] | null
          tax_year: number | null
          title: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_engagements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_engagements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "tax_engagements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_form_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          question_count: number | null
          template_category: string | null
          template_name: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "form_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_missing_document_aging: {
        Row: {
          age_days: number | null
          client_id: string | null
          created_at: string | null
          document_request_id: string | null
          engagement_id: string | null
          outstanding_items: number | null
          status: Database["public"]["Enums"]["document_request_status"] | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "tax_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "v_engagement_work_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      v_my_notifications: {
        Row: {
          client_first_name: string | null
          client_id: string | null
          client_last_name: string | null
          created_at: string | null
          id: string | null
          is_read: boolean | null
          message: string | null
          title: string | null
          type: string | null
          workspace_id: string | null
          workspace_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_revenue_summary: {
        Row: {
          collected: number | null
          invoice_count: number | null
          invoiced: number | null
          outstanding: number | null
          period: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
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
      v_staff_workload: {
        Row: {
          open_engagements: number | null
          open_tasks: number | null
          role: Database["public"]["Enums"]["membership_role"] | null
          upcoming_appointments: number | null
          user_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_tax_office_dashboard"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tax_office_dashboard: {
        Row: {
          active_clients: number | null
          appointments_today: number | null
          awaiting_review: number | null
          open_engagements: number | null
          open_leads: number | null
          outstanding_balance: number | null
          overdue_tasks: number | null
          revenue_ytd: number | null
          waiting_on_clients: number | null
          workspace_id: string | null
        }
        Insert: {
          active_clients?: never
          appointments_today?: never
          awaiting_review?: never
          open_engagements?: never
          open_leads?: never
          outstanding_balance?: never
          overdue_tasks?: never
          revenue_ytd?: never
          waiting_on_clients?: never
          workspace_id?: string | null
        }
        Update: {
          active_clients?: never
          appointments_today?: never
          awaiting_review?: never
          open_engagements?: never
          open_leads?: never
          outstanding_balance?: never
          overdue_tasks?: never
          revenue_ytd?: never
          waiting_on_clients?: never
          workspace_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_workflow_definition: {
        Args: { p_definition_id: string }
        Returns: undefined
      }
      add_form_question: {
        Args: {
          p_help_text?: string
          p_is_required?: boolean
          p_label: string
          p_options?: Json
          p_question_type: string
          p_sort_order?: number
          p_template_id: string
        }
        Returns: string
      }
      apply_tax_deadline: { Args: { p_engagement_id: string }; Returns: Json }
      approve_and_lock_intake: {
        Args: { p_submission_id: string }
        Returns: undefined
      }
      assign_form_to_client: {
        Args: {
          p_client_id: string
          p_client_message?: string
          p_due_date?: string
          p_internal_notes?: string
          p_service_id?: string
          p_template_id: string
        }
        Returns: string
      }
      begin_intake_review: { Args: { p_submission_id: string }; Returns: Json }
      can_access_client_record: {
        Args: { p_client_id: string; p_workspace_id: string }
        Returns: boolean
      }
      can_access_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      can_access_document: { Args: { p_document_id: string }; Returns: boolean }
      can_access_engagement: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      can_access_intake_submission: {
        Args: { p_submission_id: string }
        Returns: boolean
      }
      can_access_template: { Args: { p_template_id: string }; Returns: boolean }
      can_access_workflow_definition: {
        Args: { p_definition_id: string }
        Returns: boolean
      }
      can_manage_document: { Args: { p_document_id: string }; Returns: boolean }
      can_manage_engagement: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      can_manage_intake_submission: {
        Args: { p_submission_id: string }
        Returns: boolean
      }
      can_manage_template: { Args: { p_template_id: string }; Returns: boolean }
      can_manage_workflow_definition: {
        Args: { p_definition_id: string }
        Returns: boolean
      }
      claim_due_outbox: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          body_html: string | null
          body_text: string | null
          channel: Database["public"]["Enums"]["outbox_channel"]
          client_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          engagement_id: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          max_attempts: number
          metadata: Json
          provider: Database["public"]["Enums"]["integration_provider"] | null
          provider_message_id: string | null
          recipient_address: string
          recipient_user_id: string | null
          scheduled_for: string
          sender_address: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          subject: string | null
          template_id: string | null
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "communication_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_reminders: {
        Args: { p_limit?: number }
        Returns: {
          appointment_id: string | null
          channel: Database["public"]["Enums"]["outbox_channel"]
          client_id: string | null
          created_at: string
          created_by: string | null
          document_request_id: string | null
          engagement_id: string | null
          error_message: string | null
          id: string
          invoice_id: string | null
          outbox_id: string | null
          payload: Json
          recipient_address: string | null
          reminder_type: string
          scheduled_for: string
          sent_at: string | null
          signature_request_id: string | null
          skipped_reason: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          template_id: string | null
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reminders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_intake_review: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      complete_signature: {
        Args: {
          p_ip_address?: unknown
          p_signature_data: Json
          p_signer_id: string
          p_user_agent?: string
        }
        Returns: Json
      }
      convert_lead_to_client: { Args: { p_lead_id: string }; Returns: string }
      create_form_template: {
        Args: {
          p_description?: string
          p_is_active?: boolean
          p_template_category: string
          p_template_name: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_next_template_version: {
        Args: { p_change_summary?: string; p_template_id: string }
        Returns: string
      }
      create_signature_certificate: {
        Args: {
          p_certificate_document_id?: string
          p_document_sha256?: string
          p_signature_request_id: string
          p_signed_document_id?: string
        }
        Returns: string
      }
      create_template_draft: {
        Args: {
          p_category?: string
          p_description?: string
          p_kind: Database["public"]["Enums"]["template_kind"]
          p_name: string
          p_visibility?: Database["public"]["Enums"]["template_visibility"]
          p_workspace_id: string
        }
        Returns: string
      }
      create_workspace_with_owner: {
        Args: {
          p_dba_name?: string
          p_email?: string
          p_legal_name?: string
          p_name: string
          p_phone?: string
          p_plan_code?: string
          p_settings?: Json
          p_website?: string
          p_workspace_type: Database["public"]["Enums"]["workspace_type"]
        }
        Returns: {
          archived_at: string | null
          branding: Json
          created_at: string | null
          dba_name: string | null
          email: string | null
          id: string
          legal_name: string | null
          name: string
          owner_user_id: string | null
          phone: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["workspace_status"]
          updated_at: string | null
          website: string | null
          workspace_type: Database["public"]["Enums"]["workspace_type"]
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      duplicate_template: {
        Args: {
          p_new_name: string
          p_source_template_id: string
          p_target_workspace_id: string
          p_update_mode?: Database["public"]["Enums"]["template_update_mode"]
        }
        Returns: string
      }
      ensure_intake_review_sections: {
        Args: { p_submission_id: string }
        Returns: number
      }
      evaluate_intake_compliance: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      evaluate_return_release: {
        Args: { p_engagement_id: string }
        Returns: Json
      }
      finish_outbox_failure: {
        Args: { p_error: string; p_outbox_id: string }
        Returns: undefined
      }
      generate_intake_document_request: {
        Args: { p_send?: boolean; p_submission_id: string }
        Returns: string
      }
      get_intake_visibility: {
        Args: { p_submission_id: string }
        Returns: {
          is_visible: boolean
          matched_rules: number
          target_key: string
          target_type: string
        }[]
      }
      has_workspace_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["membership_role"][]
          p_workspace_id: string
        }
        Returns: boolean
      }
      intake_condition_matches: {
        Args: {
          p_answer: Json
          p_expected: Json
          p_operator: Database["public"]["Enums"]["condition_operator"]
        }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      issue_signature_token: {
        Args: { p_expires_in_hours?: number; p_signer_id: string }
        Returns: string
      }
      log_engagement_activity: {
        Args: {
          p_activity_type: string
          p_description: string
          p_engagement_id: string
          p_metadata?: Json
          p_new_value?: string
          p_old_value?: string
        }
        Returns: number
      }
      mark_assigned_form_reviewed: {
        Args: { p_assignment_id: string; p_review_notes?: string }
        Returns: boolean
      }
      next_engagement_reference: {
        Args: { p_tax_year: number; p_workspace_id: string }
        Returns: string
      }
      next_invoice_number: { Args: { p_workspace_id: string }; Returns: string }
      publish_template_version: {
        Args: { p_template_id: string; p_version_id: string }
        Returns: undefined
      }
      queue_communication: {
        Args: {
          p_body_html?: string
          p_body_text?: string
          p_channel: Database["public"]["Enums"]["outbox_channel"]
          p_client_id?: string
          p_engagement_id?: string
          p_idempotency_key?: string
          p_metadata?: Json
          p_recipient: string
          p_scheduled_for?: string
          p_subject?: string
          p_workspace_id: string
        }
        Returns: string
      }
      recalculate_intake_progress: {
        Args: { p_submission_id: string }
        Returns: number
      }
      redeem_signature_token: { Args: { p_token: string }; Returns: Json }
      refresh_document_request_progress: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      release_completed_return: {
        Args: { p_engagement_id: string; p_notes?: string }
        Returns: undefined
      }
      reopen_intake: {
        Args: { p_reason: string; p_submission_id: string }
        Returns: undefined
      }
      request_form_changes: {
        Args: { p_assignment_id: string; p_change_request_message: string }
        Returns: boolean
      }
      request_intake_clarification: {
        Args: {
          p_client_visible?: boolean
          p_comment: string
          p_field_id: string
          p_submission_id: string
        }
        Returns: string
      }
      resolve_intake_clarification: {
        Args: { p_comment_id: string; p_resolution?: string }
        Returns: undefined
      }
      resolve_workflow_approval: {
        Args: {
          p_approval_id: string
          p_notes?: string
          p_status: Database["public"]["Enums"]["approval_status"]
        }
        Returns: undefined
      }
      review_intake_section: {
        Args: {
          p_notes?: string
          p_result: Database["public"]["Enums"]["review_result"]
          p_section_id: string
          p_submission_id: string
        }
        Returns: undefined
      }
      save_form_answer: {
        Args: {
          p_answer_json?: Json
          p_answer_text?: string
          p_assignment_id: string
          p_question_id: string
        }
        Returns: string
      }
      snapshot_intake_submission: {
        Args: {
          p_details?: string
          p_reason: Database["public"]["Enums"]["intake_revision_reason"]
          p_submission_id: string
        }
        Returns: string
      }
      start_workflow_run: {
        Args: {
          p_client_id?: string
          p_context?: Json
          p_definition_id: string
          p_engagement_id?: string
          p_trigger_event_id?: string
        }
        Returns: string
      }
      submit_assigned_form: {
        Args: { p_assignment_id: string }
        Returns: boolean
      }
      submit_intake: { Args: { p_submission_id: string }; Returns: Json }
      update_client_mailing_address: {
        Args: {
          p_city: string
          p_client_id: string
          p_line1: string
          p_line2: string
          p_postal_code: string
          p_state: string
        }
        Returns: undefined
      }
      update_client_portal_contact_info: {
        Args: {
          p_client_id: string
          p_phone: string
          p_preferred_contact_method: Database["public"]["Enums"]["contact_method"]
        }
        Returns: undefined
      }
      validate_intake_submission: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      validate_workflow_definition: {
        Args: { p_definition_id: string }
        Returns: Json
      }
    }
    Enums: {
      access_level: "view" | "collaborate" | "manage"
      appointment_location_type:
        | "office"
        | "phone"
        | "video"
        | "client_location"
        | "other"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "checked_in"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled"
      approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "changes_requested"
        | "cancelled"
      automation_job_status:
        | "queued"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      client_status: "lead" | "prospect" | "active" | "inactive" | "archived"
      client_type: "individual" | "business" | "household" | "organization"
      compliance_case_status:
        | "open"
        | "in_review"
        | "waiting_on_client"
        | "waiting_on_staff"
        | "resolved"
        | "not_applicable"
        | "escalated"
        | "closed"
      compliance_case_type:
        | "due_diligence"
        | "identity_verification"
        | "fraud_risk"
        | "credit_eligibility"
        | "filing_status"
        | "dependent_eligibility"
        | "income_verification"
        | "document_sufficiency"
        | "quality_review"
        | "other"
      condition_operator:
        | "equals"
        | "not_equals"
        | "contains"
        | "not_contains"
        | "greater_than"
        | "greater_than_or_equal"
        | "less_than"
        | "less_than_or_equal"
        | "is_empty"
        | "is_not_empty"
        | "in"
        | "not_in"
      contact_method: "email" | "phone" | "sms" | "address" | "other"
      contact_type:
        | "personal"
        | "business"
        | "spouse"
        | "authorized_contact"
        | "emergency"
        | "other"
      document_access_action:
        | "view"
        | "download"
        | "upload"
        | "replace"
        | "rename"
        | "move"
        | "share"
        | "unshare"
        | "review"
        | "delete"
        | "restore"
      document_request_item_status:
        | "requested"
        | "uploaded"
        | "under_review"
        | "accepted"
        | "rejected"
        | "waived"
        | "not_applicable"
      document_request_status:
        | "draft"
        | "sent"
        | "viewed"
        | "in_progress"
        | "partially_complete"
        | "completed"
        | "cancelled"
        | "expired"
      document_review_status:
        | "pending"
        | "approved"
        | "rejected"
        | "needs_clarification"
        | "duplicate"
        | "illegible"
        | "wrong_document"
      document_source:
        | "client_upload"
        | "staff_upload"
        | "email_import"
        | "form_upload"
        | "workflow"
        | "integration"
        | "generated"
      document_status:
        | "uploaded"
        | "processing"
        | "available"
        | "needs_review"
        | "approved"
        | "rejected"
        | "replaced"
        | "archived"
        | "deleted"
      document_visibility:
        | "client_and_staff"
        | "staff_only"
        | "client_only"
        | "shared_office"
        | "restricted"
      efile_event_type:
        | "not_ready"
        | "ready"
        | "transmitted"
        | "accepted"
        | "rejected"
        | "acknowledged"
        | "withdrawn"
      engagement_efile_status:
        | "not_started"
        | "not_applicable"
        | "awaiting_authorization"
        | "ready"
        | "transmitted"
        | "accepted"
        | "rejected"
        | "corrected"
        | "paper_filed"
      engagement_payment_status:
        | "not_required"
        | "unpaid"
        | "partially_paid"
        | "paid"
        | "payment_plan"
        | "refund_transfer"
        | "waived"
      engagement_priority: "low" | "normal" | "high" | "urgent"
      engagement_status:
        | "draft"
        | "intake_not_started"
        | "intake_in_progress"
        | "missing_documents"
        | "ready_for_preparation"
        | "preparation_in_progress"
        | "internal_review"
        | "awaiting_payment"
        | "awaiting_signature"
        | "ready_for_ero"
        | "sent_to_tax_software"
        | "transmitted_externally"
        | "acknowledgement_pending"
        | "accepted"
        | "rejected"
        | "correction_in_progress"
        | "completed"
        | "cancelled"
        | "archived"
        | "awaiting_client"
        | "documents_requested"
        | "in_preparation"
        | "preparer_review"
        | "reviewer_review"
        | "ready_to_file"
        | "filed"
        | "extended"
        | "on_hold"
      engagement_type:
        | "individual_return"
        | "business_return"
        | "amended_return"
        | "extension"
        | "tax_planning"
        | "bookkeeping"
        | "payroll"
        | "other"
        | "individual"
        | "business"
        | "nonprofit"
        | "extension_only"
        | "notice_resolution"
      form_component_type:
        | "section"
        | "heading"
        | "paragraph"
        | "text"
        | "textarea"
        | "number"
        | "currency"
        | "date"
        | "email"
        | "phone"
        | "address"
        | "yes_no"
        | "single_choice"
        | "multiple_choice"
        | "dropdown"
        | "file_upload"
        | "signature"
        | "calculation"
        | "repeatable_group"
        | "staff_only"
        | "divider"
        | "percentage"
        | "acknowledgment"
        | "year"
      intake_answer_status:
        | "draft"
        | "final"
        | "needs_clarification"
        | "verified"
      intake_entity_type:
        | "residence"
        | "employer"
        | "business"
        | "rental_property"
        | "k1_entity"
        | "education_student"
        | "childcare_provider"
        | "estimated_payment"
        | "tax_notice"
        | "investment_sale"
        | "digital_asset_account"
        | "foreign_account"
        | "property_sale"
        | "retirement_account"
        | "other_income"
        | "vehicle"
        | "bank_account"
        | "charitable_contribution"
        | "business_owner"
        | "fixed_asset"
        | "state_filing"
      intake_revision_reason:
        | "client_edit"
        | "staff_edit"
        | "changes_requested"
        | "reopened"
        | "system_update"
        | "import"
      intake_submission_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "changes_requested"
        | "resubmitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "archived"
      integration_provider:
        | "twilio"
        | "resend"
        | "zoom"
        | "stripe"
        | "verexa_signature"
      invoice_status:
        | "draft"
        | "sent"
        | "viewed"
        | "partially_paid"
        | "paid"
        | "past_due"
        | "void"
        | "refunded"
      lead_status:
        | "new"
        | "contacted"
        | "consultation_scheduled"
        | "consultation_completed"
        | "proposal_sent"
        | "won"
        | "lost"
        | "do_not_contact"
      membership_role:
        | "owner"
        | "admin"
        | "ero"
        | "preparer"
        | "reviewer"
        | "intake_specialist"
        | "document_specialist"
        | "billing"
        | "seasonal_staff"
        | "auditor"
        | "client"
      membership_status: "invited" | "active" | "suspended" | "removed"
      outbox_channel: "sms" | "email" | "portal" | "webhook"
      outbox_status:
        | "queued"
        | "processing"
        | "sent"
        | "delivered"
        | "failed"
        | "cancelled"
      ownership_type: "workspace_owned" | "preparer_owned" | "shared"
      payment_method:
        | "card"
        | "ach"
        | "cash"
        | "check"
        | "money_order"
        | "refund_transfer"
        | "other"
      payment_record_status:
        | "pending"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
      relationship_status:
        | "pending"
        | "active"
        | "paused"
        | "ended"
        | "declined"
      relationship_type:
        | "service_bureau_to_ero"
        | "ero_to_preparer"
        | "ptin_to_ero"
      reminder_status:
        | "scheduled"
        | "processing"
        | "sent"
        | "skipped"
        | "failed"
        | "cancelled"
      review_result:
        | "pending"
        | "pass"
        | "fail"
        | "needs_clarification"
        | "not_applicable"
      risk_level: "low" | "moderate" | "high" | "critical"
      signature_request_status:
        | "draft"
        | "sent"
        | "viewed"
        | "partially_signed"
        | "completed"
        | "declined"
        | "expired"
        | "cancelled"
      signer_status:
        | "pending"
        | "sent"
        | "viewed"
        | "signed"
        | "declined"
        | "expired"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "paused"
        | "cancelled"
        | "expired"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status:
        | "not_started"
        | "in_progress"
        | "waiting_on_client"
        | "waiting_on_staff"
        | "completed"
        | "cancelled"
      tax_return_type:
        | "1040"
        | "1040-X"
        | "1065"
        | "1120"
        | "1120-S"
        | "1041"
        | "706"
        | "709"
        | "990"
        | "941"
        | "940"
        | "state_individual"
        | "state_business"
        | "local"
        | "other"
      template_kind:
        | "form"
        | "workflow"
        | "message"
        | "document_request"
        | "checklist"
        | "engagement"
        | "service_package"
        | "sop"
      template_share_permission:
        | "view"
        | "use"
        | "duplicate"
        | "edit"
        | "reshare"
        | "manage"
      template_status: "draft" | "published" | "archived"
      template_update_mode:
        | "independent_copy"
        | "linked_manual"
        | "linked_automatic"
      template_visibility:
        | "private"
        | "workspace"
        | "connected_users"
        | "connected_offices"
        | "organization_network"
        | "marketplace"
      workflow_event_type:
        | "run_started"
        | "step_started"
        | "step_completed"
        | "step_failed"
        | "condition_evaluated"
        | "approval_requested"
        | "approval_resolved"
        | "wait_started"
        | "wait_released"
        | "action_queued"
        | "action_completed"
        | "run_completed"
        | "run_cancelled"
      workflow_node_type:
        | "start"
        | "trigger"
        | "condition"
        | "task"
        | "approval"
        | "assignment"
        | "wait"
        | "email"
        | "sms"
        | "portal_notification"
        | "document_request"
        | "status_change"
        | "form_assignment"
        | "webhook"
        | "parallel_split"
        | "parallel_join"
        | "end"
      workflow_run_status:
        | "queued"
        | "running"
        | "waiting"
        | "completed"
        | "failed"
        | "cancelled"
      workflow_step_status:
        | "pending"
        | "ready"
        | "running"
        | "waiting"
        | "completed"
        | "skipped"
        | "failed"
        | "cancelled"
      workflow_trigger_type:
        | "manual"
        | "engagement_created"
        | "engagement_status_changed"
        | "form_assigned"
        | "form_submitted"
        | "document_uploaded"
        | "document_request_completed"
        | "invoice_paid"
        | "signature_completed"
        | "date_reached"
        | "scheduled"
        | "client_portal_activated"
        | "relationship_created"
      workspace_status: "pending" | "active" | "suspended" | "archived"
      workspace_type:
        | "independent_ptin"
        | "ero_office"
        | "service_bureau"
        | "platform_admin"
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
      access_level: ["view", "collaborate", "manage"],
      appointment_location_type: [
        "office",
        "phone",
        "video",
        "client_location",
        "other",
      ],
      appointment_status: [
        "scheduled",
        "confirmed",
        "checked_in",
        "completed",
        "cancelled",
        "no_show",
        "rescheduled",
      ],
      approval_status: [
        "pending",
        "approved",
        "rejected",
        "changes_requested",
        "cancelled",
      ],
      automation_job_status: [
        "queued",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      client_status: ["lead", "prospect", "active", "inactive", "archived"],
      client_type: ["individual", "business", "household", "organization"],
      compliance_case_status: [
        "open",
        "in_review",
        "waiting_on_client",
        "waiting_on_staff",
        "resolved",
        "not_applicable",
        "escalated",
        "closed",
      ],
      compliance_case_type: [
        "due_diligence",
        "identity_verification",
        "fraud_risk",
        "credit_eligibility",
        "filing_status",
        "dependent_eligibility",
        "income_verification",
        "document_sufficiency",
        "quality_review",
        "other",
      ],
      condition_operator: [
        "equals",
        "not_equals",
        "contains",
        "not_contains",
        "greater_than",
        "greater_than_or_equal",
        "less_than",
        "less_than_or_equal",
        "is_empty",
        "is_not_empty",
        "in",
        "not_in",
      ],
      contact_method: ["email", "phone", "sms", "address", "other"],
      contact_type: [
        "personal",
        "business",
        "spouse",
        "authorized_contact",
        "emergency",
        "other",
      ],
      document_access_action: [
        "view",
        "download",
        "upload",
        "replace",
        "rename",
        "move",
        "share",
        "unshare",
        "review",
        "delete",
        "restore",
      ],
      document_request_item_status: [
        "requested",
        "uploaded",
        "under_review",
        "accepted",
        "rejected",
        "waived",
        "not_applicable",
      ],
      document_request_status: [
        "draft",
        "sent",
        "viewed",
        "in_progress",
        "partially_complete",
        "completed",
        "cancelled",
        "expired",
      ],
      document_review_status: [
        "pending",
        "approved",
        "rejected",
        "needs_clarification",
        "duplicate",
        "illegible",
        "wrong_document",
      ],
      document_source: [
        "client_upload",
        "staff_upload",
        "email_import",
        "form_upload",
        "workflow",
        "integration",
        "generated",
      ],
      document_status: [
        "uploaded",
        "processing",
        "available",
        "needs_review",
        "approved",
        "rejected",
        "replaced",
        "archived",
        "deleted",
      ],
      document_visibility: [
        "client_and_staff",
        "staff_only",
        "client_only",
        "shared_office",
        "restricted",
      ],
      efile_event_type: [
        "not_ready",
        "ready",
        "transmitted",
        "accepted",
        "rejected",
        "acknowledged",
        "withdrawn",
      ],
      engagement_efile_status: [
        "not_started",
        "not_applicable",
        "awaiting_authorization",
        "ready",
        "transmitted",
        "accepted",
        "rejected",
        "corrected",
        "paper_filed",
      ],
      engagement_payment_status: [
        "not_required",
        "unpaid",
        "partially_paid",
        "paid",
        "payment_plan",
        "refund_transfer",
        "waived",
      ],
      engagement_priority: ["low", "normal", "high", "urgent"],
      engagement_status: [
        "draft",
        "intake_not_started",
        "intake_in_progress",
        "missing_documents",
        "ready_for_preparation",
        "preparation_in_progress",
        "internal_review",
        "awaiting_payment",
        "awaiting_signature",
        "ready_for_ero",
        "sent_to_tax_software",
        "transmitted_externally",
        "acknowledgement_pending",
        "accepted",
        "rejected",
        "correction_in_progress",
        "completed",
        "cancelled",
        "archived",
        "awaiting_client",
        "documents_requested",
        "in_preparation",
        "preparer_review",
        "reviewer_review",
        "ready_to_file",
        "filed",
        "extended",
        "on_hold",
      ],
      engagement_type: [
        "individual_return",
        "business_return",
        "amended_return",
        "extension",
        "tax_planning",
        "bookkeeping",
        "payroll",
        "other",
        "individual",
        "business",
        "nonprofit",
        "extension_only",
        "notice_resolution",
      ],
      form_component_type: [
        "section",
        "heading",
        "paragraph",
        "text",
        "textarea",
        "number",
        "currency",
        "date",
        "email",
        "phone",
        "address",
        "yes_no",
        "single_choice",
        "multiple_choice",
        "dropdown",
        "file_upload",
        "signature",
        "calculation",
        "repeatable_group",
        "staff_only",
        "divider",
        "percentage",
        "acknowledgment",
        "year",
      ],
      intake_answer_status: [
        "draft",
        "final",
        "needs_clarification",
        "verified",
      ],
      intake_entity_type: [
        "residence",
        "employer",
        "business",
        "rental_property",
        "k1_entity",
        "education_student",
        "childcare_provider",
        "estimated_payment",
        "tax_notice",
        "investment_sale",
        "digital_asset_account",
        "foreign_account",
        "property_sale",
        "retirement_account",
        "other_income",
        "vehicle",
        "bank_account",
        "charitable_contribution",
        "business_owner",
        "fixed_asset",
        "state_filing",
      ],
      intake_revision_reason: [
        "client_edit",
        "staff_edit",
        "changes_requested",
        "reopened",
        "system_update",
        "import",
      ],
      intake_submission_status: [
        "not_started",
        "in_progress",
        "submitted",
        "changes_requested",
        "resubmitted",
        "under_review",
        "approved",
        "rejected",
        "archived",
      ],
      integration_provider: [
        "twilio",
        "resend",
        "zoom",
        "stripe",
        "verexa_signature",
      ],
      invoice_status: [
        "draft",
        "sent",
        "viewed",
        "partially_paid",
        "paid",
        "past_due",
        "void",
        "refunded",
      ],
      lead_status: [
        "new",
        "contacted",
        "consultation_scheduled",
        "consultation_completed",
        "proposal_sent",
        "won",
        "lost",
        "do_not_contact",
      ],
      membership_role: [
        "owner",
        "admin",
        "ero",
        "preparer",
        "reviewer",
        "intake_specialist",
        "document_specialist",
        "billing",
        "seasonal_staff",
        "auditor",
        "client",
      ],
      membership_status: ["invited", "active", "suspended", "removed"],
      outbox_channel: ["sms", "email", "portal", "webhook"],
      outbox_status: [
        "queued",
        "processing",
        "sent",
        "delivered",
        "failed",
        "cancelled",
      ],
      ownership_type: ["workspace_owned", "preparer_owned", "shared"],
      payment_method: [
        "card",
        "ach",
        "cash",
        "check",
        "money_order",
        "refund_transfer",
        "other",
      ],
      payment_record_status: [
        "pending",
        "succeeded",
        "failed",
        "cancelled",
        "refunded",
        "partially_refunded",
      ],
      relationship_status: ["pending", "active", "paused", "ended", "declined"],
      relationship_type: [
        "service_bureau_to_ero",
        "ero_to_preparer",
        "ptin_to_ero",
      ],
      reminder_status: [
        "scheduled",
        "processing",
        "sent",
        "skipped",
        "failed",
        "cancelled",
      ],
      review_result: [
        "pending",
        "pass",
        "fail",
        "needs_clarification",
        "not_applicable",
      ],
      risk_level: ["low", "moderate", "high", "critical"],
      signature_request_status: [
        "draft",
        "sent",
        "viewed",
        "partially_signed",
        "completed",
        "declined",
        "expired",
        "cancelled",
      ],
      signer_status: [
        "pending",
        "sent",
        "viewed",
        "signed",
        "declined",
        "expired",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "paused",
        "cancelled",
        "expired",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: [
        "not_started",
        "in_progress",
        "waiting_on_client",
        "waiting_on_staff",
        "completed",
        "cancelled",
      ],
      tax_return_type: [
        "1040",
        "1040-X",
        "1065",
        "1120",
        "1120-S",
        "1041",
        "706",
        "709",
        "990",
        "941",
        "940",
        "state_individual",
        "state_business",
        "local",
        "other",
      ],
      template_kind: [
        "form",
        "workflow",
        "message",
        "document_request",
        "checklist",
        "engagement",
        "service_package",
        "sop",
      ],
      template_share_permission: [
        "view",
        "use",
        "duplicate",
        "edit",
        "reshare",
        "manage",
      ],
      template_status: ["draft", "published", "archived"],
      template_update_mode: [
        "independent_copy",
        "linked_manual",
        "linked_automatic",
      ],
      template_visibility: [
        "private",
        "workspace",
        "connected_users",
        "connected_offices",
        "organization_network",
        "marketplace",
      ],
      workflow_event_type: [
        "run_started",
        "step_started",
        "step_completed",
        "step_failed",
        "condition_evaluated",
        "approval_requested",
        "approval_resolved",
        "wait_started",
        "wait_released",
        "action_queued",
        "action_completed",
        "run_completed",
        "run_cancelled",
      ],
      workflow_node_type: [
        "start",
        "trigger",
        "condition",
        "task",
        "approval",
        "assignment",
        "wait",
        "email",
        "sms",
        "portal_notification",
        "document_request",
        "status_change",
        "form_assignment",
        "webhook",
        "parallel_split",
        "parallel_join",
        "end",
      ],
      workflow_run_status: [
        "queued",
        "running",
        "waiting",
        "completed",
        "failed",
        "cancelled",
      ],
      workflow_step_status: [
        "pending",
        "ready",
        "running",
        "waiting",
        "completed",
        "skipped",
        "failed",
        "cancelled",
      ],
      workflow_trigger_type: [
        "manual",
        "engagement_created",
        "engagement_status_changed",
        "form_assigned",
        "form_submitted",
        "document_uploaded",
        "document_request_completed",
        "invoice_paid",
        "signature_completed",
        "date_reached",
        "scheduled",
        "client_portal_activated",
        "relationship_created",
      ],
      workspace_status: ["pending", "active", "suspended", "archived"],
      workspace_type: [
        "independent_ptin",
        "ero_office",
        "service_bureau",
        "platform_admin",
      ],
    },
  },
} as const
