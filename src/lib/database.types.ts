/**
 * Tipos generados desde el esquema real de Supabase.
 *
 * Regenerar despues de cualquier migracion:
 *   npx supabase gen types typescript --project-id hfwvanvrbbreefhnwxzy > src/lib/database.types.ts
 *
 * `budgets`, `recurring_transactions` y `delete_own_account` estan escritos a
 * mano segun supabase/002_presupuestos_recurrentes_cuenta.sql, porque los tipos
 * se necesitaban antes de que la migracion estuviera aplicada. Al regenerar,
 * estas definiciones se reemplazan por las reales.
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
      budgets: {
        Row: {
          amount: number;
          categoria: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          categoria: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          categoria?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      recurring_transactions: {
        Row: {
          activo: boolean;
          canal: string;
          categoria: string;
          created_at: string;
          descripcion: string;
          dia_del_mes: number;
          id: string;
          importe: number;
          tipo: string;
          ultima_generacion: string | null;
          user_id: string;
        };
        Insert: {
          activo?: boolean;
          canal?: string;
          categoria: string;
          created_at?: string;
          descripcion?: string;
          dia_del_mes: number;
          id?: string;
          importe: number;
          tipo: string;
          ultima_generacion?: string | null;
          user_id: string;
        };
        Update: {
          activo?: boolean;
          canal?: string;
          categoria?: string;
          created_at?: string;
          descripcion?: string;
          dia_del_mes?: number;
          id?: string;
          importe?: number;
          tipo?: string;
          ultima_generacion?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
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
    Functions: {
      delete_own_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
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
