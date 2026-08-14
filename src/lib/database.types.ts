/**
 * Tipos generados desde el esquema real de Supabase.
 *
 * Regenerar despues de cualquier migracion:
 *   npx supabase gen types typescript --project-id hfwvanvrbbreefhnwxzy > src/lib/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: { created_at: string; id: string; name: string; user_id: string };
        Insert: { created_at?: string; id?: string; name: string; user_id: string };
        Update: { created_at?: string; id?: string; name?: string; user_id?: string };
        Relationships: [];
      };
      profiles: {
        Row: {
          birthday: string | null;
          created_at: string | null;
          email: string | null;
          id: string;
          id_user: string;
        };
        Insert: {
          birthday?: string | null;
          created_at?: string | null;
          email?: string | null;
          id: string;
          id_user: string;
        };
        Update: {
          birthday?: string | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          id_user?: string;
        };
        Relationships: [];
      };
      savings_goals: {
        Row: {
          amount: number;
          created_at: string | null;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string | null;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          canal: string | null;
          categoria: string;
          created_at: string | null;
          descripcion: string | null;
          estado_pago: string;
          fecha: string;
          id: string;
          importe: number;
          tipo: string;
          user_id: string;
        };
        Insert: {
          canal?: string | null;
          categoria: string;
          created_at?: string | null;
          descripcion?: string | null;
          estado_pago: string;
          fecha?: string;
          id?: string;
          importe: number;
          tipo: string;
          user_id: string;
        };
        Update: {
          canal?: string | null;
          categoria?: string;
          created_at?: string | null;
          descripcion?: string | null;
          estado_pago?: string;
          fecha?: string;
          id?: string;
          importe?: number;
          tipo?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
