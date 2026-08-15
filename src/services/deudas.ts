import { supabase } from '../lib/supabase';
import { parseLocalDate, toDateString } from '../lib/dates';
import { CATEGORIA_PRESTAMO } from '../lib/accounts';
import { tipoDeMovimiento } from '../lib/deudas';
import type { Debt, TipoDeuda, Transaction } from '../types';

/**
 * Deudas y préstamos. Depende de `supabase/005_deudas.sql`.
 *
 * Mientras la migración no se ejecute, `fetchDebts` devuelve "no disponible" y
 * la sección queda oculta, igual que presupuestos, recurrentes y cuentas.
 */

const esTablaInexistente = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  Boolean(error?.message?.includes('does not exist'));

export const MENSAJE_MIGRACION_DEUDAS =
  'Las deudas necesitan la migración 005. Ejecuta supabase/005_deudas.sql en el SQL Editor de Supabase.';

const requireUserId = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  return session.user.id;
};

const mapDebt = (row: Record<string, unknown>): Debt => ({
  id: row.id as string,
  persona: row.persona as string,
  tipo: row.tipo as TipoDeuda,
  descripcion: (row.descripcion as string) ?? '',
  archivada: Boolean(row.archivada),
});

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
  compra_id: (row.compra_id as string) ?? null,
  cuota_numero: (row.cuota_numero as number) ?? null,
  cuota_total: (row.cuota_total as number) ?? null,
  debt_id: (row.debt_id as string) ?? null,
  recibo_path: (row.recibo_path as string) ?? null,
});

export interface ResultadoDeudas {
  disponible: boolean;
  datos: Debt[];
}

export const fetchDebts = async (): Promise<ResultadoDeudas> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    if (esTablaInexistente(error)) return { disponible: false, datos: [] };
    console.error('Error fetching debts:', error);
    throw new Error('No se pudieron cargar las deudas');
  }

  return { disponible: true, datos: (data ?? []).map(mapDebt) };
};

export interface NuevaDeuda {
  persona: string;
  tipo: TipoDeuda;
  descripcion: string;
  importe: number;
  fecha: Date;
  account_id: string | null;
}

export interface DeudaCreada {
  deuda: Debt;
  movimiento: Transaction;
}

/**
 * Crea la deuda y su primer movimiento en una sola operación.
 *
 * Una deuda sin movimiento no significa nada —el monto se calcula sumando los
 * movimientos, así que quedaría en cero— y obligar a registrarlos por separado
 * sería un paso extra que nadie querría dar.
 *
 * Si el movimiento falla, se borra la deuda recién creada. Dejarla suelta
 * llenaría la lista de fichas fantasma en cero que hay que limpiar a mano.
 */
export const createDebt = async (input: NuevaDeuda): Promise<DeudaCreada> => {
  const userId = await requireUserId();
  const persona = input.persona.trim();

  if (!persona) throw new Error('El nombre de la persona es obligatorio');
  if (!(input.importe > 0)) throw new Error('El monto debe ser mayor que cero');

  const { data: creada, error } = await supabase
    .from('debts')
    .insert({
      user_id: userId,
      persona,
      tipo: input.tipo,
      descripcion: input.descripcion.trim(),
    })
    .select()
    .single();

  if (error) {
    if (esTablaInexistente(error)) throw new Error(MENSAJE_MIGRACION_DEUDAS);
    console.error('Error creating debt:', error);
    throw new Error('No se pudo crear la deuda');
  }

  const deuda = mapDebt(creada);

  try {
    const movimiento = await registrarMovimientoDeDeuda({
      deuda,
      operacion: 'original',
      importe: input.importe,
      fecha: input.fecha,
      account_id: input.account_id,
    });
    return { deuda, movimiento };
  } catch (err) {
    await supabase.from('debts').delete().eq('id', deuda.id).eq('user_id', userId);
    throw err;
  }
};

export interface MovimientoDeDeuda {
  deuda: Debt;
  operacion: 'original' | 'abono';
  importe: number;
  fecha: Date;
  account_id: string | null;
}

/**
 * El préstamo inicial o un abono.
 *
 * `tipoDeMovimiento` decide la dirección: para "me deben", prestar es Gasto
 * (sale de tu cuenta) y el abono es Ingreso; para "debo" es al revés. Marcar
 * `debt_id` es lo que mantiene estos movimientos fuera de ingresos y gastos.
 */
export const registrarMovimientoDeDeuda = async (
  input: MovimientoDeDeuda
): Promise<Transaction> => {
  const userId = await requireUserId();

  if (!(input.importe > 0)) throw new Error('El monto debe ser mayor que cero');

  const verbo =
    input.operacion === 'original'
      ? input.deuda.tipo === 'me_deben'
        ? 'Préstamo a'
        : 'Préstamo de'
      : input.deuda.tipo === 'me_deben'
        ? 'Abono de'
        : 'Abono a';

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      fecha: toDateString(input.fecha),
      tipo: tipoDeMovimiento(input.deuda.tipo, input.operacion),
      categoria: CATEGORIA_PRESTAMO,
      importe: Math.abs(input.importe),
      estado_pago: 'Pagado',
      descripcion: `${verbo} ${input.deuda.persona}`,
      account_id: input.account_id,
      debt_id: input.deuda.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') {
      throw new Error(MENSAJE_MIGRACION_DEUDAS);
    }
    console.error('Error registrando movimiento de deuda:', error);
    throw new Error('No se pudo registrar el movimiento');
  }

  return mapTransaction(data);
};

export const updateDebt = async (
  id: string,
  changes: Partial<Pick<Debt, 'persona' | 'descripcion' | 'archivada'>>
): Promise<Debt> => {
  const userId = await requireUserId();

  const payload: Record<string, unknown> = {};
  if (changes.persona !== undefined) {
    const persona = changes.persona.trim();
    if (!persona) throw new Error('El nombre de la persona es obligatorio');
    payload.persona = persona;
  }
  if (changes.descripcion !== undefined) payload.descripcion = changes.descripcion.trim();
  if (changes.archivada !== undefined) payload.archivada = changes.archivada;

  const { data, error } = await supabase
    .from('debts')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating debt:', error);
    throw new Error('No se pudo actualizar la deuda');
  }

  return mapDebt(data);
};

/**
 * Borra la ficha de la deuda pero NO sus movimientos.
 *
 * La plata se movió de verdad: borrar el historial descuadraría los saldos de
 * las cuentas. Al perder el `debt_id` (la llave foránea es `on delete set
 * null`) esos movimientos vuelven a contar como ingreso o gasto normal, que es
 * exactamente lo que son si diste la deuda por perdida.
 */
export const deleteDebt = async (id: string): Promise<void> => {
  const userId = await requireUserId();

  const { error } = await supabase.from('debts').delete().eq('id', id).eq('user_id', userId);

  if (error) {
    console.error('Error deleting debt:', error);
    throw new Error('No se pudo eliminar la deuda');
  }
};
