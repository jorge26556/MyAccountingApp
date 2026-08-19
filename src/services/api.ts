import { supabase } from '../lib/supabase';
import { parseLocalDate, toDateString } from '../lib/dates';
import {
  encolarCreacion,
  esFalloDeRed,
  estaEnLinea,
  leerCola,
  nuevoIdLocal,
  quitarDeCola,
} from '../lib/offline';
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

/**
 * Si la migracion 004 ya corrio, deducido de los datos que ya llegaron.
 *
 * `select('*')` devuelve las columnas que existan: si la migracion corrio, cada
 * fila trae la clave `compra_id` (aunque valga null) y si no, no la trae. Mirar
 * eso sale gratis.
 *
 * La alternativa era preguntar por la columna con un select aparte, pero
 * PostgREST responde 400 cuando no existe y el navegador lo pinta en rojo en la
 * consola en CADA carga de la app. Un error permanente que no significa nada es
 * justo lo que hace que se dejen de mirar los que si significan algo.
 *
 * `null` = todavia no se sabe (no ha llegado ninguna fila).
 */
let columnasDeCuotas: boolean | null = null;

export const hayColumnasDeCuotas = (): boolean | null => columnasDeCuotas;

const mapTransaction = (row: Tables<'transactions'>): Transaction => {
  if (columnasDeCuotas === null) columnasDeCuotas = 'compra_id' in row;
  return construirTransaccion(row);
};

const construirTransaccion = (row: Tables<'transactions'>): Transaction => ({
  id: row.id,
  user_id: row.user_id,
  fecha: parseLocalDate(row.fecha),
  tipo: row.tipo as TransactionType,
  categoria: row.categoria,
  importe: Number(row.importe),
  estado_pago: row.estado_pago as PaymentStatus,
  descripcion: row.descripcion ?? '',
  account_id: row.account_id,
  transfer_group: row.transfer_group,
  // Si la migracion 004 aun no corrio, estas columnas no existen y llegan
  // `undefined`. Se normalizan a null en vez de reventar.
  compra_id: row.compra_id ?? null,
  cuota_numero: row.cuota_numero ?? null,
  cuota_total: row.cuota_total ?? null,
  debt_id: row.debt_id ?? null,
  recibo_path: row.recibo_path ?? null,
});

/* ────────────────────────────── transacciones ────────────────────────────── */

export const fetchTransactions = async (): Promise<Transaction[]> => {
  const userId = await requireUserId();

  /**
   * El desempate por `created_at` no es cosmetico.
   *
   * `fecha` es una columna de solo dia, asi que todo lo registrado hoy empata y
   * Postgres puede devolverlo en cualquier orden. Las plantillas de registro
   * rapido se quedan con el PRIMERO de cada grupo como "la ultima vez", asi que
   * sin este segundo criterio proponian un importe u otro segun como cayera la
   * consulta.
   */
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching transactions:', error);
    throw new Error('No se pudieron cargar las transacciones');
  }

  return (data ?? []).map(mapTransaction);
};

/**
 * Las columnas de cuotas NO se mandan aqui a proposito.
 *
 * Si la migracion 004 todavia no corrio, incluir `compra_id` haria que
 * PostgREST rechazara CUALQUIER alta con un PGRST204: se romperia el registro
 * de movimientos entero por una funcion que ni siquiera se esta usando. Las
 * cuotas se insertan desde services/cuotas.ts, que solo actua cuando comprobo
 * que las columnas existen.
 */
const filaParaInsertar = (userId: string, transaction: Omit<Transaction, 'id' | 'user_id'>) => ({
  user_id: userId,
  // toDateString usa componentes locales. Con toISOString() la fecha se
  // corria un dia en cualquier zona horaria al este de UTC.
  fecha: toDateString(transaction.fecha),
  tipo: transaction.tipo,
  categoria: transaction.categoria,
  importe: Math.abs(transaction.importe),
  estado_pago: transaction.estado_pago,
  descripcion: transaction.descripcion,
  account_id: transaction.account_id,
});

/** Un movimiento que aun no existe en el servidor, con id temporal. */
const comoLocal = (
  userId: string,
  transaction: Omit<Transaction, 'id' | 'user_id'>
): Transaction => ({
  ...transaction,
  id: nuevoIdLocal(),
  user_id: userId,
  importe: Math.abs(transaction.importe),
});

export interface ResultadoCreacion {
  transaccion: Transaction;
  /** true = quedo en la cola local, todavia no esta en el servidor. */
  encolada: boolean;
}

/**
 * Guarda el movimiento, y si no hay red lo encola para mas tarde.
 *
 * Antes, registrar sin senal devolvia un error y lo escrito se perdia. Y ese
 * es justo el momento en que uno registra: en la fila de la caja, con una raya
 * de cobertura.
 *
 * Solo se encola cuando el fallo es de RED. Un rechazo del servidor —un
 * importe invalido, una categoria borrada— se propaga como error de siempre:
 * encolarlo lo dejaria reintentando para siempre.
 */
