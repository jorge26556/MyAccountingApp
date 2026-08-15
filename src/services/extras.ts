import { supabase } from '../lib/supabase';
import { parseLocalDate, startOfMonth, toDateString, today } from '../lib/dates';
import type { Transaction } from '../types';

/**
 * Presupuestos, movimientos recurrentes y baja de cuenta.
 *
 * Viven aparte de api.ts porque dependen de la migracion
 * `supabase/002_presupuestos_recurrentes_cuenta.sql`. Mientras no se ejecute,
 * estas funciones detectan que la tabla no existe y devuelven un estado
 * "no disponible" en vez de tumbar la app: asi el despliegue del codigo y la
 * migracion no tienen que ser simultaneos.
 */

/** PostgREST usa PGRST205 y Postgres 42P01 para "la tabla no existe". */
const esTablaInexistente = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  Boolean(error?.message?.includes('does not exist'));

export const MENSAJE_MIGRACION_PENDIENTE =
  'Esta sección necesita la migración 002. Ejecuta supabase/002_presupuestos_recurrentes_cuenta.sql en el SQL Editor de Supabase.';

export interface ResultadoOpcional<T> {
  disponible: boolean;
  datos: T;
}

const requireUserId = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  return session.user.id;
};

/* ─────────────────────────────── presupuestos ────────────────────────────── */

export interface Budget {
  id: string;
  categoria: string;
  amount: number;
}

export const fetchBudgets = async (): Promise<ResultadoOpcional<Budget[]>> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('budgets')
    .select('id, categoria, amount')
    .eq('user_id', userId)
    .order('categoria', { ascending: true });

  if (error) {
    if (esTablaInexistente(error)) return { disponible: false, datos: [] };
    console.error('Error fetching budgets:', error);
    throw new Error('No se pudieron cargar los presupuestos');
  }

  return {
    disponible: true,
    datos: (data ?? []).map(row => ({
      id: row.id as string,
      categoria: row.categoria as string,
      amount: Number(row.amount),
    })),
  };
};

export const upsertBudget = async (categoria: string, amount: number): Promise<Budget> => {
  const userId = await requireUserId();
  const nombre = categoria.trim();

  if (!nombre) throw new Error('La categoría es obligatoria');
  if (!(amount > 0)) throw new Error('El monto debe ser mayor que cero');

  const { data, error } = await supabase
    .from('budgets')
    .upsert({ user_id: userId, categoria: nombre, amount }, { onConflict: 'user_id,categoria' })
    .select('id, categoria, amount')
    .single();

  if (error) {
    if (esTablaInexistente(error)) throw new Error(MENSAJE_MIGRACION_PENDIENTE);
    console.error('Error saving budget:', error);
    throw new Error('No se pudo guardar el presupuesto');
  }

  return { id: data.id as string, categoria: data.categoria as string, amount: Number(data.amount) };
};

export const deleteBudget = async (id: string): Promise<void> => {
  const userId = await requireUserId();

  const { error } = await supabase.from('budgets').delete().eq('id', id).eq('user_id', userId);

  if (error) {
    console.error('Error deleting budget:', error);
    throw new Error('No se pudo eliminar el presupuesto');
  }
};

/* ──────────────────────── movimientos recurrentes ────────────────────────── */

export interface RecurringTransaction {
  id: string;
  tipo: 'Ingreso' | 'Gasto';
  categoria: string;
  importe: number;
  /** Cuenta de la que sale (o a la que entra) cada mes. */
  account_id: string | null;
  descripcion: string;
  dia_del_mes: number;
  activo: boolean;
  ultima_generacion: Date | null;
}

const mapRecurring = (row: Record<string, unknown>): RecurringTransaction => ({
  id: row.id as string,
  tipo: row.tipo as 'Ingreso' | 'Gasto',
  categoria: row.categoria as string,
  importe: Number(row.importe),
  account_id: (row.account_id as string) ?? null,
  descripcion: (row.descripcion as string) ?? '',
  dia_del_mes: Number(row.dia_del_mes),
  activo: Boolean(row.activo),
  ultima_generacion: row.ultima_generacion ? parseLocalDate(row.ultima_generacion as string) : null,
});

export const fetchRecurring = async (): Promise<ResultadoOpcional<RecurringTransaction[]>> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('recurring_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('dia_del_mes', { ascending: true });

  if (error) {
    if (esTablaInexistente(error)) return { disponible: false, datos: [] };
    console.error('Error fetching recurring:', error);
    throw new Error('No se pudieron cargar los movimientos recurrentes');
  }

  return { disponible: true, datos: (data ?? []).map(mapRecurring) };
};

export const createRecurring = async (
  input: Omit<RecurringTransaction, 'id' | 'ultima_generacion' | 'activo'>
): Promise<RecurringTransaction> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({
      user_id: userId,
      tipo: input.tipo,
      categoria: input.categoria.trim(),
      importe: Math.abs(input.importe),
      account_id: input.account_id,
      descripcion: input.descripcion.trim(),
      dia_del_mes: input.dia_del_mes,
    })
    .select()
    .single();

  if (error) {
    if (esTablaInexistente(error)) throw new Error(MENSAJE_MIGRACION_PENDIENTE);
    console.error('Error creating recurring:', error);
    throw new Error('No se pudo crear el movimiento recurrente');
  }

  return mapRecurring(data);
};

