export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      award_reports: {
        Row: {
          id: string
          project_id: string
          status: 'draft' | 'ready' | 'error'
          params_json: Json
          result_json: Json
          quotes_checksum: string
          generated_at: string
          created_by: string | null
          created_at: string
          updated_at: string
          approved_supplier_id: string | null
          approved_at: string | null
          approved_by: string | null
          approval_notes: string | null
        }
        Insert: {
          id?: string
          project_id: string
          status?: 'draft' | 'ready' | 'error'
          params_json?: Json
          result_json?: Json
          quotes_checksum: string
          generated_at?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
          approved_supplier_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approval_notes?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          status?: 'draft' | 'ready' | 'error'
          params_json?: Json
          result_json?: Json
          quotes_checksum?: string
          generated_at?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
          approved_supplier_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approval_notes?: string | null
        }
      }
      contract_allowances: {
        Row: {
          id: string
          project_id: string
          description: string
          quantity: string
          unit: string
          rate: number | null
          total: number
          notes: string | null
          category: string
          is_provisional: boolean
          sort_order: number
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          project_id: string
          description: string
          quantity?: string
          unit?: string
          rate?: number | null
          total: number
          notes?: string | null
          category?: string
          is_provisional?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          description?: string
          quantity?: string
          unit?: string
          rate?: number | null
          total?: number
          notes?: string | null
          category?: string
          is_provisional?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
      }
      contract_inclusions: {
        Row: {
          id: string
          project_id: string
          description: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          description: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          description?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      contract_exclusions: {
        Row: {
          id: string
          project_id: string
          description: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          description: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          description?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      letters_of_intent: {
        Row: {
          id: string
          project_id: string
          supplier_name: string
          supplier_contact: string | null
          supplier_email: string | null
          scope_summary: string
          service_types: Json
          target_start_date: string | null
          target_completion_date: string | null
          key_milestones: Json
          next_steps_checklist: Json
          custom_terms: string | null
          status: string
          generated_at: string
          sent_at: string | null
          acknowledged_at: string | null
          user_confirmed_nonbinding: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          supplier_name: string
          supplier_contact?: string | null
          supplier_email?: string | null
          scope_summary: string
          service_types?: Json
          target_start_date?: string | null
          target_completion_date?: string | null
          key_milestones?: Json
          next_steps_checklist?: Json
          custom_terms?: string | null
          status?: string
          generated_at?: string
          sent_at?: string | null
          acknowledged_at?: string | null
          user_confirmed_nonbinding?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          supplier_name?: string
          supplier_contact?: string | null
          supplier_email?: string | null
          scope_summary?: string
          service_types?: Json
          target_start_date?: string | null
          target_completion_date?: string | null
          key_milestones?: Json
          next_steps_checklist?: Json
          custom_terms?: string | null
          status?: string
          generated_at?: string
          sent_at?: string | null
          acknowledged_at?: string | null
          user_confirmed_nonbinding?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      onboarding_compliance_documents: {
        Row: {
          id: string
          project_id: string
          document_type: string
          document_name: string
          file_path: string
          status: string
          notes: string | null
          uploaded_at: string
          verified_at: string | null
          verified_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          document_type: string
          document_name: string
          file_path: string
          status?: string
          notes?: string | null
          uploaded_at?: string
          verified_at?: string | null
          verified_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          document_type?: string
          document_name?: string
          file_path?: string
          status?: string
          notes?: string | null
          uploaded_at?: string
          verified_at?: string | null
          verified_by?: string | null
          created_at?: string
        }
      }
      onboarding_audit_log: {
        Row: {
          id: string
          project_id: string
          event_type: string
          event_data: Json
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          event_type: string
          event_data?: Json
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          event_type?: string
          event_data?: Json
          user_id?: string | null
          created_at?: string
        }
      }
      organisations: {
        Row: {
          id: string
          name: string
          status: 'active' | 'trial' | 'suspended'
          seat_limit: number
          created_by_user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          status?: 'active' | 'trial' | 'suspended'
          seat_limit?: number
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          status?: 'active' | 'trial' | 'suspended'
          seat_limit?: number
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      organisation_members: {
        Row: {
          id: string
          organisation_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member' | 'viewer'
          status: 'active' | 'invited' | 'disabled'
          invited_by_user_id: string | null
          invited_at: string
          activated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organisation_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member' | 'viewer'
          status?: 'active' | 'invited' | 'disabled'
          invited_by_user_id?: string | null
          invited_at?: string
          activated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organisation_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member' | 'viewer'
          status?: 'active' | 'invited' | 'disabled'
          invited_by_user_id?: string | null
          invited_at?: string
          activated_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      platform_admins: {
        Row: {
          user_id: string
          full_name: string
          email: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          full_name: string
          email: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          full_name?: string
          email?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          organisation_id: string
          name: string
          description: string
          status: 'draft' | 'active' | 'completed' | 'archived'
          created_at: string
          updated_at: string
          client: string
          reference: string
          client_reference: string
          user_id: string | null
          created_by_user_id: string | null
          last_accessed_at: string
          approved_quote_id: string | null
          scoring_weights: { price: number; compliance: number; coverage: number; risk: number } | null
          trade: string | null
        }
        Insert: {
          id?: string
          organisation_id: string
          name: string
          description?: string
          status?: 'draft' | 'active' | 'completed' | 'archived'
          created_at?: string
          updated_at?: string
          client?: string
          reference?: string
          client_reference?: string
          user_id?: string | null
          created_by_user_id?: string | null
          last_accessed_at?: string
          approved_quote_id?: string | null
          scoring_weights?: { price: number; compliance: number; coverage: number; risk: number } | null
          trade?: string | null
        }
        Update: {
          id?: string
          organisation_id?: string
          name?: string
          description?: string
          status?: 'draft' | 'active' | 'completed' | 'archived'
          created_at?: string
          updated_at?: string
          client?: string
          reference?: string
          client_reference?: string
          user_id?: string | null
          created_by_user_id?: string | null
          last_accessed_at?: string
          approved_quote_id?: string | null
          scoring_weights?: { price: number; compliance: number; coverage: number; risk: number } | null
          trade?: string | null
        }
      }
      project_settings: {
        Row: {
          id: string
          project_id: string
          equalisation_mode: 'MODEL' | 'PEER_MEDIAN'
          last_equalisation_run: string | null
          review_clean_completed: boolean
          quote_intelligence_completed: boolean
          scope_matrix_completed: boolean
          trade_analysis_completed: boolean
          award_report_reviewed: boolean
          preferred_supplier_approved: boolean
          rfi_generated: boolean
          unsuccessful_letters_generated: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          equalisation_mode?: 'MODEL' | 'PEER_MEDIAN'
          last_equalisation_run?: string | null
          review_clean_completed?: boolean
          quote_intelligence_completed?: boolean
          scope_matrix_completed?: boolean
          trade_analysis_completed?: boolean
          award_report_reviewed?: boolean
          preferred_supplier_approved?: boolean
          rfi_generated?: boolean
          unsuccessful_letters_generated?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          equalisation_mode?: 'MODEL' | 'PEER_MEDIAN'
          last_equalisation_run?: string | null
          review_clean_completed?: boolean
          quote_intelligence_completed?: boolean
          scope_matrix_completed?: boolean
          trade_analysis_completed?: boolean
          award_report_reviewed?: boolean
          preferred_supplier_approved?: boolean
          rfi_generated?: boolean
          unsuccessful_letters_generated?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      quotes: {
        Row: {
          id: string
          project_id: string
          supplier_name: string
          quote_reference: string
          total_amount: number
          items_count: number
          import_date: string
          status: 'pending' | 'reviewed' | 'accepted' | 'rejected'
          notes: string
          raw_data: Json | null
          created_at: string
          updated_at: string
          user_id: string | null
          organisation_id: string | null
          quoted_total: number | null
          contingency_amount: number
        }
        Insert: {
          id?: string
          project_id: string
          supplier_name: string
          quote_reference?: string
          total_amount?: number
          items_count?: number
          import_date?: string
          status?: 'pending' | 'reviewed' | 'accepted' | 'rejected'
          notes?: string
          raw_data?: Json | null
          created_at?: string
          updated_at?: string
          user_id?: string | null
          organisation_id?: string | null
          quoted_total?: number | null
          contingency_amount?: number
        }
        Update: {
          id?: string
          project_id?: string
          supplier_name?: string
          quote_reference?: string
          total_amount?: number
          items_count?: number
          import_date?: string
          status?: 'pending' | 'reviewed' | 'accepted' | 'rejected'
          notes?: string
          raw_data?: Json | null
          created_at?: string
          updated_at?: string
          user_id?: string | null
          organisation_id?: string | null
          quoted_total?: number | null
          contingency_amount?: number
        }
      }
      quote_items: {
        Row: {
          id: string
          quote_id: string
          item_code: string
          description: string
          quantity: number
          unit: string
          unit_price: number
          total_price: number
          scope_category: string
          is_excluded: boolean
          notes: string
          created_at: string
          updated_at: string
          canonical_unit: string | null
          size: string | null
          frr: string | null
          service: string | null
          subclass: string | null
          material: string | null
          confidence: number | null
          issues: Json | null
          system_id: string | null
          system_label: string | null
          system_confidence: number | null
          system_needs_review: boolean
          system_manual_override: boolean
          matched_factors: Json | null
          missed_factors: Json | null
        }
        Insert: {
          id?: string
          quote_id: string
          item_code?: string
          description: string
          quantity?: number
          unit?: string
          unit_price?: number
          total_price?: number
          scope_category?: string
          is_excluded?: boolean
          notes?: string
          created_at?: string
          updated_at?: string
          canonical_unit?: string | null
          size?: string | null
          frr?: string | null
          service?: string | null
          subclass?: string | null
          material?: string | null
          confidence?: number | null
          issues?: Json | null
          system_id?: string | null
          system_label?: string | null
          system_confidence?: number | null
          system_needs_review?: boolean
          system_manual_override?: boolean
          matched_factors?: Json | null
          missed_factors?: Json | null
        }
        Update: {
          id?: string
          quote_id?: string
          item_code?: string
          description?: string
          quantity?: number
          unit?: string
          unit_price?: number
          total_price?: number
          scope_category?: string
          is_excluded?: boolean
          notes?: string
          created_at?: string
          updated_at?: string
          canonical_unit?: string | null
          size?: string | null
          frr?: string | null
          service?: string | null
          subclass?: string | null
          material?: string | null
          confidence?: number | null
          issues?: Json | null
          system_id?: string | null
          system_label?: string | null
          system_confidence?: number | null
          system_needs_review?: boolean
          system_manual_override?: boolean
          matched_factors?: Json | null
          missed_factors?: Json | null
        }
      }
      scope_categories: {
        Row: {
          id: string
          project_id: string
          name: string
          description: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          description?: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          description?: string
          sort_order?: number
          created_at?: string
        }
      }
      system_config: {
        Row: {
          key: string
          value: string
          description: string | null
          is_sensitive: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          description?: string | null
          is_sensitive?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          description?: string | null
          is_sensitive?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      parsing_jobs: {
        Row: {
          id: string
          project_id: string
          quote_id: string | null
          user_id: string
          organisation_id: string
          supplier_name: string
          filename: string
          file_url: string
          status: 'pending' | 'processing' | 'completed' | 'failed'
          progress: number
          result_data: Json | null
          error_message: string | null
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          project_id: string
          quote_id?: string | null
          user_id: string
          organisation_id: string
          supplier_name: string
          filename: string
          file_url: string
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          progress?: number
          result_data?: Json | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          quote_id?: string | null
          user_id?: string
          organisation_id?: string
          supplier_name?: string
          filename?: string
          file_url?: string
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          progress?: number
          result_data?: Json | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
      }
      parsing_chunks: {
        Row: {
          id: string
          job_id: string
          chunk_number: number
          total_chunks: number
          chunk_text: string | null
          parsed_items: Json | null
          status: 'pending' | 'processing' | 'completed' | 'failed'
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          job_id: string
          chunk_number: number
          total_chunks: number
          chunk_text?: string | null
          parsed_items?: Json | null
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          chunk_number?: number
          total_chunks?: number
          chunk_text?: string | null
          parsed_items?: Json | null
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_platform_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      get_all_organisations: {
        Args: Record<PropertyKey, never>
        Returns: Array<Database['public']['Tables']['organisations']['Row']>
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