export const createTransaction = async (
  transaction: Omit<Transaction, 'id' | 'user_id'>
): Promise<ResultadoCreacion> => {
  const userId = await requireUserId();

  const encolar = async (): Promise<ResultadoCreacion> => {
    const guardada = await encolarCreacion(userId, transaction);
    if (!guardada) {
      throw new Error(
        'Sin conexión, y este navegador no permite guardar borradores. Vuelve a intentarlo con señal.'
      );
    }
    return { transaccion: comoLocal(userId, transaction), encolada: true };
  };

  // Sin conexion ni se intenta: ahorra el timeout del fetch, que en movil son
  // varios segundos mirando un boton bloqueado.
  if (!estaEnLinea()) return encolar();

  try {
    const { data, error } = await supabase
      .from('transactions')
      .insert(filaParaInsertar(userId, transaction))
      .select()
      .single();

    if (error) {
      if (esFalloDeRed(error)) return encolar();
      console.error('Error creating transaction:', error);
      throw new Error('No se pudo guardar la transaccion');
    }

    return { transaccion: mapTransaction(data), encolada: false };
  } catch (err) {
    if (esFalloDeRed(err)) return encolar();
    throw err;
  }
};

export interface ResultadoSincronizacion {
  creadas: Transaction[];
  /** Filas que el servidor rechazo: se sacan de la cola para no reintentar. */
  descartadas: number;
}

/**
 * Vacia la cola contra el servidor. Se llama al arrancar y al recuperar la red.
 *
 * Se procesa en orden de creacion y de a una: si a mitad de camino se cae la
 * conexion otra vez, lo ya subido queda subido y lo demas sigue en cola.
 */
export const sincronizarPendientes = async (): Promise<ResultadoSincronizacion> => {
  const userId = await requireUserId();
  const pendientes = await leerCola(userId);

  const creadas: Transaction[] = [];
  let descartadas = 0;

  for (const operacion of pendientes) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert(filaParaInsertar(userId, operacion.payload))
        .select()
        .single();

      if (error) {
        // Se corto otra vez: se deja en cola y se para, no tiene sentido
        // intentar las siguientes.
        if (esFalloDeRed(error)) break;

        // El servidor la rechazo por su contenido. Reintentarla eternamente
        // dejaria un contador de pendientes que nunca baja.
        console.error('Movimiento pendiente rechazado:', error);
        await quitarDeCola(operacion.id);
        descartadas += 1;
        continue;
      }

      await quitarDeCola(operacion.id);
      creadas.push(mapTransaction(data));
    } catch (err) {
      if (esFalloDeRed(err)) break;
      console.error('Error sincronizando pendiente:', err);
      await quitarDeCola(operacion.id);
      descartadas += 1;
    }
  }

  return { creadas, descartadas };
};

/** Cuantos movimientos siguen esperando señal. */
export const contarPendientesDeSincronizar = async (): Promise<number> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return 0;
  return (await leerCola(session.user.id)).length;
};

export const updateTransaction = async (
  id: string,
  changes: Partial<Omit<Transaction, 'id' | 'user_id'>>
): Promise<Transaction> => {
  const userId = await requireUserId();

  // Campo por campo en vez de esparcir `changes`: asi `transfer_group` nunca
  // se puede reescribir desde un formulario y romper el par de una
  // transferencia.
  const payload: Record<string, unknown> = {};
  if (changes.fecha instanceof Date) payload.fecha = toDateString(changes.fecha);
  if (typeof changes.importe === 'number') payload.importe = Math.abs(changes.importe);
  if (changes.tipo !== undefined) payload.tipo = changes.tipo;
  if (changes.categoria !== undefined) payload.categoria = changes.categoria;
  if (changes.estado_pago !== undefined) payload.estado_pago = changes.estado_pago;
  if (changes.descripcion !== undefined) payload.descripcion = changes.descripcion;
  if (changes.account_id !== undefined) payload.account_id = changes.account_id;
  // Solo viaja si quien llama lo pidio: mandarlo siempre reventaria con
  // PGRST204 mientras la migracion 006 no se haya ejecutado.
  if (changes.recibo_path !== undefined) payload.recibo_path = changes.recibo_path;

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
    account_id: row.account_id,
    transfer_group: row.transfer_group,
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

export const MENSAJE_MIGRACION_RENOMBRAR =
  'Renombrar categorías necesita la migración 007. Ejecuta supabase/007_renombrar_categoria.sql en el SQL Editor de Supabase.';

/**
 * Renombrar no es un update de una fila: el nombre de la categoria viaja como
 * texto en `transactions`, `budgets` y `recurring_transactions`. Cuatro UPDATE
 * sueltos desde aqui dejarian el historial a medias si se corta la señal entre
 * uno y otro, asi que la operacion vive en el RPC `rename_category`, que corre
 * las cuatro en una sola transaccion.
 */
export const renameCategory = async (oldName: string, newName: string): Promise<void> => {
  const anterior = normalize(oldName);
  const nuevo = normalize(newName);

  if (!nuevo) throw new Error('El nombre de la categoria es obligatorio');
  if (anterior === nuevo) return;

  const { error } = await supabase.rpc('rename_category', { p_old: anterior, p_new: nuevo });

  if (error) {
    // PGRST202 = la funcion no existe todavia en el esquema.
    if (error.code === 'PGRST202') throw new Error(MENSAJE_MIGRACION_RENOMBRAR);
    // P0001 es un `raise exception` nuestro: el mensaje ya viene en castellano
    // y explica el caso concreto (nombre reservado, categoria inexistente).
    if (error.code === '23505' || error.code === 'P0001') throw new Error(error.message);
    console.error('Error renaming category:', error);
    throw new Error('No se pudo renombrar la categoria');
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