export const toggleRecurring = async (id: string, activo: boolean): Promise<void> => {
  const userId = await requireUserId();

  const { error } = await supabase
    .from('recurring_transactions')
    .update({ activo })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error toggling recurring:', error);
    throw new Error('No se pudo actualizar el movimiento recurrente');
  }
};

export const deleteRecurring = async (id: string): Promise<void> => {
  const userId = await requireUserId();

  const { error } = await supabase
    .from('recurring_transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting recurring:', error);
    throw new Error('No se pudo eliminar el movimiento recurrente');
  }
};

/**
 * Materializa los recurrentes que ya tocan este mes.
 *
 * El orden importa: primero se RECLAMA la plantilla marcando `ultima_generacion`
 * con una condicion sobre el valor anterior, y solo si esa actualizacion
 * devuelve fila se inserta la transaccion. Si tienes la app abierta en el
 * celular y en el computador, solo una de las dos gana la carrera y el
 * movimiento no se duplica.
 *
 * El riesgo inverso —marcar y que falle el insert— deja el movimiento sin
 * registrar ese mes, que es preferible a cobrarte el arriendo dos veces.
 */
export const generarRecurrentesPendientes = async (
  recurrentes: RecurringTransaction[],
  /** Adonde van los recurrentes creados antes de que existieran las cuentas. */
  cuentaPorDefecto: string | null = null,
  hoy: Date = today()
): Promise<Transaction[]> => {
  const userId = await requireUserId();
  const inicioMes = startOfMonth(hoy);
  const creadas: Transaction[] = [];

  const pendientes = recurrentes.filter(
    item =>
      item.activo &&
      item.dia_del_mes <= hoy.getDate() &&
      (item.ultima_generacion === null || item.ultima_generacion < inicioMes)
  );

  for (const plantilla of pendientes) {
    const claim = supabase
      .from('recurring_transactions')
      .update({ ultima_generacion: toDateString(inicioMes) })
      .eq('id', plantilla.id)
      .eq('user_id', userId);

    const { data: reclamada, error: claimError } = plantilla.ultima_generacion
      ? await claim.lt('ultima_generacion', toDateString(inicioMes)).select('id')
      : await claim.is('ultima_generacion', null).select('id');

    if (claimError || !reclamada || reclamada.length === 0) continue;

    // El dia puede no existir en este mes (31 en febrero): se ajusta al ultimo.
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const dia = Math.min(plantilla.dia_del_mes, ultimoDia);
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), dia);

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        fecha: toDateString(fecha),
        tipo: plantilla.tipo,
        categoria: plantilla.categoria,
        importe: plantilla.importe,
        estado_pago: 'Pagado',
        account_id: plantilla.account_id ?? cuentaPorDefecto,
        descripcion: plantilla.descripcion,
      })
      .select()
      .single();

    if (error) {
      console.error('Error generando recurrente:', error);
      continue;
    }

    creadas.push({
      id: data.id,
      user_id: data.user_id,
      fecha: parseLocalDate(data.fecha),
      tipo: data.tipo as 'Ingreso' | 'Gasto',
      categoria: data.categoria,
      importe: Number(data.importe),
      estado_pago: data.estado_pago as 'Pagado' | 'Pendiente',
      descripcion: data.descripcion ?? '',
      account_id: data.account_id,
      transfer_group: data.transfer_group,
      compra_id: data.compra_id ?? null,
      cuota_numero: data.cuota_numero ?? null,
      cuota_total: data.cuota_total ?? null,
      debt_id: data.debt_id ?? null,
      recibo_path: data.recibo_path ?? null,
    });
  }

  return creadas;
};

/* ────────────────────────────── cuenta ───────────────────────────────────── */

export interface Profile {
  id_user: string;
  email: string | null;
  birthday: string | null;
}

export const fetchProfile = async (): Promise<Profile | null> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('profiles')
    .select('id_user, email, birthday')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return data ?? null;
};

export const updateAlias = async (alias: string): Promise<void> => {
  const userId = await requireUserId();
  const nombre = alias.trim();

  if (!nombre) throw new Error('El nombre de usuario es obligatorio');

  const { error } = await supabase.from('profiles').update({ id_user: nombre }).eq('id', userId);

  if (error) {
    if (error.code === '23505') throw new Error(`El nombre "${nombre}" ya está en uso`);
    console.error('Error updating alias:', error);
    throw new Error('No se pudo actualizar el nombre de usuario');
  }
};

export const changePassword = async (nueva: string): Promise<void> => {
  if (nueva.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) throw new Error(error.message);
};

/**
 * Baja de cuenta. Borrar la fila de auth.users desde el cliente exige la
 * service_role key, que nunca debe salir del servidor; por eso pasa por un RPC
 * que solo puede eliminar la cuenta de quien lo invoca.
 */
export const deleteOwnAccount = async (): Promise<void> => {
  const { error } = await supabase.rpc('delete_own_account');

  if (error) {
    if (esTablaInexistente(error) || error.code === 'PGRST202') {
      throw new Error(MENSAJE_MIGRACION_PENDIENTE);
    }
    console.error('Error deleting account:', error);
    throw new Error('No se pudo eliminar la cuenta');
  }

  await supabase.auth.signOut();
};
