import { supabase } from '../lib/supabase';
import { parseLocalDate, toDateString } from '../lib/dates';
import type { Tables } from '../lib/database.types';
import type {
  Category,
  PaymentStatus,
  SavingsGoal,
  Transaction,
  TransactionType,
} from '../types';

const DEFAULT_CATEGORY_NAMES = ['Arriendo', 'Mercado', 'Servicios', 'Salidas', 'Viajes', 'Extra'];

/**
 * Antes cada funcion llamaba `supabase.auth.getUser()`, que hace una peticion de
 * red a /auth/v1/user. Guardar una transaccion costaba dos viajes al servidor.
 * `getSession()` lee la sesion ya cacheada en localStorage.
 */
const requireUserId = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Tu sesion expiro. Vuelve a iniciar sesion.');
  return session.user.id;
};

const normalize = (value: string) => value.trim();

const mapTransaction = (row: Tables<'transactions'>): Transaction => ({
  id: row.id,
  user_id: row.user_id,
  fecha: parseLocalDate(row.fecha),
  tipo: row.tipo as TransactionType,
  categoria: row.categoria,
  importe: Number(row.importe),
  estado_pago: row.estado_pago as PaymentStatus,
  descripcion: row.descripcion ?? '',
  canal: row.canal ?? 'Directo',
});

/* ────────────────────────────── transacciones ────────────────────────────── */

export const fetchTransactions = async (): Promise<Transaction[]> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('fecha', { ascending: false });

  if (error) {
    console.error('Error fetching transactions:', error);
    throw new Error('No se pudieron cargar las transacciones');
  }

  return (data ?? []).map(mapTransaction);
};

export const createTransaction = async (
  transaction: Omit<Transaction, 'id' | 'user_id'>
): Promise<Transaction> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      // toDateString usa componentes locales. Con toISOString() la fecha se
      // corria un dia en cualquier zona horaria al este de UTC.
      fecha: toDateString(transaction.fecha),
      tipo: transaction.tipo,
      categoria: transaction.categoria,
      importe: Math.abs(transaction.importe),
      estado_pago: transaction.estado_pago,
      descripcion: transaction.descripcion,
      canal: transaction.canal,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating transaction:', error);
    throw new Error('No se pudo guardar la transaccion');
  }

  return mapTransaction(data);
};

export const updateTransaction = async (
  id: string,
  changes: Partial<Omit<Transaction, 'id' | 'user_id'>>
): Promise<Transaction> => {
  const userId = await requireUserId();

  const payload: Record<string, unknown> = { ...changes };
  if (changes.fecha instanceof Date) payload.fecha = toDateString(changes.fecha);
  if (typeof changes.importe === 'number') payload.importe = Math.abs(changes.importe);

  const { data, error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating transaction:', error);
    throw new Error('No se pudo actualizar la transaccion');
  }

  return mapTransaction(data);
};

export const deleteTransaction = async (id: string): Promise<void> => {
  const userId = await requireUserId();

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting transaction:', error);
    throw new Error('No se pudo eliminar la transaccion');
  }
};

/** Alta masiva para la importacion de CSV. */
export const createTransactionsBulk = async (
  rows: Array<Omit<Transaction, 'id' | 'user_id'>>
): Promise<number> => {
  const userId = await requireUserId();
  if (rows.length === 0) return 0;

  const payload = rows.map(row => ({
    user_id: userId,
    fecha: toDateString(row.fecha),
    tipo: row.tipo,
    categoria: row.categoria,
    importe: Math.abs(row.importe),
    estado_pago: row.estado_pago,
    descripcion: row.descripcion,
    canal: row.canal,
  }));

  const { data, error } = await supabase.from('transactions').insert(payload).select('id');

  if (error) {
    console.error('Error importing transactions:', error);
    throw new Error(`No se pudo importar: ${error.message}`);
  }

  return data?.length ?? 0;
};

/* ─────────────────────────────── categorias ──────────────────────────────── */

/**
 * La version anterior mantenia una copia de las categorias en localStorage como
 * "fallback" y validaba duplicados contra esa copia en vez de contra la base.
 * Eso producia falsos "esa categoria ya existe" y hacia que borrar una categoria
 * en un dispositivo no se reflejara en otro. La tabla `categories` ya existe con
 * RLS, asi que la unica fuente de verdad es Supabase.
 */
