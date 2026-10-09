// Generated types for the `btx-platform` Supabase project (awiaebtqalcmfafvktwh), public schema, 2026-10-09, after
// the Portal fresh-start migration. Produced by the Supabase `generate_typescript_types` tool; regenerate after any
// schema change. The generic helper types at the end of the generated file are replaced by the short aliases below.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      application_code_counters: {
        Row: { last_number: number; year: number };
        Insert: { last_number?: number; year: number };
        Update: { last_number?: number; year?: number };
        Relationships: [];
      };
      application_files: {
        Row: {
          application_id: string;
          filename: string;
          id: string;
          kind: string;
          size_bytes: number;
          storage_path: string;
          uploaded_at: string;
        };
        Insert: {
          application_id: string;
          filename: string;
          id?: string;
          kind: string;
          size_bytes: number;
          storage_path: string;
          uploaded_at?: string;
        };
        Update: {
          application_id?: string;
          filename?: string;
          id?: string;
          kind?: string;
          size_bytes?: number;
          storage_path?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'application_files_application_id_fkey';
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'applications';
            referencedColumns: ['id'];
          },
        ];
      };
      applications: {
        Row: {
          agreed_true: boolean;
          applicant_code: string | null;
          created_at: string;
          credits_left: number | null;
          current_step: number;
          cycle_id: string;
          essay: string | null;
          full_name: string | null;
          gender: string | null;
          heard_from: string | null;
          id: string;
          interest_certification: boolean;
          interest_mentoring: boolean;
          major: string | null;
          phone: string | null;
          race: string | null;
          secondary_email: string | null;
          status: string;
          stay_in_touch: boolean;
          submitted_at: string | null;
          terpmail: string;
          updated_at: string;
          user_id: string;
          year_in_school: string | null;
        };
        Insert: {
          agreed_true?: boolean;
          applicant_code?: string | null;
          created_at?: string;
          credits_left?: number | null;
          current_step?: number;
          cycle_id: string;
          essay?: string | null;
          full_name?: string | null;
          gender?: string | null;
          heard_from?: string | null;
          id?: string;
          interest_certification?: boolean;
          interest_mentoring?: boolean;
          major?: string | null;
          phone?: string | null;
          race?: string | null;
          secondary_email?: string | null;
          status?: string;
          stay_in_touch?: boolean;
          submitted_at?: string | null;
          terpmail?: string;
          updated_at?: string;
          user_id?: string;
          year_in_school?: string | null;
        };
        Update: {
          agreed_true?: boolean;
          applicant_code?: string | null;
          created_at?: string;
          credits_left?: number | null;
          current_step?: number;
          cycle_id?: string;
          essay?: string | null;
          full_name?: string | null;
          gender?: string | null;
          heard_from?: string | null;
          id?: string;
          interest_certification?: boolean;
          interest_mentoring?: boolean;
          major?: string | null;
          phone?: string | null;
          race?: string | null;
          secondary_email?: string | null;
          status?: string;
          stay_in_touch?: boolean;
          submitted_at?: string | null;
          terpmail?: string;
          updated_at?: string;
          user_id?: string;
          year_in_school?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'applications_cycle_id_fkey';
            columns: ['cycle_id'];
            isOneToOne: false;
            referencedRelation: 'cycles';
            referencedColumns: ['id'];
          },
        ];
      };
      bookings: {
        Row: {
          application_id: string;
          created_at: string;
          id: string;
          note: string | null;
          released_at: string | null;
          slot_id: string;
          status: string;
        };
        Insert: {
          application_id: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          released_at?: string | null;
          slot_id: string;
          status?: string;
        };
        Update: {
          application_id?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          released_at?: string | null;
          slot_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_application_id_fkey';
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'applications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_slot_id_fkey';
            columns: ['slot_id'];
            isOneToOne: false;
            referencedRelation: 'interview_slots';
            referencedColumns: ['id'];
          },
        ];
      };
      cycles: {
        Row: {
          award_amount_cents: number | null;
          award_name: string | null;
          closes_at: string | null;
          code_lifetime_minutes: number | null;
          created_at: string;
          decision_date: string | null;
          decisions_released_at: string | null;
          essay_prompt: string | null;
          essay_use: string | null;
          event_at: string | null;
          event_enabled: boolean;
          id: string;
          interview_end: string | null;
          interview_start: string | null;
          next_cycle_month: string | null;
          opens_at: string | null;
          payment_note: string | null;
          photo_due: string | null;
          requirements: Json;
          status: string;
          term: string;
          updated_at: string;
          year: number;
        };
        Insert: {
          award_amount_cents?: number | null;
          award_name?: string | null;
          closes_at?: string | null;
          code_lifetime_minutes?: number | null;
          created_at?: string;
          decision_date?: string | null;
          decisions_released_at?: string | null;
          essay_prompt?: string | null;
          essay_use?: string | null;
          event_at?: string | null;
          event_enabled?: boolean;
          id?: string;
          interview_end?: string | null;
          interview_start?: string | null;
          next_cycle_month?: string | null;
          opens_at?: string | null;
          payment_note?: string | null;
          photo_due?: string | null;
          requirements?: Json;
          status?: string;
          term: string;
          updated_at?: string;
          year: number;
        };
        Update: {
          award_amount_cents?: number | null;
          award_name?: string | null;
          closes_at?: string | null;
          code_lifetime_minutes?: number | null;
          created_at?: string;
          decision_date?: string | null;
          decisions_released_at?: string | null;
          essay_prompt?: string | null;
          essay_use?: string | null;
          event_at?: string | null;
          event_enabled?: boolean;
          id?: string;
          interview_end?: string | null;
          interview_start?: string | null;
          next_cycle_month?: string | null;
          opens_at?: string | null;
          payment_note?: string | null;
          photo_due?: string | null;
          requirements?: Json;
          status?: string;
          term?: string;
          updated_at?: string;
          year?: number;
        };
        Relationships: [];
      };
      interview_slots: {
        Row: { capacity: number; created_at: string; cycle_id: string; ends_at: string; id: string; starts_at: string };
        Insert: {
          capacity?: number;
          created_at?: string;
          cycle_id: string;
          ends_at: string;
          id?: string;
          starts_at: string;
        };
        Update: {
          capacity?: number;
          created_at?: string;
          cycle_id?: string;
          ends_at?: string;
          id?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'interview_slots_cycle_id_fkey';
            columns: ['cycle_id'];
            isOneToOne: false;
            referencedRelation: 'cycles';
            referencedColumns: ['id'];
          },
        ];
      };
      award_stories: {
        Row: { award_id: string; consent: boolean; created_at: string; photo_path: string | null; sent_at: string | null; story: string | null; updated_at: string };
        Insert: { award_id: string; consent?: boolean; photo_path?: string | null; sent_at?: string | null; story?: string | null };
        Update: { consent?: boolean; photo_path?: string | null; sent_at?: string | null; story?: string | null };
        Relationships: [];
      };
      interview_free_times: {
        Row: { application_id: string; created_at: string; days: string[]; note: string | null; updated_at: string; windows: string[] };
        Insert: { application_id: string; days: string[]; note?: string | null; windows: string[] };
        Update: { days?: string[]; note?: string | null; windows?: string[] };
        Relationships: [
          {
            foreignKeyName: 'interview_free_times_application_id_fkey';
            columns: ['application_id'];
            isOneToOne: true;
            referencedRelation: 'applications';
            referencedColumns: ['id'];
          },
        ];
      };
      notify_signups: {
        Row: { created_at: string; cycle_id: string | null; email: string; id: number; kind: string; requested_at: string };
        Insert: {
          created_at?: string;
          cycle_id?: string | null;
          email: string;
          id?: never;
          kind: string;
          requested_at?: string;
        };
        Update: {
          created_at?: string;
          cycle_id?: string | null;
          email?: string;
          id?: never;
          kind?: string;
          requested_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notify_signups_cycle_id_fkey';
            columns: ['cycle_id'];
            isOneToOne: false;
            referencedRelation: 'cycles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      app_role: { Args: never; Returns: string };
      is_staff: { Args: never; Returns: boolean };
      request_cycle_email: { Args: { p_email: string; p_kind: string }; Returns: undefined };
      submit_application: { Args: { p_application_id: string }; Returns: string };
      holds_award: { Args: { p_award_id: string }; Returns: boolean };
      my_decision: { Args: { p_cycle_id: string }; Returns: Json };
      my_interview: { Args: { p_cycle_id: string }; Returns: Json };
      open_interview_slots: { Args: { p_cycle_id: string }; Returns: { id: string; starts_at: string; ends_at: string }[] };
      switch_booking: { Args: { p_new_slot: string; p_note?: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** A row of a public table. */
export type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
/** The values for inserting into a public table. */
export type Insert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
/** The values for updating a public table. */
export type Update<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
