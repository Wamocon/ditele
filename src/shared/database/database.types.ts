// Hand-written types for the clean Ditele schema (see ditele_schema.md).
// Keep in sync with supabase/migrations/20260101000000_baseline.sql.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Ts = string; // timestamptz / ISO string

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; role: Database["public"]["Enums"]["user_role"]; display_name: string; avatar_url: string | null; locale: string; is_active: boolean; created_at: Ts; updated_at: Ts };
        Insert: { id: string; role?: Database["public"]["Enums"]["user_role"]; display_name?: string; avatar_url?: string | null; locale?: string; is_active?: boolean; created_at?: Ts; updated_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      courses: {
        Row: { id: string; slug: string; title: string; description: string; cover_image_url: string | null; intro_video_url: string | null; completion_video_url: string | null; state: Database["public"]["Enums"]["course_state"]; created_by: string | null; created_at: Ts; updated_at: Ts };
        Insert: { id?: string; slug: string; title: string; description?: string; cover_image_url?: string | null; intro_video_url?: string | null; completion_video_url?: string | null; state?: Database["public"]["Enums"]["course_state"]; created_by?: string | null; created_at?: Ts; updated_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["courses"]["Insert"]>;
        Relationships: [];
      };
      arena_tasks: {
        Row: { id: string; order_index: number; title: string; description: string; html_window: string; hint: string | null; xp_reward: number; badge_id: string | null; state: Database["public"]["Enums"]["task_state"]; created_at: Ts; updated_at: Ts };
        Insert: { id?: string; order_index?: number; title: string; description?: string; html_window?: string; hint?: string | null; xp_reward?: number; badge_id?: string | null; state?: Database["public"]["Enums"]["task_state"]; created_at?: Ts; updated_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["arena_tasks"]["Insert"]>;
        Relationships: [];
      };
      arena_task_answer: {
        Row: { arena_task_id: string; acceptance_criteria: string; answer_key: string };
        Insert: { arena_task_id: string; acceptance_criteria?: string; answer_key?: string };
        Update: Partial<Database["public"]["Tables"]["arena_task_answer"]["Insert"]>;
        Relationships: [];
      };
      course_tasks: {
        Row: { id: string; course_id: string; order_index: number; title: string; description: string; hint: string | null; video_before_url: string | null; video_after_url: string | null; mcq_question: string | null; arena_task_id: string | null; state: Database["public"]["Enums"]["task_state"]; created_at: Ts; updated_at: Ts };
        Insert: { id?: string; course_id: string; order_index?: number; title: string; description?: string; hint?: string | null; video_before_url?: string | null; video_after_url?: string | null; mcq_question?: string | null; arena_task_id?: string | null; state?: Database["public"]["Enums"]["task_state"]; created_at?: Ts; updated_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["course_tasks"]["Insert"]>;
        Relationships: [];
      };
      course_task_options: {
        Row: { id: string; course_task_id: string; order_index: number; label: string };
        Insert: { id?: string; course_task_id: string; order_index?: number; label: string };
        Update: Partial<Database["public"]["Tables"]["course_task_options"]["Insert"]>;
        Relationships: [];
      };
      course_task_answer: {
        Row: { course_task_id: string; verification_answer: string; correct_option_ids: string[] };
        Insert: { course_task_id: string; verification_answer?: string; correct_option_ids?: string[] };
        Update: Partial<Database["public"]["Tables"]["course_task_answer"]["Insert"]>;
        Relationships: [];
      };
      badges: {
        Row: { id: string; name: string; description: string; image_url: string | null; created_at: Ts };
        Insert: { id?: string; name: string; description?: string; image_url?: string | null; created_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["badges"]["Insert"]>;
        Relationships: [];
      };
      badge_awards: {
        Row: { id: string; student_id: string; badge_id: string; arena_task_id: string | null; awarded_at: Ts };
        Insert: { id?: string; student_id: string; badge_id: string; arena_task_id?: string | null; awarded_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["badge_awards"]["Insert"]>;
        Relationships: [];
      };
      xp_ledger: {
        Row: { id: string; student_id: string; arena_task_id: string | null; amount: number; created_at: Ts };
        Insert: { id?: string; student_id: string; arena_task_id?: string | null; amount: number; created_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["xp_ledger"]["Insert"]>;
        Relationships: [];
      };
      enrollments: {
        Row: { id: string; student_id: string; course_id: string; state: Database["public"]["Enums"]["enrollment_state"]; assigned_by: string | null; enrolled_at: Ts; completed_at: Ts | null };
        Insert: { id?: string; student_id: string; course_id: string; state?: Database["public"]["Enums"]["enrollment_state"]; assigned_by?: string | null; enrolled_at?: Ts; completed_at?: Ts | null };
        Update: Partial<Database["public"]["Tables"]["enrollments"]["Insert"]>;
        Relationships: [];
      };
      course_trainers: {
        Row: { id: string; course_id: string; trainer_id: string; assigned_by: string | null; created_at: Ts };
        Insert: { id?: string; course_id: string; trainer_id: string; assigned_by?: string | null; created_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["course_trainers"]["Insert"]>;
        Relationships: [];
      };
      submissions: {
        Row: { id: string; student_id: string; task_kind: Database["public"]["Enums"]["submission_kind"]; course_task_id: string | null; arena_task_id: string | null; response_text: string; state: Database["public"]["Enums"]["submission_state"]; submitted_at: Ts | null; created_at: Ts; updated_at: Ts };
        Insert: { id?: string; student_id: string; task_kind: Database["public"]["Enums"]["submission_kind"]; course_task_id?: string | null; arena_task_id?: string | null; response_text?: string; state?: Database["public"]["Enums"]["submission_state"]; submitted_at?: Ts | null; created_at?: Ts; updated_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["submissions"]["Insert"]>;
        Relationships: [];
      };
      submission_options: {
        Row: { id: string; submission_id: string; option_id: string };
        Insert: { id?: string; submission_id: string; option_id: string };
        Update: Partial<Database["public"]["Tables"]["submission_options"]["Insert"]>;
        Relationships: [];
      };
      submission_images: {
        Row: { id: string; submission_id: string; object_key: string; caption: string; order_index: number; created_at: Ts };
        Insert: { id?: string; submission_id: string; object_key: string; caption?: string; order_index?: number; created_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["submission_images"]["Insert"]>;
        Relationships: [];
      };
      reviews: {
        Row: { id: string; submission_id: string; trainer_id: string; decision: Database["public"]["Enums"]["review_decision"]; comment: string; created_at: Ts };
        Insert: { id?: string; submission_id: string; trainer_id: string; decision: Database["public"]["Enums"]["review_decision"]; comment?: string; created_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [];
      };
      task_feedback: {
        Row: { id: string; student_id: string; course_task_id: string; emoji: string; created_at: Ts };
        Insert: { id?: string; student_id: string; course_task_id: string; emoji: string; created_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["task_feedback"]["Insert"]>;
        Relationships: [];
      };
      course_feedback: {
        Row: { id: string; student_id: string; course_id: string; rating: number; comment: string; created_at: Ts };
        Insert: { id?: string; student_id: string; course_id: string; rating: number; comment?: string; created_at?: Ts };
        Update: Partial<Database["public"]["Tables"]["course_feedback"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: "student" | "trainer" | "admin";
      course_state: "active" | "inactive" | "archived" | "deleted";
      task_state: "active" | "inactive" | "archived" | "deleted";
      submission_kind: "course" | "arena";
      submission_state: "in_progress" | "submitted" | "accepted" | "needs_revision";
      review_decision: "accepted" | "needs_revision";
      enrollment_state: "active" | "completed";
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