export const fetchCategories = async (): Promise<Category[]> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    throw new Error('No se pudieron cargar las categorias');
  }

  if (data && data.length > 0) {
    return data.map(item => ({ id: item.id, name: normalize(item.name) }));
  }

  // Usuario nuevo: sembrar el set por defecto. `ignoreDuplicates` evita que dos
  // pestanas (o el doble montaje de StrictMode) se pisen y tumben el insert.
  const { error: seedError } = await supabase
    .from('categories')
    .upsert(
      DEFAULT_CATEGORY_NAMES.map(name => ({ user_id: userId, name })),
      { onConflict: 'user_id,name', ignoreDuplicates: true }
    );

  if (seedError) {
    console.error('Error seeding categories:', seedError);
    throw new Error('No se pudieron crear las categorias iniciales');
  }

  const { data: seeded } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  return (seeded ?? []).map(item => ({ id: item.id, name: normalize(item.name) }));
};

export const createCategory = async (name: string): Promise<Category> => {
  const normalized = normalize(name);
  if (!normalized) throw new Error('El nombre de la categoria es obligatorio');

  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name: normalized })
    .select('id, name')
    .single();

  if (error) {
    // 23505 = unique_violation sobre (user_id, name).
    if (error.code === '23505') throw new Error(`La categoria "${normalized}" ya existe`);
    console.error('Error creating category:', error);
    throw new Error('No se pudo crear la categoria');
  }

  return { id: data.id, name: normalize(data.name) };
};

/** Cuantas transacciones quedarian huerfanas si se borra esta categoria. */
export const countTransactionsByCategory = async (name: string): Promise<number> => {
  const userId = await requireUserId();

  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('categoria', normalize(name));

  if (error) {
    console.error('Error counting transactions by category:', error);
    return 0;
  }

  return count ?? 0;
};

/**
 * Borrar una categoria dejaba transacciones apuntando a un nombre inexistente.
 * Ahora se puede reasignar a otra categoria en la misma operacion.
 */
export const deleteCategory = async (
  name: string,
  reassignTo?: string
): Promise<void> => {
  const userId = await requireUserId();
  const normalized = normalize(name);

  if (reassignTo) {
    const destino = normalize(reassignTo);
    if (destino === normalized) throw new Error('La categoria destino debe ser distinta');

    const { error: reassignError } = await supabase
      .from('transactions')
      .update({ categoria: destino })
      .eq('user_id', userId)
      .eq('categoria', normalized);

    if (reassignError) {
      console.error('Error reassigning transactions:', reassignError);
      throw new Error('No se pudieron reasignar las transacciones');
    }
  }

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('user_id', userId)
    .eq('name', normalized);

  if (error) {
    console.error('Error deleting category:', error);
    throw new Error('No se pudo eliminar la categoria');
  }
};

/* ────────────────────────────── metas de ahorro ──────────────────────────── */

const mapGoal = (row: Tables<'savings_goals'>): SavingsGoal => ({
  id: row.id,
  name: row.name,
  amount: Number(row.amount),
});

export const fetchSavingsGoals = async (): Promise<SavingsGoal[]> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching savings goals:', error);
    throw new Error('No se pudieron cargar las metas de ahorro');
  }

  return (data ?? []).map(mapGoal);
};

export const createSavingsGoal = async (goal: Omit<SavingsGoal, 'id'>): Promise<SavingsGoal> => {
  const userId = await requireUserId();
  const name = normalize(goal.name);

  if (!name) throw new Error('El nombre de la meta es obligatorio');
  if (!(goal.amount > 0)) throw new Error('El monto debe ser mayor que cero');

  const { data, error } = await supabase
    .from('savings_goals')
    .insert({ user_id: userId, name, amount: goal.amount })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error(`Ya tienes una meta llamada "${name}"`);
    console.error('Error creating savings goal:', error);
    throw new Error('No se pudo crear la meta de ahorro');
  }

  return mapGoal(data);
};

export const updateSavingsGoal = async (
  id: string,
  updates: Partial<Omit<SavingsGoal, 'id'>>
): Promise<SavingsGoal> => {
  const userId = await requireUserId();

  if (updates.name !== undefined && !normalize(updates.name)) {
    throw new Error('El nombre de la meta es obligatorio');
  }
  if (updates.amount !== undefined && !(updates.amount > 0)) {
    throw new Error('El monto debe ser mayor que cero');
  }

  const { data, error } = await supabase
    .from('savings_goals')
    .update({
      ...(updates.name !== undefined ? { name: normalize(updates.name) } : {}),
      ...(updates.amount !== undefined ? { amount: updates.amount } : {}),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Ya tienes una meta con ese nombre');
    console.error('Error updating savings goal:', error);
    throw new Error('No se pudo actualizar la meta');
  }

  return mapGoal(data);
};

export const deleteSavingsGoal = async (id: string): Promise<void> => {
  const userId = await requireUserId();

  const { error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting savings goal:', error);
    throw new Error('No se pudo eliminar la meta');
  }
};
