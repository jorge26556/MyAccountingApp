/**
 * Tipos generados desde el esquema real de Supabase.
 *
 * Regenerar despues de cualquier migracion:
 *   npm run types:supabase
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          archivada: boolean;
          created_at: string;
          id: string;
          nombre: string;
          orden: number;
          saldo_inicial: number;
          tipo: string;
          user_id: string;
        };
        Insert: {
          archivada?: boolean;
          created_at?: string;
          id?: string;
          nombre: string;
          orden?: number;
          saldo_inicial?: number;
          tipo?: string;
          user_id: string;
        };
        Update: {
          archivada?: boolean;
          created_at?: string;
          id?: string;
          nombre?: string;
          orden?: number;
          saldo_inicial?: number;
          tipo?: string;
          user_id?: string;
        };
        Relationships: [];
      };
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
      categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
        };
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
      recurring_transactions: {
        Row: {
          account_id: string | null;
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
          account_id?: string | null;
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
          account_id?: string | null;
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
          account_id: string | null;
          canal: string | null;
          categoria: string;
          /**
           * Las tres columnas de cuotas vienen de la migracion 004. Si aun no
           * se ejecuto, PostgREST no las devuelve y llegan `undefined`; por eso
           * todo lector las normaliza con `?? null`.
           */
          compra_id?: string | null;
          created_at: string | null;
          cuota_numero?: number | null;
          cuota_total?: number | null;
          descripcion: string | null;
          estado_pago: string;
          fecha: string;
          id: string;
          importe: number;
          tipo: string;
          transfer_group: string | null;
          user_id: string;
        };
        Insert: {
          account_id?: string | null;
          canal?: string | null;
          categoria: string;
          created_at?: string | null;
          descripcion?: string | null;
          estado_pago: string;
          fecha?: string;
          id?: string;
          importe: number;
          tipo: string;
          transfer_group?: string | null;
          user_id: string;
        };
        Update: {
          account_id?: string | null;
          canal?: string | null;
          categoria?: string;
          created_at?: string | null;
          descripcion?: string | null;
          estado_pago?: string;
          fecha?: string;
          id?: string;
          importe?: number;
          tipo?: string;
          transfer_group?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_own_account: { Args: Record<PropertyKey, never>; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Update'];
