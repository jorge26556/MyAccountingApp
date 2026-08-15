import { supabase } from '../lib/supabase';
import { parseLocalDate, toDateString } from '../lib/dates';
import { CATEGORIA_TRANSFERENCIA } from '../lib/accounts';
import type { Account, AccountType, Transaction } from '../types';

/**
 * Cuentas, saldos y transferencias.
 *
 * Depende de la migracion `supabase/003_cuentas_saldos.sql`. Igual que
 * presupuestos y recurrentes, si la tabla no existe todavia la app no se cae:
 * devuelve "no disponible" y sigue funcionando como antes.
 */

const esTablaInexistente = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  Boolean(error?.message?.includes('does not exist'));

export const MENSAJE_MIGRACION_CUENTAS =
  'Las cuentas necesitan la migración 003. Ejecuta supabase/003_cuentas_saldos.sql en el SQL Editor de Supabase.';

const requireUserId = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  return session.user.id;
};

const mapAccount = (row: Record<string, unknown>): Account => ({
  id: row.id as string,
  nombre: row.nombre as string,
  tipo: row.tipo as AccountType,
  saldoInicial: Number(row.saldo_inicial),
  archivada: Boolean(row.archivada),
  orden: Number(row.orden),
});

export interface ResultadoCuentas {
  disponible: boolean;
  datos: Account[];
}

export const fetchAccounts = async (): Promise<ResultadoCuentas> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .order('orden', { ascending: true });

  if (error) {
    if (esTablaInexistente(error)) return { disponible: false, datos: [] };
    console.error('Error fetching accounts:', error);
    throw new Error('No se pudieron cargar las cuentas');
  }

  return { disponible: true, datos: (data ?? []).map(mapAccount) };
};

export const createAccount = async (input: {
  nombre: string;
  tipo: AccountType;
  saldoInicial: number;
}): Promise<Account> => {
  const userId = await requireUserId();
  const nombre = input.nombre.trim();

  if (!nombre) throw new Error('El nombre de la cuenta es obligatorio');
  if (!Number.isFinite(input.saldoInicial)) throw new Error('El saldo inicial no es un número válido');

  // Se coloca al final de la lista sin pedirle el orden al usuario.
  const { count } = await supabase
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      nombre,
      tipo: input.tipo,
      saldo_inicial: input.saldoInicial,
      orden: count ?? 0,
    })
    .select()
    .single();

  if (error) {
    if (esTablaInexistente(error)) throw new Error(MENSAJE_MIGRACION_CUENTAS);
    if (error.code === '23505') throw new Error(`Ya tienes una cuenta llamada "${nombre}"`);
    console.error('Error creating account:', error);
    throw new Error('No se pudo crear la cuenta');
  }

  return mapAccount(data);
};

export const updateAccount = async (
  id: string,
  changes: Partial<Pick<Account, 'nombre' | 'tipo' | 'saldoInicial' | 'archivada'>>
): Promise<Account> => {
  const userId = await requireUserId();

  const payload: Record<string, unknown> = {};
  if (changes.nombre !== undefined) {
    const nombre = changes.nombre.trim();
    if (!nombre) throw new Error('El nombre de la cuenta es obligatorio');
    payload.nombre = nombre;
  }
  if (changes.tipo !== undefined) payload.tipo = changes.tipo;
  if (changes.saldoInicial !== undefined) payload.saldo_inicial = changes.saldoInicial;
  if (changes.archivada !== undefined) payload.archivada = changes.archivada;

  const { data, error } = await supabase
    .from('accounts')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Ya tienes una cuenta con ese nombre');
    console.error('Error updating account:', error);
    throw new Error('No se pudo actualizar la cuenta');
  }

  return mapAccount(data);
};

export const countTransactionsByAccount = async (accountId: string): Promise<number> => {
  const userId = await requireUserId();

  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('account_id', accountId);

  if (error) {
    console.error('Error counting transactions by account:', error);
    return 0;
  }

  return count ?? 0;
};

