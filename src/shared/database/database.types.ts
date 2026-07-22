export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["ai_mode"]
          organization_id: string | null
          state: Database["public"]["Enums"]["record_state"]
          task_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          correlation_id: string
          created_at?: string
          id?: string
          mode: Database["public"]["Enums"]["ai_mode"]
          organization_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          task_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["ai_mode"]
          organization_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          task_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          redacted_content: string
          sender: string
          source_refs: Json
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          redacted_content: string
          sender: string
          source_refs?: Json
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          redacted_content?: string
          sender?: string
          source_refs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_safety_decisions: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message_id: string | null
          outcome: Database["public"]["Enums"]["ai_safety_outcome"]
          policy_version: string
          reason_codes: string[]
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message_id?: string | null
          outcome: Database["public"]["Enums"]["ai_safety_outcome"]
          policy_version: string
          reason_codes?: string[]
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string | null
          outcome?: Database["public"]["Enums"]["ai_safety_outcome"]
          policy_version?: string
          reason_codes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_safety_decisions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_safety_decisions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          completion_tokens: number
          conversation_id: string
          created_at: string
          estimated_cost_microunits: number
          id: string
          latency_ms: number
          model_code: string
          prompt_tokens: number
          provider_code: string
          provider_request_hash: string | null
        }
        Insert: {
          completion_tokens?: number
          conversation_id: string
          created_at?: string
          estimated_cost_microunits?: number
          id?: string
          latency_ms: number
          model_code: string
          prompt_tokens?: number
          provider_code: string
          provider_request_hash?: string | null
        }
        Update: {
          completion_tokens?: number
          conversation_id?: string
          created_at?: string
          estimated_cost_microunits?: number
          id?: string
          latency_ms?: number
          model_code?: string
          prompt_tokens?: number
          provider_code?: string
          provider_request_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_consents: {
        Row: {
          granted: boolean
          id: string
          organization_id: string | null
          policy_version: string
          purpose: string
          recorded_at: string
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          granted: boolean
          id?: string
          organization_id?: string | null
          policy_version: string
          purpose: string
          recorded_at?: string
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          granted?: boolean
          id?: string
          organization_id?: string | null
          policy_version?: string
          purpose?: string
          recorded_at?: string
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          actor_id: string | null
          consent_id: string | null
          correlation_id: string | null
          created_at: string
          event_name: string
          id: string
          occurred_at: string
          organization_id: string | null
          properties: Json
          retention_until: string | null
          schema_version: number
        }
        Insert: {
          actor_id?: string | null
          consent_id?: string | null
          correlation_id?: string | null
          created_at?: string
          event_name: string
          id?: string
          occurred_at?: string
          organization_id?: string | null
          properties?: Json
          retention_until?: string | null
          schema_version: number
        }
        Update: {
          actor_id?: string | null
          consent_id?: string | null
          correlation_id?: string | null
          created_at?: string
          event_name?: string
          id?: string
          occurred_at?: string
          organization_id?: string | null
          properties?: Json
          retention_until?: string | null
          schema_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "analytics_consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_command_receipts: {
        Row: {
          actor_id: string
          attempt_id: string
          cohort_id: string
          completed_at: string
          content_version_id: string
          correlation_id: string
          course_id: string
          created_at: string
          enrollment_id: string
          evidence_id: string | null
          expected_attempt_row_version: number | null
          id: string
          idempotency_key: string
          operation: string
          organization_id: string
          payload_hash: string
          submission_id: string | null
          submission_version_id: string | null
          task_id: string
        }
        Insert: {
          actor_id: string
          attempt_id: string
          cohort_id: string
          completed_at?: string
          content_version_id: string
          correlation_id: string
          course_id: string
          created_at?: string
          enrollment_id: string
          evidence_id?: string | null
          expected_attempt_row_version?: number | null
          id?: string
          idempotency_key: string
          operation: string
          organization_id: string
          payload_hash: string
          submission_id?: string | null
          submission_version_id?: string | null
          task_id: string
        }
        Update: {
          actor_id?: string
          attempt_id?: string
          cohort_id?: string
          completed_at?: string
          content_version_id?: string
          correlation_id?: string
          course_id?: string
          created_at?: string
          enrollment_id?: string
          evidence_id?: string | null
          expected_attempt_row_version?: number | null
          id?: string
          idempotency_key?: string
          operation?: string
          organization_id?: string
          payload_hash?: string
          submission_id?: string | null
          submission_version_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_command_receipts_attempt_fk"
            columns: [
              "attempt_id",
              "organization_id",
              "enrollment_id",
              "actor_id",
              "cohort_id",
              "course_id",
              "content_version_id",
              "task_id",
            ]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: [
              "id",
              "organization_id",
              "enrollment_id",
              "learner_id",
              "cohort_id",
              "course_id",
              "content_version_id",
              "task_id",
            ]
          },
          {
            foreignKeyName: "attempt_command_receipts_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_command_receipts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_command_receipts_submission_version_id_fkey"
            columns: ["submission_version_id"]
            isOneToOne: false
            referencedRelation: "submission_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_drafts: {
        Row: {
          answer_text: string
          attempt_id: string
          client_saved_at: string | null
          created_at: string
          evidence_draft: Json
          row_version: number
          selected_option_ids: string[]
          updated_at: string
        }
        Insert: {
          answer_text?: string
          attempt_id: string
          client_saved_at?: string | null
          created_at?: string
          evidence_draft?: Json
          row_version?: number
          selected_option_ids?: string[]
          updated_at?: string
        }
        Update: {
          answer_text?: string
          attempt_id?: string
          client_saved_at?: string | null
          created_at?: string
          evidence_draft?: Json
          row_version?: number
          selected_option_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_drafts_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_hint_usage: {
        Row: {
          attempt_id: string
          created_at: string
          first_used_at: string
          hint_id: string
          id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          first_used_at?: string
          hint_id: string
          id?: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          first_used_at?: string
          hint_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_hint_usage_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_hint_usage_hint_id_fkey"
            columns: ["hint_id"]
            isOneToOne: false
            referencedRelation: "task_hints"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          accepted_at: string | null
          cohort_id: string
          content_version_id: string
          course_id: string
          created_at: string
          elapsed_seconds: number
          enrollment_id: string
          hint_first_used_at: string | null
          hint_used: boolean
          id: string
          last_activity_at: string
          learner_id: string
          organization_id: string
          row_version: number
          sequence_number: number
          start_idempotency_key: string | null
          started_at: string
          state: Database["public"]["Enums"]["attempt_state"]
          submitted_at: string | null
          task_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          cohort_id: string
          content_version_id: string
          course_id: string
          created_at?: string
          elapsed_seconds?: number
          enrollment_id: string
          hint_first_used_at?: string | null
          hint_used?: boolean
          id?: string
          last_activity_at?: string
          learner_id: string
          organization_id: string
          row_version?: number
          sequence_number?: number
          start_idempotency_key?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["attempt_state"]
          submitted_at?: string | null
          task_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          cohort_id?: string
          content_version_id?: string
          course_id?: string
          created_at?: string
          elapsed_seconds?: number
          enrollment_id?: string
          hint_first_used_at?: string | null
          hint_used?: boolean
          id?: string
          last_activity_at?: string
          learner_id?: string
          organization_id?: string
          row_version?: number
          sequence_number?: number
          start_idempotency_key?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["attempt_state"]
          submitted_at?: string | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_cohort_publication_fk"
            columns: [
              "cohort_id",
              "organization_id",
              "course_id",
              "content_version_id",
            ]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: [
              "id",
              "organization_id",
              "course_id",
              "content_version_id",
            ]
          },
          {
            foreignKeyName: "attempts_enrollment_context_fk"
            columns: [
              "enrollment_id",
              "organization_id",
              "learner_id",
              "cohort_id",
              "course_id",
            ]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: [
              "id",
              "organization_id",
              "learner_id",
              "cohort_id",
              "course_id",
            ]
          },
          {
            foreignKeyName: "attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_task_publication_fk"
            columns: ["task_id", "course_id", "content_version_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "course_id", "content_version_id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          aggregate_id: string | null
          aggregate_type: string
          aggregate_version: number | null
          causation_id: string | null
          consent_basis: string | null
          correlation_id: string
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json
          occurred_at: string
          organization_id: string | null
          user_agent_hash: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          aggregate_id?: string | null
          aggregate_type: string
          aggregate_version?: number | null
          causation_id?: string | null
          consent_basis?: string | null
          correlation_id: string
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          occurred_at?: string
          organization_id?: string | null
          user_agent_hash?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          aggregate_id?: string | null
          aggregate_type?: string
          aggregate_version?: number | null
          causation_id?: string | null
          consent_basis?: string | null
          correlation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          occurred_at?: string
          organization_id?: string | null
          user_agent_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_awards: {
        Row: {
          awarded_at: string
          badge_id: string
          created_at: string
          id: string
          learner_id: string
          source_event_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          created_at?: string
          id?: string
          learner_id: string
          source_event_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          created_at?: string
          id?: string
          learner_id?: string
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "badge_awards_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          code: string
          created_at: string
          descriptions: Json
          id: string
          labels: Json
          organization_id: string | null
          row_version: number
          rule: Json
          rule_version: number
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          descriptions?: Json
          id?: string
          labels: Json
          organization_id?: string | null
          row_version?: number
          rule: Json
          rule_version?: number
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          descriptions?: Json
          id?: string
          labels?: Json
          organization_id?: string | null
          row_version?: number
          rule?: Json
          rule_version?: number
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "badges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          labels: Json
          organization_id: string | null
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          labels?: Json
          organization_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          labels?: Json
          organization_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_events: {
        Row: {
          actor_id: string | null
          certificate_id: string
          created_at: string
          from_state: Database["public"]["Enums"]["certificate_state"] | null
          id: string
          reason: string
          source_event_id: string
          to_state: Database["public"]["Enums"]["certificate_state"]
        }
        Insert: {
          actor_id?: string | null
          certificate_id: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["certificate_state"] | null
          id?: string
          reason: string
          source_event_id: string
          to_state: Database["public"]["Enums"]["certificate_state"]
        }
        Update: {
          actor_id?: string | null
          certificate_id?: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["certificate_state"] | null
          id?: string
          reason?: string
          source_event_id?: string
          to_state?: Database["public"]["Enums"]["certificate_state"]
        }
        Relationships: [
          {
            foreignKeyName: "certificate_events_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          available_at: string | null
          certificate_type: string
          course_id: string | null
          created_at: string
          eligibility_snapshot: Json
          expires_at: string | null
          id: string
          idempotency_key: string
          issued_at: string | null
          issued_by: string | null
          learner_id: string
          media_asset_id: string | null
          organization_id: string
          revoked_at: string | null
          row_version: number
          state: Database["public"]["Enums"]["certificate_state"]
          updated_at: string
          verification_token_hash: string | null
        }
        Insert: {
          available_at?: string | null
          certificate_type?: string
          course_id?: string | null
          created_at?: string
          eligibility_snapshot?: Json
          expires_at?: string | null
          id?: string
          idempotency_key: string
          issued_at?: string | null
          issued_by?: string | null
          learner_id: string
          media_asset_id?: string | null
          organization_id: string
          revoked_at?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["certificate_state"]
          updated_at?: string
          verification_token_hash?: string | null
        }
        Update: {
          available_at?: string | null
          certificate_type?: string
          course_id?: string | null
          created_at?: string
          eligibility_snapshot?: Json
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          issued_at?: string | null
          issued_by?: string | null
          learner_id?: string
          media_asset_id?: string | null
          organization_id?: string
          revoked_at?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["certificate_state"]
          updated_at?: string
          verification_token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_memberships: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          cohort_id: string
          created_at: string
          id: string
          removed_at: string | null
          role: Database["public"]["Enums"]["cohort_member_role"]
          row_version: number
          state: Database["public"]["Enums"]["membership_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          cohort_id: string
          created_at?: string
          id?: string
          removed_at?: string | null
          role: Database["public"]["Enums"]["cohort_member_role"]
          row_version?: number
          state?: Database["public"]["Enums"]["membership_state"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          cohort_id?: string
          created_at?: string
          id?: string
          removed_at?: string | null
          role?: Database["public"]["Enums"]["cohort_member_role"]
          row_version?: number
          state?: Database["public"]["Enums"]["membership_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_memberships_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_schedule_command_receipts: {
        Row: {
          actor_id: string
          aggregate_id: string
          correlation_id: string
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          payload_hash: string
          result: Json
        }
        Insert: {
          actor_id: string
          aggregate_id: string
          correlation_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          payload_hash: string
          result: Json
        }
        Update: {
          actor_id?: string
          aggregate_id?: string
          correlation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          payload_hash?: string
          result?: Json
        }
        Relationships: []
      }
      cohorts: {
        Row: {
          capacity: number | null
          completed_at: string | null
          content_version_id: string | null
          course_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          external_id: string | null
          id: string
          name: string
          organization_id: string
          progression_mode: string
          row_version: number
          source_system: string | null
          starts_at: string | null
          state: Database["public"]["Enums"]["cohort_state"]
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          completed_at?: string | null
          content_version_id?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          external_id?: string | null
          id?: string
          name: string
          organization_id: string
          progression_mode?: string
          row_version?: number
          source_system?: string | null
          starts_at?: string | null
          state?: Database["public"]["Enums"]["cohort_state"]
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          completed_at?: string | null
          content_version_id?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          external_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          progression_mode?: string
          row_version?: number
          source_system?: string | null
          starts_at?: string | null
          state?: Database["public"]["Enums"]["cohort_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohorts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohorts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          created_at: string
          evidence: Json
          granted: boolean
          id: string
          legal_basis: string
          organization_id: string | null
          purpose: string
          recorded_at: string
          text_version: string
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          evidence?: Json
          granted: boolean
          id?: string
          legal_basis: string
          organization_id?: string | null
          purpose: string
          recorded_at?: string
          text_version: string
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          evidence?: Json
          granted?: boolean
          id?: string
          legal_basis?: string
          organization_id?: string | null
          purpose?: string
          recorded_at?: string
          text_version?: string
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reviews: {
        Row: {
          comment: string
          content_fingerprint: string | null
          content_version_id: string
          created_at: string
          decision: string
          expected_content_version_row_version: number | null
          id: string
          reviewer_id: string
        }
        Insert: {
          comment: string
          content_fingerprint?: string | null
          content_version_id: string
          created_at?: string
          decision: string
          expected_content_version_row_version?: number | null
          id?: string
          reviewer_id: string
        }
        Update: {
          comment?: string
          content_fingerprint?: string | null
          content_version_id?: string
          created_at?: string
          decision?: string
          expected_content_version_row_version?: number | null
          id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reviews_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          archive_impact_fingerprint: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          change_summary: string | null
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          row_version: number
          snapshot: Json
          state: Database["public"]["Enums"]["content_version_state"]
          updated_at: string
          version_number: number
        }
        Insert: {
          archive_impact_fingerprint?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          change_summary?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          row_version?: number
          snapshot?: Json
          state?: Database["public"]["Enums"]["content_version_state"]
          updated_at?: string
          version_number: number
        }
        Update: {
          archive_impact_fingerprint?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          change_summary?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          row_version?: number
          snapshot?: Json
          state?: Database["public"]["Enums"]["content_version_state"]
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      content_workflow_receipts: {
        Row: {
          actor_id: string
          content_version_id: string
          correlation_id: string
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          payload_hash: string
          result_row_version: number
          result_state: Database["public"]["Enums"]["content_version_state"]
        }
        Insert: {
          actor_id: string
          content_version_id: string
          correlation_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          payload_hash: string
          result_row_version: number
          result_state: Database["public"]["Enums"]["content_version_state"]
        }
        Update: {
          actor_id?: string
          content_version_id?: string
          correlation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          payload_hash?: string
          result_row_version?: number
          result_state?: Database["public"]["Enums"]["content_version_state"]
        }
        Relationships: [
          {
            foreignKeyName: "content_workflow_receipts_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_feedback: {
        Row: {
          comment: string
          course_id: string
          created_at: string
          enrollment_id: string
          id: string
          learner_id: string
          organization_id: string
          stars: number
          updated_at: string
        }
        Insert: {
          comment?: string
          course_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          learner_id: string
          organization_id: string
          stars: number
          updated_at?: string
        }
        Update: {
          comment?: string
          course_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          learner_id?: string
          organization_id?: string
          stars?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_feedback_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_feedback_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_localizations: {
        Row: {
          completion_video_url: string | null
          course_id: string
          created_at: string
          description_html: string
          exam_video_url: string | null
          id: string
          learning_outcomes: Json
          locale: string
          seo_description: string | null
          seo_title: string | null
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          completion_video_url?: string | null
          course_id: string
          created_at?: string
          description_html: string
          exam_video_url?: string | null
          id?: string
          learning_outcomes?: Json
          locale: string
          seo_description?: string | null
          seo_title?: string | null
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          completion_video_url?: string | null
          course_id?: string
          created_at?: string
          description_html?: string
          exam_video_url?: string | null
          id?: string
          learning_outcomes?: Json
          locale?: string
          seo_description?: string | null
          seo_title?: string | null
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_localizations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_trainers: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          course_id: string
          organization_id: string
          removed_at: string | null
          trainer_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          course_id: string
          organization_id: string
          removed_at?: string | null
          trainer_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          course_id?: string
          organization_id?: string
          removed_at?: string | null
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_trainers_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_trainers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          default_locale: string
          estimated_minutes: number | null
          external_id: string | null
          hero_image_url: string | null
          id: string
          organization_id: string | null
          row_version: number
          slug: string
          source_system: string | null
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          default_locale?: string
          estimated_minutes?: number | null
          external_id?: string | null
          hero_image_url?: string | null
          id?: string
          organization_id?: string | null
          row_version?: number
          slug: string
          source_system?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          default_locale?: string
          estimated_minutes?: number | null
          external_id?: string | null
          hero_image_url?: string | null
          id?: string
          organization_id?: string | null
          row_version?: number
          slug?: string
          source_system?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          idempotency_key: string
          legal_hold_reason: string | null
          organization_id: string | null
          requester_id: string
          row_version: number
          state: Database["public"]["Enums"]["request_state"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          idempotency_key: string
          legal_hold_reason?: string | null
          organization_id?: string | null
          requester_id: string
          row_version?: number
          state?: Database["public"]["Enums"]["request_state"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          idempotency_key?: string
          legal_hold_reason?: string | null
          organization_id?: string | null
          requester_id?: string
          row_version?: number
          state?: Database["public"]["Enums"]["request_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_deletion_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          expires_at: string | null
          export_kind: string
          export_object_key: string | null
          export_sha256_hex: string | null
          filters: Json
          id: string
          idempotency_key: string
          organization_id: string | null
          requester_id: string
          row_version: number
          state: Database["public"]["Enums"]["request_state"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          export_kind?: string
          export_object_key?: string | null
          export_sha256_hex?: string | null
          filters?: Json
          id?: string
          idempotency_key: string
          organization_id?: string | null
          requester_id: string
          row_version?: number
          state?: Database["public"]["Enums"]["request_state"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          export_kind?: string
          export_object_key?: string | null
          export_sha256_hex?: string | null
          filters?: Json
          id?: string
          idempotency_key?: string
          organization_id?: string | null
          requester_id?: string
          row_version?: number
          state?: Database["public"]["Enums"]["request_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_export_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_attempts: {
        Row: {
          attempt_number: number
          channel: string
          created_at: string
          error_code: string | null
          id: string
          next_attempt_at: string | null
          notification_id: string
          outcome: string
          provider_reference: string | null
        }
        Insert: {
          attempt_number: number
          channel: string
          created_at?: string
          error_code?: string | null
          id?: string
          next_attempt_at?: string | null
          notification_id: string
          outcome: string
          provider_reference?: string | null
        }
        Update: {
          attempt_number?: number
          channel?: string
          created_at?: string
          error_code?: string | null
          id?: string
          next_attempt_at?: string | null
          notification_id?: string
          outcome?: string
          provider_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_request_receipts: {
        Row: {
          actor_id: string
          completed_at: string
          course_id: string
          created_at: string
          enrollment_id: string
          id: string
          idempotency_key: string
          organization_id: string
          request_note: string | null
        }
        Insert: {
          actor_id: string
          completed_at?: string
          course_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          idempotency_key: string
          organization_id: string
          request_note?: string | null
        }
        Update: {
          actor_id?: string
          completed_at?: string
          course_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          request_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_request_receipts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_request_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_request_receipts_result_context_fk"
            columns: [
              "enrollment_id",
              "organization_id",
              "actor_id",
              "course_id",
            ]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: [
              "id",
              "organization_id",
              "learner_id",
              "course_id",
            ]
          },
        ]
      }
      enrollments: {
        Row: {
          cohort_id: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          request_note: string | null
          row_version: number
          state: Database["public"]["Enums"]["enrollment_state"]
          updated_at: string
        }
        Insert: {
          cohort_id?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          request_note?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["enrollment_state"]
          updated_at?: string
        }
        Update: {
          cohort_id?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          idempotency_key?: string
          learner_id?: string
          organization_id?: string
          request_note?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["enrollment_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          capability: string
          created_at: string
          id: string
          organization_id: string
          product_package_id: string
          source: string
          source_reference: string | null
          user_id: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          capability: string
          created_at?: string
          id?: string
          organization_id: string
          product_package_id: string
          source?: string
          source_reference?: string | null
          user_id?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          capability?: string
          created_at?: string
          id?: string
          organization_id?: string
          product_package_id?: string
          source?: string
          source_reference?: string | null
          user_id?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_product_package_id_fkey"
            columns: ["product_package_id"]
            isOneToOne: false
            referencedRelation: "product_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          captured_at: string
          created_at: string
          evidence_kind: string
          id: string
          lab_session_id: string | null
          metadata: Json
          organization_id: string
          owner_id: string
          retention_until: string | null
          sha256_hex: string
          source_uri: string | null
          submission_version_id: string | null
          task_id: string | null
          title: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          evidence_kind: string
          id?: string
          lab_session_id?: string | null
          metadata?: Json
          organization_id: string
          owner_id: string
          retention_until?: string | null
          sha256_hex: string
          source_uri?: string | null
          submission_version_id?: string | null
          task_id?: string | null
          title: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          evidence_kind?: string
          id?: string
          lab_session_id?: string | null
          metadata?: Json
          organization_id?: string
          owner_id?: string
          retention_until?: string | null
          sha256_hex?: string
          source_uri?: string | null
          submission_version_id?: string | null
          task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_lab_session_fkey"
            columns: ["lab_session_id"]
            isOneToOne: false
            referencedRelation: "lab_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_submission_version_id_fkey"
            columns: ["submission_version_id"]
            isOneToOne: false
            referencedRelation: "submission_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_artifacts: {
        Row: {
          artifact_role: string
          created_at: string
          evidence_id: string
          id: string
          media_asset_id: string
        }
        Insert: {
          artifact_role: string
          created_at?: string
          evidence_id: string
          id?: string
          media_asset_id: string
        }
        Update: {
          artifact_role?: string
          created_at?: string
          evidence_id?: string
          id?: string
          media_asset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_artifacts_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_artifacts_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_upload_command_receipts: {
        Row: {
          actor_id: string
          attempt_id: string
          completed_at: string
          correlation_id: string
          created_at: string
          evidence_id: string | null
          expected_draft_version: number | null
          id: string
          idempotency_key: string
          operation: string
          payload_hash: string
          result_draft_version: number | null
          upload_id: string
        }
        Insert: {
          actor_id: string
          attempt_id: string
          completed_at?: string
          correlation_id: string
          created_at?: string
          evidence_id?: string | null
          expected_draft_version?: number | null
          id?: string
          idempotency_key: string
          operation: string
          payload_hash: string
          result_draft_version?: number | null
          upload_id: string
        }
        Update: {
          actor_id?: string
          attempt_id?: string
          completed_at?: string
          correlation_id?: string
          created_at?: string
          evidence_id?: string | null
          expected_draft_version?: number | null
          id?: string
          idempotency_key?: string
          operation?: string
          payload_hash?: string
          result_draft_version?: number | null
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_upload_command_receipts_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_upload_receipts_upload_context_fk"
            columns: ["upload_id", "actor_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "evidence_uploads"
            referencedColumns: ["id", "owner_id", "attempt_id"]
          },
        ]
      }
      evidence_uploads: {
        Row: {
          attempt_id: string
          bucket_id: string
          cleanup_attempt_count: number
          cleanup_available_at: string | null
          cleanup_claim_token: string | null
          cleanup_claimed_at: string | null
          cleanup_claimed_by: string | null
          cleanup_last_error_code: string | null
          cleanup_lease_expires_at: string | null
          client_sha256: string
          cohort_id: string
          content_version_id: string
          correlation_id: string
          course_id: string
          created_at: string
          declared_byte_size: number
          declared_mime_type: string
          enrollment_id: string
          evidence_id: string | null
          expired_at: string | null
          expires_at: string
          finalized_at: string | null
          id: string
          idempotency_key: string
          media_asset_id: string | null
          object_key: string
          organization_id: string
          original_file_name: string
          owner_id: string
          rejected_at: string | null
          rejection_code: string | null
          removed_at: string | null
          row_version: number
          state: Database["public"]["Enums"]["evidence_upload_state"]
          storage_deleted_at: string | null
          task_id: string
          title: string
          updated_at: string
          verified_byte_size: number | null
          verified_mime_type: string | null
          verified_sha256: string | null
        }
        Insert: {
          attempt_id: string
          bucket_id?: string
          cleanup_attempt_count?: number
          cleanup_available_at?: string | null
          cleanup_claim_token?: string | null
          cleanup_claimed_at?: string | null
          cleanup_claimed_by?: string | null
          cleanup_last_error_code?: string | null
          cleanup_lease_expires_at?: string | null
          client_sha256: string
          cohort_id: string
          content_version_id: string
          correlation_id: string
          course_id: string
          created_at?: string
          declared_byte_size: number
          declared_mime_type: string
          enrollment_id: string
          evidence_id?: string | null
          expired_at?: string | null
          expires_at: string
          finalized_at?: string | null
          id?: string
          idempotency_key: string
          media_asset_id?: string | null
          object_key: string
          organization_id: string
          original_file_name: string
          owner_id: string
          rejected_at?: string | null
          rejection_code?: string | null
          removed_at?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["evidence_upload_state"]
          storage_deleted_at?: string | null
          task_id: string
          title: string
          updated_at?: string
          verified_byte_size?: number | null
          verified_mime_type?: string | null
          verified_sha256?: string | null
        }
        Update: {
          attempt_id?: string
          bucket_id?: string
          cleanup_attempt_count?: number
          cleanup_available_at?: string | null
          cleanup_claim_token?: string | null
          cleanup_claimed_at?: string | null
          cleanup_claimed_by?: string | null
          cleanup_last_error_code?: string | null
          cleanup_lease_expires_at?: string | null
          client_sha256?: string
          cohort_id?: string
          content_version_id?: string
          correlation_id?: string
          course_id?: string
          created_at?: string
          declared_byte_size?: number
          declared_mime_type?: string
          enrollment_id?: string
          evidence_id?: string | null
          expired_at?: string | null
          expires_at?: string
          finalized_at?: string | null
          id?: string
          idempotency_key?: string
          media_asset_id?: string | null
          object_key?: string
          organization_id?: string
          original_file_name?: string
          owner_id?: string
          rejected_at?: string | null
          rejection_code?: string | null
          removed_at?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["evidence_upload_state"]
          storage_deleted_at?: string | null
          task_id?: string
          title?: string
          updated_at?: string
          verified_byte_size?: number | null
          verified_mime_type?: string | null
          verified_sha256?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_uploads_attempt_context_fk"
            columns: [
              "attempt_id",
              "organization_id",
              "enrollment_id",
              "owner_id",
              "cohort_id",
              "course_id",
              "content_version_id",
              "task_id",
            ]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: [
              "id",
              "organization_id",
              "enrollment_id",
              "learner_id",
              "cohort_id",
              "course_id",
              "content_version_id",
              "task_id",
            ]
          },
          {
            foreignKeyName: "evidence_uploads_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: true
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_uploads_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: true
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      external_id_mappings: {
        Row: {
          canonical_id: string
          created_at: string
          entity_type: string
          external_id: string
          id: string
          migrated_at: string
          source_checksum: string | null
          source_system: string
        }
        Insert: {
          canonical_id: string
          created_at?: string
          entity_type: string
          external_id: string
          id?: string
          migrated_at?: string
          source_checksum?: string | null
          source_system: string
        }
        Update: {
          canonical_id?: string
          created_at?: string
          entity_type?: string
          external_id?: string
          id?: string
          migrated_at?: string
          source_checksum?: string | null
          source_system?: string
        }
        Relationships: []
      }
      hunt_findings: {
        Row: {
          attempt_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          organization_id: string | null
          planted_code: string | null
          reported_details: Json
          reported_summary: string
          row_version: number
          scenario_id: string | null
          severity: string | null
          submission_id: string | null
          updated_at: string
          verdict: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          organization_id?: string | null
          planted_code?: string | null
          reported_details?: Json
          reported_summary?: string
          row_version?: number
          scenario_id?: string | null
          severity?: string | null
          submission_id?: string | null
          updated_at?: string
          verdict?: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          organization_id?: string | null
          planted_code?: string | null
          reported_details?: Json
          reported_summary?: string
          row_version?: number
          scenario_id?: string | null
          severity?: string | null
          submission_id?: string | null
          updated_at?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunt_findings_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_findings_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hunt_findings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_findings_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "hunt_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_findings_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_scenario_defects: {
        Row: {
          code: string
          created_at: string
          expected_behaviour: string
          id: string
          location_hint: string
          position: number
          reproduction: string
          scenario_id: string
          severity: string
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          expected_behaviour?: string
          id?: string
          location_hint?: string
          position?: number
          reproduction?: string
          scenario_id: string
          severity?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          expected_behaviour?: string
          id?: string
          location_hint?: string
          position?: number
          reproduction?: string
          scenario_id?: string
          severity?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunt_scenario_defects_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "hunt_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_scenarios: {
        Row: {
          code: string
          configuration: Json
          created_at: string
          description: string
          end_media_url: string | null
          expected_findings: number
          html: string | null
          id: string
          organization_id: string | null
          reward_badge_id: string | null
          row_version: number
          scenario_version: number
          start_media_url: string | null
          state: Database["public"]["Enums"]["record_state"]
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          configuration?: Json
          created_at?: string
          description?: string
          end_media_url?: string | null
          expected_findings?: number
          html?: string | null
          id?: string
          organization_id?: string | null
          reward_badge_id?: string | null
          row_version?: number
          scenario_version?: number
          start_media_url?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          configuration?: Json
          created_at?: string
          description?: string
          end_media_url?: string | null
          expected_findings?: number
          html?: string | null
          id?: string
          organization_id?: string | null
          reward_badge_id?: string | null
          row_version?: number
          scenario_version?: number
          start_media_url?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunt_scenarios_reward_badge_id_fkey"
            columns: ["reward_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_scenarios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          actor_user_id: string
          correlation_id: string
          ended_at: string | null
          expires_at: string
          id: string
          organization_id: string | null
          reason: string
          started_at: string
          subject_user_id: string | null
          viewed_role_id: string
        }
        Insert: {
          actor_user_id: string
          correlation_id: string
          ended_at?: string | null
          expires_at: string
          id?: string
          organization_id?: string | null
          reason: string
          started_at?: string
          subject_user_id?: string | null
          viewed_role_id: string
        }
        Update: {
          actor_user_id?: string
          correlation_id?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          organization_id?: string | null
          reason?: string
          started_at?: string
          subject_user_id?: string | null
          viewed_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_viewed_role_id_fkey"
            columns: ["viewed_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_checkpoints: {
        Row: {
          checkpoint_value: string
          connection_id: string
          last_delivery_id: string | null
          stream_name: string
          updated_at: string
        }
        Insert: {
          checkpoint_value: string
          connection_id: string
          last_delivery_id?: string | null
          stream_name: string
          updated_at?: string
        }
        Update: {
          checkpoint_value?: string
          connection_id?: string
          last_delivery_id?: string | null
          stream_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_checkpoints_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_checkpoints_last_delivery_id_fkey"
            columns: ["last_delivery_id"]
            isOneToOne: false
            referencedRelation: "integration_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          configuration_redacted: Json
          created_at: string
          id: string
          name: string
          organization_id: string
          provider_kind: string
          row_version: number
          secret_reference: string | null
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          configuration_redacted?: Json
          created_at?: string
          id?: string
          name: string
          organization_id: string
          provider_kind: string
          row_version?: number
          secret_reference?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          configuration_redacted?: Json
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          provider_kind?: string
          row_version?: number
          secret_reference?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_deliveries: {
        Row: {
          acknowledged_at: string | null
          attempt_count: number
          connection_id: string
          created_at: string
          id: string
          idempotency_key: string
          last_error_code: string | null
          last_error_redacted: string | null
          next_attempt_at: string | null
          outbox_event_id: string
          row_version: number
          state: Database["public"]["Enums"]["delivery_state"]
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          attempt_count?: number
          connection_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          last_error_redacted?: string | null
          next_attempt_at?: string | null
          outbox_event_id: string
          row_version?: number
          state?: Database["public"]["Enums"]["delivery_state"]
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          attempt_count?: number
          connection_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          last_error_redacted?: string | null
          next_attempt_at?: string | null
          outbox_event_id?: string
          row_version?: number
          state?: Database["public"]["Enums"]["delivery_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_deliveries_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_deliveries_outbox_event_id_fkey"
            columns: ["outbox_event_id"]
            isOneToOne: false
            referencedRelation: "outbox_events"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_definitions: {
        Row: {
          code: string
          configuration: Json
          created_at: string
          id: string
          labels: Json
          organization_id: string | null
          provider_kind: string
          retention_seconds: number
          scenario_version: string
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          code: string
          configuration?: Json
          created_at?: string
          id?: string
          labels: Json
          organization_id?: string | null
          provider_kind?: string
          retention_seconds?: number
          scenario_version: string
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          code?: string
          configuration?: Json
          created_at?: string
          id?: string
          labels?: Json
          organization_id?: string | null
          provider_kind?: string
          retention_seconds?: number
          scenario_version?: string
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_leases: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          issued_at: string
          lab_session_id: string
          lease_hash: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          issued_at?: string
          lab_session_id: string
          lease_hash: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          issued_at?: string
          lab_session_id?: string
          lease_hash?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_leases_lab_session_id_fkey"
            columns: ["lab_session_id"]
            isOneToOne: true
            referencedRelation: "lab_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_sessions: {
        Row: {
          attempt_id: string | null
          destroyed_at: string | null
          expires_at: string | null
          failure_code: string | null
          failure_detail_redacted: string | null
          id: string
          idempotency_key: string
          lab_definition_id: string
          learner_id: string
          organization_id: string
          provider_reference: string | null
          ready_at: string | null
          requested_at: string
          row_version: number
          state: Database["public"]["Enums"]["lab_session_state"]
          updated_at: string
        }
        Insert: {
          attempt_id?: string | null
          destroyed_at?: string | null
          expires_at?: string | null
          failure_code?: string | null
          failure_detail_redacted?: string | null
          id?: string
          idempotency_key: string
          lab_definition_id: string
          learner_id: string
          organization_id: string
          provider_reference?: string | null
          ready_at?: string | null
          requested_at?: string
          row_version?: number
          state?: Database["public"]["Enums"]["lab_session_state"]
          updated_at?: string
        }
        Update: {
          attempt_id?: string | null
          destroyed_at?: string | null
          expires_at?: string | null
          failure_code?: string | null
          failure_detail_redacted?: string | null
          id?: string
          idempotency_key?: string
          lab_definition_id?: string
          learner_id?: string
          organization_id?: string
          provider_reference?: string | null
          ready_at?: string | null
          requested_at?: string
          row_version?: number
          state?: Database["public"]["Enums"]["lab_session_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_sessions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_sessions_lab_definition_id_fkey"
            columns: ["lab_definition_id"]
            isOneToOne: false
            referencedRelation: "lab_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_preferences: {
        Row: {
          alias: string | null
          learner_id: string
          opted_in: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          alias?: string | null
          learner_id: string
          opted_in?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          alias?: string | null
          learner_id?: string
          opted_in?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_account_command_receipts: {
        Row: {
          actor_id: string
          aggregate_id: string | null
          correlation_id: string
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          payload_hash: string
          result: Json
        }
        Insert: {
          actor_id: string
          aggregate_id?: string | null
          correlation_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          payload_hash: string
          result: Json
        }
        Update: {
          actor_id?: string
          aggregate_id?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          payload_hash?: string
          result?: Json
        }
        Relationships: []
      }
      learner_streaks: {
        Row: {
          created_at: string
          current_length: number
          freeze_period_start: string | null
          freezes_used: number
          last_activity_date: string | null
          learner_id: string
          longest_length: number
          organization_id: string
          row_version: number
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_length?: number
          freeze_period_start?: string | null
          freezes_used?: number
          last_activity_date?: string | null
          learner_id: string
          longest_length?: number
          organization_id: string
          row_version?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_length?: number
          freeze_period_start?: string | null
          freezes_used?: number
          last_activity_date?: string | null
          learner_id?: string
          longest_length?: number
          organization_id?: string
          row_version?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_streaks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_trainers: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          learner_id: string
          organization_id: string
          removed_at: string | null
          trainer_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          learner_id: string
          organization_id: string
          removed_at?: string | null
          trainer_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          learner_id?: string
          organization_id?: string
          removed_at?: string | null
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_trainers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_path_items: {
        Row: {
          condition_rule: Json
          course_id: string | null
          created_at: string
          id: string
          learning_path_id: string
          position: number
          task_id: string | null
        }
        Insert: {
          condition_rule?: Json
          course_id?: string | null
          created_at?: string
          id?: string
          learning_path_id: string
          position: number
          task_id?: string | null
        }
        Update: {
          condition_rule?: Json
          course_id?: string | null
          created_at?: string
          id?: string
          learning_path_id?: string
          position?: number
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_path_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_path_items_learning_path_id_fkey"
            columns: ["learning_path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_path_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          row_version: number
          rule_version: number
          state: Database["public"]["Enums"]["record_state"]
          title: Json
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          row_version?: number
          rule_version?: number
          state?: Database["public"]["Enums"]["record_state"]
          title: Json
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          row_version?: number
          rule_version?: number
          state?: Database["public"]["Enums"]["record_state"]
          title?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mastery_events: {
        Row: {
          created_at: string
          evidence_id: string | null
          id: string
          learner_id: string
          new_basis_points: number
          organization_id: string
          previous_basis_points: number
          rationale: string
          recorded_at: string
          rule_version: number
          skill_id: string
          source_event_id: string
        }
        Insert: {
          created_at?: string
          evidence_id?: string | null
          id?: string
          learner_id: string
          new_basis_points: number
          organization_id: string
          previous_basis_points: number
          rationale: string
          recorded_at?: string
          rule_version: number
          skill_id: string
          source_event_id: string
        }
        Update: {
          created_at?: string
          evidence_id?: string | null
          id?: string
          learner_id?: string
          new_basis_points?: number
          organization_id?: string
          previous_basis_points?: number
          rationale?: string
          recorded_at?: string
          rule_version?: number
          skill_id?: string
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_events_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_events_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      mastery_snapshots: {
        Row: {
          learner_id: string
          mastery_basis_points: number
          organization_id: string
          rule_version: number
          skill_id: string
          source_event_id: string
          updated_at: string
        }
        Insert: {
          learner_id: string
          mastery_basis_points: number
          organization_id: string
          rule_version: number
          skill_id: string
          source_event_id: string
          updated_at?: string
        }
        Update: {
          learner_id?: string
          mastery_basis_points?: number
          organization_id?: string
          rule_version?: number
          skill_id?: string
          source_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_snapshots_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_snapshots_source_scope_fk"
            columns: [
              "source_event_id",
              "organization_id",
              "learner_id",
              "skill_id",
            ]
            isOneToOne: false
            referencedRelation: "mastery_events"
            referencedColumns: [
              "id",
              "organization_id",
              "learner_id",
              "skill_id",
            ]
          },
        ]
      }
      media_assets: {
        Row: {
          byte_size: number
          content_version_id: string | null
          course_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          media_kind: string
          mime_type: string
          object_key: string
          organization_id: string | null
          owner_id: string | null
          sha256_hex: string
          stage_id: string | null
          state: Database["public"]["Enums"]["record_state"]
        }
        Insert: {
          byte_size: number
          content_version_id?: string | null
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          media_kind: string
          mime_type: string
          object_key: string
          organization_id?: string | null
          owner_id?: string | null
          sha256_hex: string
          stage_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
        }
        Update: {
          byte_size?: number
          content_version_id?: string | null
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          media_kind?: string
          mime_type?: string
          object_key?: string
          organization_id?: string | null
          owner_id?: string | null
          sha256_hex?: string
          stage_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_version_course_fk"
            columns: ["content_version_id", "course_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id", "course_id"]
          },
        ]
      }
      mission_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          learner_id: string
          mission_id: string
          progress: Json
          row_version: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          learner_id: string
          mission_id: string
          progress?: Json
          row_version?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          learner_id?: string
          mission_id?: string
          progress?: Json
          row_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_progress_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          code: string
          created_at: string
          ends_at: string | null
          id: string
          labels: Json
          organization_id: string
          row_version: number
          rule: Json
          rule_version: number
          starts_at: string | null
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          ends_at?: string | null
          id?: string
          labels: Json
          organization_id: string
          row_version?: number
          rule: Json
          rule_version?: number
          starts_at?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          labels?: Json
          organization_id?: string
          row_version?: number
          rule?: Json
          rule_version?: number
          starts_at?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          enabled: boolean
          event_family: string
          row_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          enabled?: boolean
          event_family: string
          row_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          event_family?: string
          row_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          cancelled_at: string | null
          created_at: string
          deduplication_key: string
          delivered_at: string | null
          event_type: string
          id: string
          organization_id: string | null
          payload: Json
          read_at: string | null
          recipient_id: string
          row_version: number
          state: Database["public"]["Enums"]["notification_state"]
          template_key: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          deduplication_key: string
          delivered_at?: string | null
          event_type: string
          id?: string
          organization_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id: string
          row_version?: number
          state?: Database["public"]["Enums"]["notification_state"]
          template_key: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          deduplication_key?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          organization_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          row_version?: number
          state?: Database["public"]["Enums"]["notification_state"]
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          removed_at: string | null
          row_version: number
          state: Database["public"]["Enums"]["membership_state"]
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          removed_at?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["membership_state"]
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          removed_at?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["membership_state"]
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          archived_at: string | null
          created_at: string
          data_residency_region: string | null
          external_id: string | null
          id: string
          is_default: boolean
          name: string
          row_version: number
          slug: string
          source_system: string | null
          state: Database["public"]["Enums"]["organization_state"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          data_residency_region?: string | null
          external_id?: string | null
          id?: string
          is_default?: boolean
          name: string
          row_version?: number
          slug: string
          source_system?: string | null
          state?: Database["public"]["Enums"]["organization_state"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          data_residency_region?: string | null
          external_id?: string | null
          id?: string
          is_default?: boolean
          name?: string
          row_version?: number
          slug?: string
          source_system?: string | null
          state?: Database["public"]["Enums"]["organization_state"]
          updated_at?: string
        }
        Relationships: []
      }
      outbox_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          aggregate_version: number
          attempt_count: number
          available_at: string
          causation_id: string | null
          claimed_at: string | null
          correlation_id: string
          created_at: string
          event_type: string
          id: string
          last_error_code: string | null
          organization_id: string | null
          payload: Json
          processed_at: string | null
          schema_version: number
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          aggregate_version: number
          attempt_count?: number
          available_at?: string
          causation_id?: string | null
          claimed_at?: string | null
          correlation_id: string
          created_at?: string
          event_type: string
          id?: string
          last_error_code?: string | null
          organization_id?: string | null
          payload: Json
          processed_at?: string | null
          schema_version: number
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          aggregate_version?: number
          attempt_count?: number
          available_at?: string
          causation_id?: string | null
          claimed_at?: string | null
          correlation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error_code?: string | null
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          schema_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      path_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          learner_id: string
          learning_path_id: string
          organization_id: string
          override_reason: string | null
          rationale: string
          row_version: number
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          learner_id: string
          learning_path_id: string
          organization_id: string
          override_reason?: string | null
          rationale: string
          row_version?: number
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          learner_id?: string
          learning_path_id?: string
          organization_id?: string
          override_reason?: string | null
          rationale?: string
          row_version?: number
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "path_assignments_learning_path_id_fkey"
            columns: ["learning_path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "path_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
        }
        Relationships: []
      }
      placement_assessments: {
        Row: {
          code: string
          created_at: string
          id: string
          labels: Json
          organization_id: string
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          labels: Json
          organization_id: string
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          labels?: Json
          organization_id?: string
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "placement_assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      placement_attempts: {
        Row: {
          assessment_id: string
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          responses: Json
          result: Json | null
          row_version: number
          started_at: string
          state: Database["public"]["Enums"]["attempt_state"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          id?: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          responses?: Json
          result?: Json | null
          row_version?: number
          started_at?: string
          state?: Database["public"]["Enums"]["attempt_state"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          id?: string
          idempotency_key?: string
          learner_id?: string
          organization_id?: string
          responses?: Json
          result?: Json | null
          row_version?: number
          started_at?: string
          state?: Database["public"]["Enums"]["attempt_state"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_attempts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "placement_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      placement_items: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          position: number
          skill_id: string
          task_id: string
          weight_basis_points: number
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          position: number
          skill_id: string
          task_id: string
          weight_basis_points: number
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          position?: number
          skill_id?: string
          task_id?: string
          weight_basis_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "placement_items_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "placement_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_items_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          created_at: string
          evidence_id: string
          id: string
          portfolio_id: string
          position: number
          reflection: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          id?: string
          portfolio_id: string
          position: number
          reflection?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          id?: string
          portfolio_id?: string
          position?: number
          reflection?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_items_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_publications: {
        Row: {
          expires_at: string | null
          id: string
          portfolio_id: string
          published_at: string
          published_by: string
          revoked_at: string | null
          snapshot: Json
          verifier_token_hash: string
          version_number: number
        }
        Insert: {
          expires_at?: string | null
          id?: string
          portfolio_id: string
          published_at?: string
          published_by: string
          revoked_at?: string | null
          snapshot: Json
          verifier_token_hash: string
          version_number: number
        }
        Update: {
          expires_at?: string | null
          id?: string
          portfolio_id?: string
          published_at?: string
          published_by?: string
          revoked_at?: string | null
          snapshot?: Json
          verifier_token_hash?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_publications_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string
          id: string
          learner_id: string
          organization_id: string
          row_version: number
          summary: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          learner_id: string
          organization_id: string
          row_version?: number
          summary?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          learner_id?: string
          organization_id?: string
          row_version?: number
          summary?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prerequisites: {
        Row: {
          created_at: string
          id: string
          learning_path_id: string | null
          minimum_mastery_basis_points: number | null
          organization_id: string | null
          required_skill_id: string | null
          required_task_id: string | null
          rule_version: number
          target_task_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          learning_path_id?: string | null
          minimum_mastery_basis_points?: number | null
          organization_id?: string | null
          required_skill_id?: string | null
          required_task_id?: string | null
          rule_version?: number
          target_task_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          learning_path_id?: string | null
          minimum_mastery_basis_points?: number | null
          organization_id?: string | null
          required_skill_id?: string | null
          required_task_id?: string | null
          rule_version?: number
          target_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prerequisites_learning_path_id_fkey"
            columns: ["learning_path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prerequisites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prerequisites_required_skill_id_fkey"
            columns: ["required_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prerequisites_required_task_id_fkey"
            columns: ["required_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prerequisites_target_task_id_fkey"
            columns: ["target_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      product_packages: {
        Row: {
          capabilities: string[]
          code: string
          created_at: string
          id: string
          labels: Json
          organization_id: string | null
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          capabilities?: string[]
          code: string
          created_at?: string
          id?: string
          labels: Json
          organization_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          capabilities?: string[]
          code?: string
          created_at?: string
          id?: string
          labels?: Json
          organization_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_object_key: string | null
          created_at: string
          deactivated_at: string | null
          display_name: string
          external_id: string | null
          last_seen_at: string | null
          locale: string
          row_version: number
          source_system: string | null
          state: Database["public"]["Enums"]["record_state"]
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_object_key?: string | null
          created_at?: string
          deactivated_at?: string | null
          display_name?: string
          external_id?: string | null
          last_seen_at?: string | null
          locale?: string
          row_version?: number
          source_system?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_object_key?: string | null
          created_at?: string
          deactivated_at?: string | null
          display_name?: string
          external_id?: string | null
          last_seen_at?: string | null
          locale?: string
          row_version?: number
          source_system?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      question_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          idempotency_key: string | null
          message_kind: string
          question_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          message_kind?: string
          question_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          message_kind?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_messages_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_transfers: {
        Row: {
          created_at: string
          from_trainer_id: string
          id: string
          idempotency_key: string
          question_id: string
          reason: string
          to_trainer_id: string
        }
        Insert: {
          created_at?: string
          from_trainer_id: string
          id?: string
          idempotency_key: string
          question_id: string
          reason: string
          to_trainer_id: string
        }
        Update: {
          created_at?: string
          from_trainer_id?: string
          id?: string
          idempotency_key?: string
          question_id?: string
          reason?: string
          to_trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_transfers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          answered_at: string | null
          archived_at: string | null
          assigned_trainer_id: string | null
          cohort_id: string
          content_version_id: string
          created_at: string
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["question_state"]
          subject: string
          task_id: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          archived_at?: string | null
          assigned_trainer_id?: string | null
          cohort_id: string
          content_version_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          row_version?: number
          state?: Database["public"]["Enums"]["question_state"]
          subject: string
          task_id: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          archived_at?: string | null
          assigned_trainer_id?: string | null
          cohort_id?: string
          content_version_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          learner_id?: string
          organization_id?: string
          row_version?: number
          state?: Database["public"]["Enums"]["question_state"]
          subject?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_task_version_fk"
            columns: ["task_id", "content_version_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "content_version_id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          approved_by: string | null
          created_at: string
          data_class: string
          effective_from: string
          effective_until: string | null
          id: string
          legal_hold_enabled: boolean
          organization_id: string | null
          policy_version: string
          retention_days: number
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          data_class: string
          effective_from: string
          effective_until?: string | null
          id?: string
          legal_hold_enabled?: boolean
          organization_id?: string | null
          policy_version: string
          retention_days: number
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          data_class?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          legal_hold_enabled?: boolean
          organization_id?: string | null
          policy_version?: string
          retention_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "retention_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      review_rubric_scores: {
        Row: {
          comment: string | null
          created_at: string
          criterion_id: string
          id: string
          points: number
          review_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          criterion_id: string
          id?: string
          points: number
          review_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          criterion_id?: string
          id?: string
          points?: number
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_rubric_scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "rubric_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_rubric_scores_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_transfers: {
        Row: {
          created_at: string
          expected_submission_row_version: number
          from_trainer_id: string
          id: string
          idempotency_key: string
          organization_id: string
          reason: string
          submission_id: string
          to_trainer_id: string
        }
        Insert: {
          created_at?: string
          expected_submission_row_version: number
          from_trainer_id: string
          id?: string
          idempotency_key: string
          organization_id: string
          reason: string
          submission_id: string
          to_trainer_id: string
        }
        Update: {
          created_at?: string
          expected_submission_row_version?: number
          from_trainer_id?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          reason?: string
          submission_id?: string
          to_trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_transfers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string
          created_at: string
          decision: Database["public"]["Enums"]["review_decision"]
          expected_submission_row_version: number
          id: string
          idempotency_key: string
          organization_id: string
          reviewer_id: string
          submission_id: string
          submission_version_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          decision: Database["public"]["Enums"]["review_decision"]
          expected_submission_row_version: number
          id?: string
          idempotency_key: string
          organization_id: string
          reviewer_id: string
          submission_id: string
          submission_version_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["review_decision"]
          expected_submission_row_version?: number
          id?: string
          idempotency_key?: string
          organization_id?: string
          reviewer_id?: string
          submission_id?: string
          submission_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_submission_version_id_fkey"
            columns: ["submission_version_id"]
            isOneToOne: true
            referencedRelation: "submission_versions"
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
          code: string
          created_at: string
          description: string
          id: string
          is_system: boolean
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
          is_system?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
        }
        Relationships: []
      }
      rubric_criteria: {
        Row: {
          code: string
          created_at: string
          id: string
          labels: Json
          max_points: number
          position: number
          required_for_acceptance: boolean
          rubric_id: string
          skill_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          labels: Json
          max_points: number
          position: number
          required_for_acceptance?: boolean
          rubric_id: string
          skill_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          labels?: Json
          max_points?: number
          position?: number
          required_for_acceptance?: boolean
          rubric_id?: string
          skill_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rubric_criteria_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubric_criteria_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      rubrics: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          labels: Json
          organization_id: string | null
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          labels: Json
          organization_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          labels?: Json
          organization_id?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_edges: {
        Row: {
          child_skill_id: string
          created_at: string
          id: string
          parent_skill_id: string
          relation: string
        }
        Insert: {
          child_skill_id: string
          created_at?: string
          id?: string
          parent_skill_id: string
          relation: string
        }
        Update: {
          child_skill_id?: string
          created_at?: string
          id?: string
          parent_skill_id?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_edges_child_skill_id_fkey"
            columns: ["child_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_edges_parent_skill_id_fkey"
            columns: ["parent_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          code: string
          created_at: string
          descriptions: Json
          id: string
          labels: Json
          organization_id: string | null
          row_version: number
          state: Database["public"]["Enums"]["record_state"]
          taxonomy_version: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          descriptions?: Json
          id?: string
          labels: Json
          organization_id?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["record_state"]
          taxonomy_version?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          descriptions?: Json
          id?: string
          labels?: Json
          organization_id?: string | null
          row_version?: number
          state?: Database["public"]["Enums"]["record_state"]
          taxonomy_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_localizations: {
        Row: {
          created_at: string
          description_html: string
          id: string
          locale: string
          stage_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_html?: string
          id?: string
          locale: string
          stage_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_html?: string
          id?: string
          locale?: string
          stage_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_localizations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          content_version_id: string | null
          course_id: string
          created_at: string
          external_id: string | null
          id: string
          position: number
          row_version: number
          source_system: string | null
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          content_version_id?: string | null
          course_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          position: number
          row_version?: number
          source_system?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          content_version_id?: string | null
          course_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          position?: number
          row_version?: number
          source_system?: string | null
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stages_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stages_version_course_fk"
            columns: ["content_version_id", "course_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id", "course_id"]
          },
        ]
      }
      submission_answers: {
        Row: {
          answer_text: string | null
          created_at: string
          id: string
          submission_version_id: string
          task_option_id: string | null
        }
        Insert: {
          answer_text?: string | null
          created_at?: string
          id?: string
          submission_version_id: string
          task_option_id?: string | null
        }
        Update: {
          answer_text?: string | null
          created_at?: string
          id?: string
          submission_version_id?: string
          task_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_answers_submission_version_id_fkey"
            columns: ["submission_version_id"]
            isOneToOne: false
            referencedRelation: "submission_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_answers_task_option_id_fkey"
            columns: ["task_option_id"]
            isOneToOne: false
            referencedRelation: "task_options"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_version_evidence: {
        Row: {
          created_at: string
          evidence_id: string
          learner_id: string
          organization_id: string
          position: number
          submission_id: string
          submission_version_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          learner_id: string
          organization_id: string
          position: number
          submission_id: string
          submission_version_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          learner_id?: string
          organization_id?: string
          position?: number
          submission_id?: string
          submission_version_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_version_evidence_evidence_fk"
            columns: ["evidence_id", "organization_id", "learner_id", "task_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id", "organization_id", "owner_id", "task_id"]
          },
          {
            foreignKeyName: "submission_version_evidence_submission_fk"
            columns: [
              "submission_id",
              "organization_id",
              "learner_id",
              "task_id",
            ]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: [
              "id",
              "organization_id",
              "learner_id",
              "task_id",
            ]
          },
          {
            foreignKeyName: "submission_version_evidence_version_fk"
            columns: ["submission_version_id", "submission_id"]
            isOneToOne: false
            referencedRelation: "submission_versions"
            referencedColumns: ["id", "submission_id"]
          },
        ]
      }
      submission_version_hint_usage: {
        Row: {
          attempt_id: string
          created_at: string
          first_used_at: string
          hint_id: string
          submission_id: string
          submission_version_id: string
          task_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          first_used_at: string
          hint_id: string
          submission_id: string
          submission_version_id: string
          task_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          first_used_at?: string
          hint_id?: string
          submission_id?: string
          submission_version_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_version_hint_usage_attempt_fk"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_version_hint_usage_hint_fk"
            columns: ["hint_id", "task_id"]
            isOneToOne: false
            referencedRelation: "task_hints"
            referencedColumns: ["id", "task_id"]
          },
          {
            foreignKeyName: "submission_version_hint_usage_version_fk"
            columns: ["submission_version_id", "submission_id"]
            isOneToOne: false
            referencedRelation: "submission_versions"
            referencedColumns: ["id", "submission_id"]
          },
        ]
      }
      submission_versions: {
        Row: {
          answer_text: string
          created_at: string
          elapsed_seconds: number
          evidence_refs: string[]
          hint_used: boolean
          id: string
          idempotency_key: string
          selected_option_ids: string[]
          submission_id: string
          submitted_at: string
          submitted_by: string
          task_snapshot: Json
          version_number: number
        }
        Insert: {
          answer_text?: string
          created_at?: string
          elapsed_seconds: number
          evidence_refs?: string[]
          hint_used: boolean
          id?: string
          idempotency_key: string
          selected_option_ids?: string[]
          submission_id: string
          submitted_at?: string
          submitted_by: string
          task_snapshot: Json
          version_number: number
        }
        Update: {
          answer_text?: string
          created_at?: string
          elapsed_seconds?: number
          evidence_refs?: string[]
          hint_used?: boolean
          id?: string
          idempotency_key?: string
          selected_option_ids?: string[]
          submission_id?: string
          submitted_at?: string
          submitted_by?: string
          task_snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "submission_versions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          accepted_at: string | null
          attempt_id: string
          cohort_id: string
          content_version_id: string
          course_id: string
          created_at: string
          enrollment_id: string
          id: string
          latest_version_number: number
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["submission_state"]
          task_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          attempt_id: string
          cohort_id: string
          content_version_id: string
          course_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          latest_version_number?: number
          learner_id: string
          organization_id: string
          row_version?: number
          state?: Database["public"]["Enums"]["submission_state"]
          task_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          attempt_id?: string
          cohort_id?: string
          content_version_id?: string
          course_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          latest_version_number?: number
          learner_id?: string
          organization_id?: string
          row_version?: number
          state?: Database["public"]["Enums"]["submission_state"]
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_attempt_context_fk"
            columns: [
              "attempt_id",
              "organization_id",
              "enrollment_id",
              "learner_id",
              "cohort_id",
              "course_id",
              "content_version_id",
              "task_id",
            ]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: [
              "id",
              "organization_id",
              "enrollment_id",
              "learner_id",
              "cohort_id",
              "course_id",
              "content_version_id",
              "task_id",
            ]
          },
          {
            foreignKeyName: "submissions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      support_issues: {
        Row: {
          assignee_id: string | null
          correlation_id: string | null
          created_at: string
          description_redacted: string
          id: string
          organization_id: string | null
          reporter_id: string | null
          resolved_at: string | null
          row_version: number
          severity: string
          state: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          correlation_id?: string | null
          created_at?: string
          description_redacted: string
          id?: string
          organization_id?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          row_version?: number
          severity: string
          state?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          correlation_id?: string | null
          created_at?: string
          description_redacted?: string
          id?: string
          organization_id?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          row_version?: number
          severity?: string
          state?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assessments: {
        Row: {
          created_at: string
          maximum_selections: number | null
          minimum_selections: number
          question_translations: Json
          selection_mode: string
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          maximum_selections?: number | null
          minimum_selections?: number
          question_translations: Json
          selection_mode: string
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          maximum_selections?: number | null
          minimum_selections?: number
          question_translations?: Json
          selection_mode?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assessments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_feedback: {
        Row: {
          created_at: string
          enrollment_id: string
          id: string
          learner_id: string
          organization_id: string
          sentiment: string
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          id?: string
          learner_id: string
          organization_id: string
          sentiment: string
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          id?: string
          learner_id?: string
          organization_id?: string
          sentiment?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_feedback_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_feedback_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_gate_questions: {
        Row: {
          created_at: string
          id: string
          question_translations: Json
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_translations: Json
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          question_translations?: Json
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_gate_questions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_gate_responses: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          created_at: string
          enrollment_id: string
          gate_question_id: string
          id: string
          learner_id: string
          organization_id: string
          row_version: number
          state: string
          task_id: string
          updated_at: string
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string
          enrollment_id: string
          gate_question_id: string
          id?: string
          learner_id: string
          organization_id: string
          row_version?: number
          state: string
          task_id: string
          updated_at?: string
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string
          enrollment_id?: string
          gate_question_id?: string
          id?: string
          learner_id?: string
          organization_id?: string
          row_version?: number
          state?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_gate_responses_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_gate_responses_gate_question_id_fkey"
            columns: ["gate_question_id"]
            isOneToOne: false
            referencedRelation: "task_gate_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_gate_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_gate_responses_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_hints: {
        Row: {
          content_translations: Json
          created_at: string
          id: string
          position: number
          task_id: string
          updated_at: string
        }
        Insert: {
          content_translations: Json
          created_at?: string
          id?: string
          position: number
          task_id: string
          updated_at?: string
        }
        Update: {
          content_translations?: Json
          created_at?: string
          id?: string
          position?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_hints_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_localizations: {
        Row: {
          created_at: string
          hint_text: string | null
          id: string
          instructions_html: string
          locale: string
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hint_text?: string | null
          id?: string
          instructions_html: string
          locale: string
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hint_text?: string | null
          id?: string
          instructions_html?: string
          locale?: string
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_localizations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_model_answers: {
        Row: {
          created_at: string
          model_answer: string
          task_localization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          model_answer: string
          task_localization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          model_answer?: string
          task_localization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_model_answers_task_localization_id_fkey"
            columns: ["task_localization_id"]
            isOneToOne: true
            referencedRelation: "task_localizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_option_answers: {
        Row: {
          created_at: string
          is_correct: boolean
          task_option_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          is_correct: boolean
          task_option_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          is_correct?: boolean
          task_option_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_option_answers_task_option_id_fkey"
            columns: ["task_option_id"]
            isOneToOne: true
            referencedRelation: "task_options"
            referencedColumns: ["id"]
          },
        ]
      }
      task_options: {
        Row: {
          created_at: string
          id: string
          labels: Json
          option_key: string
          position: number
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          labels: Json
          option_key: string
          position: number
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          labels?: Json
          option_key?: string
          position?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_options_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_rubric_assignments: {
        Row: {
          content_version_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string | null
          rubric_id: string
          task_id: string
        }
        Insert: {
          content_version_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
          rubric_id: string
          task_id: string
        }
        Update: {
          content_version_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
          rubric_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_rubric_assignments_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_rubric_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_rubric_assignments_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_rubric_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_rubric_assignments_task_version_fk"
            columns: ["task_id", "content_version_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id", "content_version_id"]
          },
        ]
      }
      task_schedules: {
        Row: {
          available_from: string | null
          change_reason: string
          changed_by: string | null
          cohort_id: string
          created_at: string
          due_at: string | null
          id: string
          offset_days: number | null
          row_version: number
          task_id: string
          updated_at: string
          window_days: number | null
        }
        Insert: {
          available_from?: string | null
          change_reason?: string
          changed_by?: string | null
          cohort_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          offset_days?: number | null
          row_version?: number
          task_id: string
          updated_at?: string
          window_days?: number | null
        }
        Update: {
          available_from?: string | null
          change_reason?: string
          changed_by?: string | null
          cohort_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          offset_days?: number | null
          row_version?: number
          task_id?: string
          updated_at?: string
          window_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_schedules_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_schedules_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_skill_mappings: {
        Row: {
          created_at: string
          evidence_required: boolean
          id: string
          mapping_version: number
          skill_id: string
          task_id: string
          weight_basis_points: number
        }
        Insert: {
          created_at?: string
          evidence_required?: boolean
          id?: string
          mapping_version?: number
          skill_id: string
          task_id: string
          weight_basis_points: number
        }
        Update: {
          created_at?: string
          evidence_required?: boolean
          id?: string
          mapping_version?: number
          skill_id?: string
          task_id?: string
          weight_basis_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_skill_mappings_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_skill_mappings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          bug_category_id: string | null
          content_version_id: string | null
          course_id: string
          created_at: string
          document_url: string | null
          expected_minutes: number | null
          external_id: string | null
          hint_penalty_basis_points: number
          id: string
          intro_video_url: string | null
          position: number
          required_hunt_scenario_id: string | null
          row_version: number
          source_system: string | null
          stage_id: string
          state: Database["public"]["Enums"]["record_state"]
          target_url: string | null
          task_kind: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          bug_category_id?: string | null
          content_version_id?: string | null
          course_id: string
          created_at?: string
          document_url?: string | null
          expected_minutes?: number | null
          external_id?: string | null
          hint_penalty_basis_points?: number
          id?: string
          intro_video_url?: string | null
          position: number
          required_hunt_scenario_id?: string | null
          row_version?: number
          source_system?: string | null
          stage_id: string
          state?: Database["public"]["Enums"]["record_state"]
          target_url?: string | null
          task_kind?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          bug_category_id?: string | null
          content_version_id?: string | null
          course_id?: string
          created_at?: string
          document_url?: string | null
          expected_minutes?: number | null
          external_id?: string | null
          hint_penalty_basis_points?: number
          id?: string
          intro_video_url?: string | null
          position?: number
          required_hunt_scenario_id?: string | null
          row_version?: number
          source_system?: string | null
          stage_id?: string
          state?: Database["public"]["Enums"]["record_state"]
          target_url?: string | null
          task_kind?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_bug_category_id_fkey"
            columns: ["bug_category_id"]
            isOneToOne: false
            referencedRelation: "bug_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_required_hunt_scenario_fkey"
            columns: ["required_hunt_scenario_id"]
            isOneToOne: false
            referencedRelation: "hunt_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_stage_course_fk"
            columns: ["stage_id", "course_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id", "course_id"]
          },
          {
            foreignKeyName: "tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_version_course_fk"
            columns: ["content_version_id", "course_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id", "course_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          cohort_id: string | null
          created_at: string
          granted_by: string | null
          id: string
          organization_id: string | null
          reason: string
          revoked_at: string | null
          role_id: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          granted_by?: string | null
          id?: string
          organization_id?: string | null
          reason: string
          revoked_at?: string | null
          role_id: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          granted_by?: string | null
          id?: string
          organization_id?: string | null
          reason?: string
          revoked_at?: string | null
          role_id?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_results: {
        Row: {
          created_at: string
          evidence_id: string
          id: string
          idempotency_key: string
          outcome: string
          result: Json
          score_basis_points: number | null
          validated_at: string
          validator_code: string
          validator_version: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          id?: string
          idempotency_key: string
          outcome: string
          result?: Json
          score_basis_points?: number | null
          validated_at?: string
          validator_code: string
          validator_version: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          id?: string
          idempotency_key?: string
          outcome?: string
          result?: Json
          score_basis_points?: number | null
          validated_at?: string
          validator_code?: string
          validator_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_results_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          endpoint_hash: string
          id: string
          integration_delivery_id: string
          request_signature_version: string
          response_body_hash: string | null
          response_status: number | null
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          endpoint_hash: string
          id?: string
          integration_delivery_id: string
          request_signature_version: string
          response_body_hash?: string | null
          response_status?: number | null
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          endpoint_hash?: string
          id?: string
          integration_delivery_id?: string
          request_signature_version?: string
          response_body_hash?: string | null
          response_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_integration_delivery_id_fkey"
            columns: ["integration_delivery_id"]
            isOneToOne: true
            referencedRelation: "integration_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_ledger: {
        Row: {
          awarded_at: string
          created_at: string
          id: string
          learner_id: string
          organization_id: string
          points: number
          rationale: string
          rule_version: number
          skill_id: string | null
          source_event_id: string
          source_kind: string
        }
        Insert: {
          awarded_at?: string
          created_at?: string
          id?: string
          learner_id: string
          organization_id: string
          points: number
          rationale: string
          rule_version: number
          skill_id?: string | null
          source_event_id: string
          source_kind: string
        }
        Update: {
          awarded_at?: string
          created_at?: string
          id?: string
          learner_id?: string
          organization_id?: string
          points?: number
          rationale?: string
          rule_version?: number
          skill_id?: string | null
          source_event_id?: string
          source_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_ledger_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_rules: {
        Row: {
          code: string
          created_at: string
          is_awarded: boolean
          points: number
          rule_version: number
          source_kind: string
          state: Database["public"]["Enums"]["record_state"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_awarded?: boolean
          points: number
          rule_version?: number
          source_kind: string
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_awarded?: boolean
          points?: number
          rule_version?: number
          source_kind?: string
          state?: Database["public"]["Enums"]["record_state"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      answer_question: {
        Args: {
          p_body: string
          p_correlation_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_question_id: string
        }
        Returns: {
          answered_at: string | null
          archived_at: string | null
          assigned_trainer_id: string | null
          cohort_id: string
          content_version_id: string
          created_at: string
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["question_state"]
          subject: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      answer_task_gate_question: {
        Args: {
          p_answer_text: string
          p_correlation_id?: string
          p_task_id: string
        }
        Returns: {
          answer_text: string | null
          answered_at: string | null
          created_at: string
          enrollment_id: string
          gate_question_id: string
          id: string
          learner_id: string
          organization_id: string
          row_version: number
          state: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "task_gate_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_content_version: {
        Args: {
          p_content_version_id: string
          p_correlation_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_impact_fingerprint: string
          p_reason: string
        }
        Returns: {
          archive_impact_fingerprint: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          change_summary: string | null
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          row_version: number
          snapshot: Json
          state: Database["public"]["Enums"]["content_version_state"]
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "content_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_question: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_question_id: string
        }
        Returns: {
          answered_at: string | null
          archived_at: string | null
          assigned_trainer_id: string | null
          cohort_id: string
          content_version_id: string
          created_at: string
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["question_state"]
          subject: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_enrollment: {
        Args: {
          p_cohort_id: string
          p_correlation_id: string
          p_enrollment_id: string
          p_expected_version: number
          p_reason: string
        }
        Returns: {
          cohort_id: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          request_note: string | null
          row_version: number
          state: Database["public"]["Enums"]["enrollment_state"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "enrollments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_trainer_to_course: {
        Args: {
          p_correlation_id?: string
          p_course_id: string
          p_trainer_id: string
        }
        Returns: {
          assigned_at: string
          assigned_by: string | null
          course_id: string
          organization_id: string
          removed_at: string | null
          trainer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "course_trainers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_trainer_to_learner: {
        Args: {
          p_correlation_id?: string
          p_learner_id: string
          p_organization_id?: string
          p_trainer_id: string
        }
        Returns: {
          assigned_at: string
          assigned_by: string | null
          learner_id: string
          organization_id: string
          removed_at: string | null
          trainer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "learner_trainers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_question: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_question_id: string
        }
        Returns: {
          answered_at: string | null
          archived_at: string | null
          assigned_trainer_id: string | null
          cohort_id: string
          content_version_id: string
          created_at: string
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["question_state"]
          subject: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_task_evidence_upload_cleanup: {
        Args: { p_claim_token: string; p_limit: number; p_worker_id: string }
        Returns: {
          bucket_id: string
          cleanup_attempt: number
          object_key: string
          upload_id: string
        }[]
      }
      complete_task_evidence_upload_cleanup: {
        Args: {
          p_claim_token: string
          p_deleted: boolean
          p_error_code?: string
          p_retry_at?: string
          p_upload_id: string
          p_worker_id: string
        }
        Returns: {
          cleanup_attempt: number
          retry_at: string
          storage_deleted_at: string
          upload_id: string
        }[]
      }
      consume_authentication_rate_limit: {
        Args: {
          p_client_subject: string
          p_email_subject: string
          p_operation: string
        }
        Returns: boolean
      }
      copy_task_into_course: {
        Args: { p_source_task_id: string; p_target_stage_id: string }
        Returns: string
      }
      create_external_task_evidence: {
        Args: {
          p_attempt_id: string
          p_idempotency_key: string
          p_sha256_hex: string
          p_source_uri: string
          p_title: string
        }
        Returns: {
          captured_at: string
          created_at: string
          evidence_kind: string
          id: string
          lab_session_id: string | null
          metadata: Json
          organization_id: string
          owner_id: string
          retention_until: string | null
          sha256_hex: string
          source_uri: string | null
          submission_version_id: string | null
          task_id: string | null
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "evidence"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_question: {
        Args: {
          p_body: string
          p_cohort_id: string
          p_correlation_id: string
          p_idempotency_key: string
          p_subject: string
          p_task_id: string
        }
        Returns: {
          answered_at: string | null
          archived_at: string | null
          assigned_trainer_id: string | null
          cohort_id: string
          content_version_id: string
          created_at: string
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["question_state"]
          subject: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_task_evidence_upload_intent: {
        Args: {
          p_attempt_id: string
          p_client_sha256: string
          p_correlation_id: string
          p_declared_byte_size: number
          p_declared_mime_type: string
          p_idempotency_key: string
          p_original_file_name: string
          p_title: string
        }
        Returns: {
          bucket_id: string
          correlation_id: string
          expires_at: string
          object_key: string
          replayed: boolean
          upload_id: string
          upload_state: Database["public"]["Enums"]["evidence_upload_state"]
        }[]
      }
      decide_content_review: {
        Args: {
          p_comment: string
          p_content_version_id: string
          p_correlation_id: string
          p_decision: string
          p_expected_version: number
          p_idempotency_key: string
        }
        Returns: {
          archive_impact_fingerprint: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          change_summary: string | null
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          row_version: number
          snapshot: Json
          state: Database["public"]["Enums"]["content_version_state"]
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "content_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_enrollment: {
        Args: {
          p_correlation_id: string
          p_decision: Database["public"]["Enums"]["enrollment_state"]
          p_enrollment_id: string
          p_expected_version: number
          p_reason: string
        }
        Returns: {
          cohort_id: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          request_note: string | null
          row_version: number
          state: Database["public"]["Enums"]["enrollment_state"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "enrollments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_hunt_finding: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_finding_id: string
          p_idempotency_key: string
          p_planted_code: string
          p_verdict: string
        }
        Returns: {
          attempt_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          organization_id: string | null
          planted_code: string | null
          reported_details: Json
          reported_summary: string
          row_version: number
          scenario_id: string | null
          severity: string | null
          submission_id: string | null
          updated_at: string
          verdict: string
        }
        SetofOptions: {
          from: "*"
          to: "hunt_findings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_submission: {
        Args: {
          p_comment: string
          p_correlation_id: string
          p_criterion_scores: Json
          p_decision: Database["public"]["Enums"]["review_decision"]
          p_expected_version: number
          p_idempotency_key: string
          p_submission_id: string
          p_submission_version_id: string
        }
        Returns: {
          accepted_at: string | null
          attempt_id: string
          cohort_id: string
          content_version_id: string
          course_id: string
          created_at: string
          enrollment_id: string
          id: string
          latest_version_number: number
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["submission_state"]
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      duplicate_course: {
        Args: {
          p_new_slug: string
          p_source_course_id: string
          p_title_suffix?: string
        }
        Returns: string
      }
      enroll_learner_in_course: {
        Args: {
          p_correlation_id?: string
          p_course_id: string
          p_learner_id: string
          p_reason?: string
        }
        Returns: {
          cohort_id: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          request_note: string | null
          row_version: number
          state: Database["public"]["Enums"]["enrollment_state"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "enrollments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_task_evidence_upload_service: {
        Args: {
          p_actor_id: string
          p_correlation_id: string
          p_idempotency_key: string
          p_upload_id: string
          p_verified_byte_size: number
          p_verified_mime_type: string
          p_verified_sha256: string
        }
        Returns: {
          byte_size: number
          captured_at: string
          correlation_id: string
          evidence_id: string
          media_asset_id: string
          mime_type: string
          original_file_name: string
          replayed: boolean
          sha256_hex: string
          title: string
          upload_id: string
        }[]
      }
      flag_learner_to_trainer: {
        Args: {
          p_correlation_id: string
          p_enrollment_id: string
          p_note: string
        }
        Returns: Json
      }
      get_content_archive_impact: {
        Args: { p_content_version_id: string }
        Returns: Json
      }
      get_my_arena_summary: { Args: never; Returns: Json }
      get_my_learning_course: {
        Args: { p_course_id: string; p_locale?: string }
        Returns: Json
      }
      get_my_learning_task: { Args: { p_task_id: string }; Returns: Json }
      get_public_catalog: {
        Args: { p_locale?: string }
        Returns: {
          course_id: string
          default_locale: string
          estimated_minutes: number
          published_at: string
          resolved_locale: string
          slug: string
          summary: string
          summary_localizations: Json
          task_count: number
          title: string
          title_localizations: Json
          version_number: number
        }[]
      }
      get_public_catalog_course: {
        Args: { p_course_id?: string; p_slug?: string }
        Returns: {
          course_id: string
          default_locale: string
          estimated_minutes: number
          localizations: Json
          published_at: string
          slug: string
          task_count: number
          version_number: number
        }[]
      }
      get_submission_review_context: {
        Args: { p_locale?: string; p_submission_id: string }
        Returns: Json
      }
      get_task_evidence_download_target: {
        Args: { p_evidence_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          evidence_id: string
          mime_type: string
          object_key: string
          original_file_name: string
          sha256_hex: string
        }[]
      }
      list_active_cohort_trainers: {
        Args: { p_cohort_id: string }
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      list_active_question_trainers: {
        Args: { p_cohort_id: string }
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      list_course_feedback_for_admin: {
        Args: { p_organization_id: string }
        Returns: {
          comment: string
          course_id: string
          course_title: string
          learner_name: string
          stars: number
          submitted_at: string
        }[]
      }
      list_my_available_question_contexts: {
        Args: { p_locale?: string }
        Returns: {
          cohort_id: string
          cohort_name: string
          task_id: string
          task_title: string
        }[]
      }
      list_my_learning_courses: {
        Args: { p_locale?: string }
        Returns: {
          cohort_id: string
          cohort_state: Database["public"]["Enums"]["cohort_state"]
          completed_activities: number
          content_version_id: string
          content_version_state: Database["public"]["Enums"]["content_version_state"]
          course_id: string
          enrollment_id: string
          enrollment_state: Database["public"]["Enums"]["enrollment_state"]
          next_task_id: string
          next_task_state: string
          next_task_title: string
          progression_mode: string
          title: string
          total_activities: number
          version_number: number
        }[]
      }
      list_my_learning_history: {
        Args: {
          p_before_event_id?: string
          p_before_occurred_at?: string
          p_limit?: number
          p_locale?: string
          p_snapshot_at?: string
        }
        Returns: {
          cohort_id: string
          course_id: string
          course_title: string
          event_id: string
          event_kind: string
          occurred_at: string
          ordinal: number
          organization_id: string
          question_id: string
          task_id: string
          task_title: string
        }[]
      }
      list_my_question_participant_contexts: {
        Args: never
        Returns: {
          display_name: string
          question_id: string
          user_id: string
        }[]
      }
      list_my_question_task_contexts: {
        Args: { p_locale?: string }
        Returns: {
          question_id: string
          task_title: string
        }[]
      }
      list_my_ready_task_evidence_uploads: {
        Args: { p_attempt_id: string }
        Returns: {
          byte_size: number
          captured_at: string
          evidence_id: string
          finalized_at: string
          immutable_linked: boolean
          mime_type: string
          original_file_name: string
          title: string
          upload_id: string
        }[]
      }
      list_organization_member_profiles: {
        Args: { p_organization_id: string }
        Returns: {
          display_name: string
          locale: string
          membership_state: Database["public"]["Enums"]["membership_state"]
          profile_state: Database["public"]["Enums"]["record_state"]
          timezone: string
          user_id: string
        }[]
      }
      list_progress_board: { Args: { p_locale?: string }; Returns: Json }
      list_task_feedback_for_admin: {
        Args: { p_organization_id: string }
        Returns: {
          learner_name: string
          sentiment: string
          submitted_at: string
          task_id: string
          task_title: string
        }[]
      }
      list_visible_skill_prerequisites: {
        Args: never
        Returns: {
          child_skill_id: string
          parent_skill_id: string
        }[]
      }
      mark_all_notifications_read: {
        Args: {
          p_before: string
          p_correlation_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      mark_notification_read: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_notification_id: string
        }
        Returns: Json
      }
      publish_content_version: {
        Args: {
          p_content_version_id: string
          p_correlation_id: string
          p_expected_version: number
          p_idempotency_key: string
        }
        Returns: {
          archive_impact_fingerprint: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          change_summary: string | null
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          row_version: number
          snapshot: Json
          state: Database["public"]["Enums"]["content_version_state"]
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "content_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_portfolio: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_expires_at: string
          p_portfolio_id: string
          p_snapshot: Json
          p_verifier_token_hash: string
        }
        Returns: {
          expires_at: string | null
          id: string
          portfolio_id: string
          published_at: string
          published_by: string
          revoked_at: string | null
          snapshot: Json
          verifier_token_hash: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "portfolio_publications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_task_evidence_upload_service: {
        Args: {
          p_actor_id: string
          p_correlation_id: string
          p_idempotency_key: string
          p_rejection_code: string
          p_upload_id: string
        }
        Returns: {
          bucket_id: string
          correlation_id: string
          object_key: string
          replayed: boolean
          upload_id: string
          upload_state: Database["public"]["Enums"]["evidence_upload_state"]
        }[]
      }
      remove_learner_from_course: {
        Args: {
          p_correlation_id?: string
          p_course_id: string
          p_learner_id: string
          p_reason?: string
        }
        Returns: {
          cohort_id: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          request_note: string | null
          row_version: number
          state: Database["public"]["Enums"]["enrollment_state"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "enrollments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_task_uploaded_evidence: {
        Args: {
          p_attempt_id: string
          p_correlation_id: string
          p_evidence_id: string
          p_expected_draft_version: number
          p_idempotency_key: string
        }
        Returns: {
          bucket_id: string
          correlation_id: string
          evidence_id: string
          object_key: string
          replayed: boolean
          result_draft_version: number
          upload_id: string
        }[]
      }
      remove_trainer_from_course: {
        Args: {
          p_correlation_id?: string
          p_course_id: string
          p_trainer_id: string
        }
        Returns: {
          assigned_at: string
          assigned_by: string | null
          course_id: string
          organization_id: string
          removed_at: string | null
          trainer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "course_trainers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_trainer_from_learner: {
        Args: {
          p_correlation_id?: string
          p_learner_id: string
          p_trainer_id: string
        }
        Returns: {
          assigned_at: string
          assigned_by: string | null
          learner_id: string
          organization_id: string
          removed_at: string | null
          trainer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "learner_trainers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_enrollment:
        | {
            Args: {
              p_course_id: string
              p_idempotency_key: string
              p_request_note?: string
            }
            Returns: {
              cohort_id: string | null
              completed_at: string | null
              course_id: string
              created_at: string
              decided_at: string | null
              decided_by: string | null
              decision_reason: string | null
              id: string
              idempotency_key: string
              learner_id: string
              organization_id: string
              request_note: string | null
              row_version: number
              state: Database["public"]["Enums"]["enrollment_state"]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "enrollments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_course_id: string
              p_idempotency_key: string
              p_organization_id: string
              p_request_note?: string
            }
            Returns: {
              cohort_id: string | null
              completed_at: string | null
              course_id: string
              created_at: string
              decided_at: string | null
              decided_by: string | null
              decision_reason: string | null
              id: string
              idempotency_key: string
              learner_id: string
              organization_id: string
              request_note: string | null
              row_version: number
              state: Database["public"]["Enums"]["enrollment_state"]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "enrollments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      revoke_portfolio_publication: {
        Args: {
          p_correlation_id: string
          p_publication_id: string
          p_reason: string
        }
        Returns: {
          expires_at: string | null
          id: string
          portfolio_id: string
          published_at: string
          published_by: string
          revoked_at: string | null
          snapshot: Json
          verifier_token_hash: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "portfolio_publications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_attempt_draft: {
        Args: {
          p_answer_text: string
          p_attempt_id: string
          p_elapsed_seconds: number
          p_evidence_draft: Json
          p_expected_draft_version: number
          p_selected_option_ids: string[]
          p_used_hint_ids: string[]
        }
        Returns: {
          attempt_id: string
          attempt_version: number
          draft_version: number
          elapsed_seconds: number
          hint_first_used_at: string
          hint_used: boolean
          updated_at: string
        }[]
      }
      set_hunt_scenario_defects: {
        Args: {
          p_correlation_id?: string
          p_defects: Json
          p_scenario_id: string
        }
        Returns: number
      }
      set_notification_family_preferences: {
        Args: {
          p_correlation_id: string
          p_email_enabled: boolean
          p_event_family: string
          p_expected_email_version: number
          p_expected_in_app_version: number
          p_expected_push_version: number
          p_idempotency_key: string
          p_in_app_enabled: boolean
          p_push_enabled: boolean
        }
        Returns: Json
      }
      set_task_gate_question: {
        Args: {
          p_correlation_id?: string
          p_question_translations: Json
          p_task_id: string
        }
        Returns: {
          created_at: string
          id: string
          question_translations: Json
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "task_gate_questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      skip_task_gate_question: {
        Args: { p_correlation_id?: string; p_task_id: string }
        Returns: {
          answer_text: string | null
          answered_at: string | null
          created_at: string
          enrollment_id: string
          gate_question_id: string
          id: string
          learner_id: string
          organization_id: string
          row_version: number
          state: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "task_gate_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_attempt:
        | {
            Args: {
              p_correlation_id: string
              p_enrollment_id: string
              p_idempotency_key: string
              p_task_id: string
            }
            Returns: {
              attempt_id: string
              attempt_row_version: number
              attempt_state: Database["public"]["Enums"]["attempt_state"]
              cohort_id: string
              content_version_id: string
              correlation_id: string
              course_id: string
              enrollment_id: string
              organization_id: string
              replayed: boolean
              task_id: string
            }[]
          }
        | {
            Args: { p_idempotency_key: string; p_task_id: string }
            Returns: {
              accepted_at: string | null
              cohort_id: string
              content_version_id: string
              course_id: string
              created_at: string
              elapsed_seconds: number
              enrollment_id: string
              hint_first_used_at: string | null
              hint_used: boolean
              id: string
              last_activity_at: string
              learner_id: string
              organization_id: string
              row_version: number
              sequence_number: number
              start_idempotency_key: string | null
              started_at: string
              state: Database["public"]["Enums"]["attempt_state"]
              submitted_at: string | null
              task_id: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "attempts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      submit_attempt: {
        Args: {
          p_answer_text: string
          p_attempt_id: string
          p_correlation_id: string
          p_evidence_refs: string[]
          p_expected_version: number
          p_idempotency_key: string
          p_selected_option_ids: string[]
        }
        Returns: {
          accepted_at: string | null
          attempt_id: string
          cohort_id: string
          content_version_id: string
          course_id: string
          created_at: string
          enrollment_id: string
          id: string
          latest_version_number: number
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["submission_state"]
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_content_for_review: {
        Args: {
          p_content_version_id: string
          p_correlation_id: string
          p_expected_version: number
          p_idempotency_key: string
        }
        Returns: {
          archive_impact_fingerprint: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          change_summary: string | null
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          row_version: number
          snapshot: Json
          state: Database["public"]["Enums"]["content_version_state"]
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "content_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_course_feedback: {
        Args: { p_comment?: string; p_course_id: string; p_stars: number }
        Returns: {
          comment: string
          course_id: string
          created_at: string
          enrollment_id: string
          id: string
          learner_id: string
          organization_id: string
          stars: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "course_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_task_feedback: {
        Args: { p_sentiment: string; p_task_id: string }
        Returns: {
          created_at: string
          enrollment_id: string
          id: string
          learner_id: string
          organization_id: string
          sentiment: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "task_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_question: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_question_id: string
          p_reason: string
          p_to_trainer_id: string
        }
        Returns: {
          answered_at: string | null
          archived_at: string | null
          assigned_trainer_id: string | null
          cohort_id: string
          content_version_id: string
          created_at: string
          id: string
          idempotency_key: string
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["question_state"]
          subject: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_submission: {
        Args: {
          p_correlation_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason: string
          p_submission_id: string
          p_to_trainer_id: string
        }
        Returns: {
          accepted_at: string | null
          attempt_id: string
          cohort_id: string
          content_version_id: string
          course_id: string
          created_at: string
          enrollment_id: string
          id: string
          latest_version_number: number
          learner_id: string
          organization_id: string
          row_version: number
          state: Database["public"]["Enums"]["submission_state"]
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_cohort: {
        Args: {
          p_cohort_id: string
          p_correlation_id: string
          p_expected_version: number
          p_idempotency_key?: string
          p_reason: string
          p_target_state: Database["public"]["Enums"]["cohort_state"]
        }
        Returns: {
          capacity: number | null
          completed_at: string | null
          content_version_id: string | null
          course_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          external_id: string | null
          id: string
          name: string
          organization_id: string
          progression_mode: string
          row_version: number
          source_system: string | null
          starts_at: string | null
          state: Database["public"]["Enums"]["cohort_state"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cohorts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_own_avatar: {
        Args: { p_avatar_object_key: string }
        Returns: {
          avatar_object_key: string | null
          created_at: string
          deactivated_at: string | null
          display_name: string
          external_id: string | null
          last_seen_at: string | null
          locale: string
          row_version: number
          source_system: string | null
          state: Database["public"]["Enums"]["record_state"]
          timezone: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_own_profile: {
        Args: {
          p_correlation_id: string
          p_display_name: string
          p_expected_version: number
          p_idempotency_key: string
          p_locale: string
          p_timezone: string
        }
        Returns: Json
      }
      update_task_schedule: {
        Args: {
          p_available_from: string
          p_cohort_id: string
          p_correlation_id: string
          p_due_at: string
          p_expected_version: number
          p_idempotency_key?: string
          p_reason: string
          p_task_id: string
        }
        Returns: {
          available_from: string | null
          change_reason: string
          changed_by: string | null
          cohort_id: string
          created_at: string
          due_at: string | null
          id: string
          offset_days: number | null
          row_version: number
          task_id: string
          updated_at: string
          window_days: number | null
        }
        SetofOptions: {
          from: "*"
          to: "task_schedules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_hunt_scenario: {
        Args: {
          p_code: string
          p_correlation_id?: string
          p_description: string
          p_expected_findings?: number
          p_html?: string
          p_organization_id?: string
          p_reward_badge_id?: string | null
          p_state?: Database["public"]["Enums"]["record_state"]
          p_title: string
        }
        Returns: {
          code: string
          configuration: Json
          created_at: string
          description: string
          end_media_url: string | null
          expected_findings: number
          html: string | null
          id: string
          organization_id: string | null
          reward_badge_id: string | null
          row_version: number
          scenario_version: number
          start_media_url: string | null
          state: Database["public"]["Enums"]["record_state"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hunt_scenarios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      ai_mode: "recommendation" | "learning" | "assessment" | "trainer_draft"
      ai_safety_outcome: "allowed" | "redacted" | "refused" | "escalated"
      attempt_state:
        | "in_progress"
        | "submitted"
        | "revision_required"
        | "resubmitted"
        | "accepted"
        | "abandoned"
      certificate_state:
        | "eligible"
        | "issued"
        | "available"
        | "revoked"
        | "expired"
      cohort_member_role: "learner" | "trainer"
      cohort_state: "waiting" | "active" | "completed" | "cancelled"
      content_version_state: "draft" | "in_review" | "published" | "archived"
      delivery_state:
        | "pending"
        | "processing"
        | "delivered"
        | "retry_scheduled"
        | "dead_letter"
        | "cancelled"
      enrollment_state:
        | "requested"
        | "approved"
        | "rejected"
        | "assigned"
        | "cancelled"
        | "completed"
      evidence_upload_state:
        | "pending"
        | "ready"
        | "rejected"
        | "removed"
        | "expired"
      lab_session_state:
        | "requested"
        | "provisioning"
        | "ready"
        | "active"
        | "validating"
        | "reset_pending"
        | "destroy_pending"
        | "destroyed"
        | "failed"
        | "expired"
      membership_state: "invited" | "active" | "suspended" | "removed"
      notification_state:
        | "pending"
        | "delivered"
        | "read"
        | "failed"
        | "cancelled"
      organization_state: "active" | "suspended" | "archived"
      question_state:
        | "open"
        | "assigned"
        | "answered"
        | "transferred"
        | "archived"
      record_state: "draft" | "active" | "inactive" | "archived"
      request_state:
        | "requested"
        | "processing"
        | "completed"
        | "rejected"
        | "cancelled"
      review_decision: "accepted" | "revision_required" | "transferred"
      submission_state:
        | "submitted"
        | "revision_required"
        | "resubmitted"
        | "accepted"
        | "withdrawn"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_mode: ["recommendation", "learning", "assessment", "trainer_draft"],
      ai_safety_outcome: ["allowed", "redacted", "refused", "escalated"],
      attempt_state: [
        "in_progress",
        "submitted",
        "revision_required",
        "resubmitted",
        "accepted",
        "abandoned",
      ],
      certificate_state: [
        "eligible",
        "issued",
        "available",
        "revoked",
        "expired",
      ],
      cohort_member_role: ["learner", "trainer"],
      cohort_state: ["waiting", "active", "completed", "cancelled"],
      content_version_state: ["draft", "in_review", "published", "archived"],
      delivery_state: [
        "pending",
        "processing",
        "delivered",
        "retry_scheduled",
        "dead_letter",
        "cancelled",
      ],
      enrollment_state: [
        "requested",
        "approved",
        "rejected",
        "assigned",
        "cancelled",
        "completed",
      ],
      evidence_upload_state: [
        "pending",
        "ready",
        "rejected",
        "removed",
        "expired",
      ],
      lab_session_state: [
        "requested",
        "provisioning",
        "ready",
        "active",
        "validating",
        "reset_pending",
        "destroy_pending",
        "destroyed",
        "failed",
        "expired",
      ],
      membership_state: ["invited", "active", "suspended", "removed"],
      notification_state: [
        "pending",
        "delivered",
        "read",
        "failed",
        "cancelled",
      ],
      organization_state: ["active", "suspended", "archived"],
      question_state: [
        "open",
        "assigned",
        "answered",
        "transferred",
        "archived",
      ],
      record_state: ["draft", "active", "inactive", "archived"],
      request_state: [
        "requested",
        "processing",
        "completed",
        "rejected",
        "cancelled",
      ],
      review_decision: ["accepted", "revision_required", "transferred"],
      submission_state: [
        "submitted",
        "revision_required",
        "resubmitted",
        "accepted",
        "withdrawn",
      ],
    },
  },
} as const