/**
 * Borrar una cuenta sin reasignar dejaria sus movimientos apuntando a nada:
 * seguirian contando como gasto pero desaparecerian de todos los saldos, y el
 * total dejaria de cuadrar sin que nada lo explicara. Por eso se exige destino
 * cuando la cuenta tiene movimientos, igual que con las categorias.
 */
export const deleteAccount = async (id: string, reassignTo?: string): Promise<void> => {
  const userId = await requireUserId();

  if (reassignTo) {
    if (reassignTo === id) throw new Error('La cuenta destino debe ser distinta');

    const { error: reassignError } = await supabase
      .from('transactions')
      .update({ account_id: reassignTo })
      .eq('user_id', userId)
      .eq('account_id', id);

    if (reassignError) {
      console.error('Error reassigning transactions:', reassignError);
      throw new Error('No se pudieron reasignar los movimientos');
    }

    await supabase
      .from('recurring_transactions')
      .update({ account_id: reassignTo })
      .eq('user_id', userId)
      .eq('account_id', id);
  }

  const { error } = await supabase.from('accounts').delete().eq('id', id).eq('user_id', userId);

  if (error) {
    console.error('Error deleting account:', error);
    throw new Error('No se pudo eliminar la cuenta');
  }
};

/* ────────────────────────────── transferencias ───────────────────────────── */

const mapTransaction = (row: Record<string, unknown>): Transaction => ({
  id: row.id as string,
  user_id: row.user_id as string,
  fecha: parseLocalDate(row.fecha as string),
  tipo: row.tipo as 'Ingreso' | 'Gasto',
  categoria: row.categoria as string,
  importe: Number(row.importe),
  estado_pago: row.estado_pago as 'Pagado' | 'Pendiente',
  descripcion: (row.descripcion as string) ?? '',
  account_id: (row.account_id as string) ?? null,
  transfer_group: (row.transfer_group as string) ?? null,
});

/**
 * Una transferencia son DOS filas que comparten `transfer_group`: una salida de
 * la cuenta origen y una entrada a la destino.
 *
 * Es el error clasico de las apps de finanzas: si pasar plata de Bancolombia a
 * Nequi se guarda como un gasto y un ingreso normales, el mes muestra $500.000
 * mas de ingresos y $500.000 mas de gastos que los reales. El balance sigue
 * cuadrando —por eso nadie lo nota— pero el promedio de gasto, los
 * presupuestos y todas las graficas quedan mintiendo.
 *
 * Aqui las dos patas quedan marcadas y el resto de la app las descarta de
 * ingresos y gastos; los saldos si las cuentan, que es donde el movimiento es
 * real.
 */
export const createTransfer = async (input: {
  origen: string;
  destino: string;
  importe: number;
  fecha: Date;
  descripcion: string;
}): Promise<Transaction[]> => {
  const userId = await requireUserId();

  if (input.origen === input.destino) {
    throw new Error('La cuenta de origen y la de destino deben ser distintas');
  }
  if (!(input.importe > 0)) throw new Error('El monto debe ser mayor que cero');

  const grupo = crypto.randomUUID();
  const fecha = toDateString(input.fecha);
  const descripcion = input.descripcion.trim();

  const comun = {
    user_id: userId,
    fecha,
    categoria: CATEGORIA_TRANSFERENCIA,
    importe: input.importe,
    estado_pago: 'Pagado',
    descripcion,
    transfer_group: grupo,
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert([
      { ...comun, tipo: 'Gasto', account_id: input.origen },
      { ...comun, tipo: 'Ingreso', account_id: input.destino },
    ])
    .select();

  if (error) {
    console.error('Error creating transfer:', error);
    throw new Error('No se pudo registrar la transferencia');
  }

  return (data ?? []).map(mapTransaction);
};

/** Borrar una pata sin la otra descuadraria un saldo, asi que se borran juntas. */
export const deleteTransfer = async (transferGroup: string): Promise<void> => {
  const userId = await requireUserId();

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .eq('transfer_group', transferGroup);

  if (error) {
    console.error('Error deleting transfer:', error);
    throw new Error('No se pudo eliminar la transferencia');
  }
};
