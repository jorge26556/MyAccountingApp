import { supabase } from '../lib/supabase';
import { parseLocalDate, toDateString } from '../lib/dates';
import { etiquetaCuota, planDeCuotas } from '../lib/cuotas';
import type { Transaction } from '../types';

/**
 * Compras a cuotas. Depende de `supabase/004_cuotas.sql`.
 *
 * Mientras la migracion no se ejecute, `cuotasDisponibles()` devuelve false y
 * la app esconde la opcion en vez de romperse, igual que con presupuestos,
 * recurrentes y cuentas.
 */

const requireUserId = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  return session.user.id;
};

export const MENSAJE_MIGRACION_CUOTAS =
  'Las compras a cuotas necesitan la migración 004. Ejecuta supabase/004_cuotas.sql en el SQL Editor de Supabase.';

/**
 * Aqui no sirve el truco de "la tabla no existe": la tabla `transactions` si
 * existe, lo que falta son tres columnas. Se pregunta por una de ellas; si
 * PostgREST no la conoce (42703 / PGRST204), la migracion esta pendiente.
 */
export const cuotasDisponibles = async (): Promise<boolean> => {
  const { error } = await supabase.from('transactions').select('compra_id').limit(1);
  if (!error) return true;

  const desconocida =
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /compra_id/i.test(error.message ?? '');

  if (!desconocida) console.error('Error comprobando soporte de cuotas:', error);
  return false;
};

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
  cuota_numero: row.cuota_numero === null || row.cuota_numero === undefined ? null : Number(row.cuota_numero),
  cuota_total: row.cuota_total === null || row.cuota_total === undefined ? null : Number(row.cuota_total),
  debt_id: (row.debt_id as string) ?? null,
  recibo_path: (row.recibo_path as string) ?? null,
});

export interface CompraACuotas {
  total: number;
  cuotas: number;
  primeraFecha: Date;
  categoria: string;
  descripcion: string;
  account_id: string | null;
  /** Si la primera cuota ya se pagó al comprar. */
  primeraPagada: boolean;
}

/**
 * Crea las N cuotas de una compra en una sola insercion.
 *
 * Todas nacen Pendiente salvo, opcionalmente, la primera: en una compra con
 * tarjeta lo normal es que la cuota 1 se cobre de una vez. Las demas quedan
 * con fecha futura, que es lo que las hace aparecer en la agenda y en el
 * comprometido del mes correspondiente.
 */
export const createCompraACuotas = async (input: CompraACuotas): Promise<Transaction[]> => {
  const userId = await requireUserId();
  const compraId = crypto.randomUUID();
  const plan = planDeCuotas({
    total: input.total,
    cuotas: input.cuotas,
    primeraFecha: input.primeraFecha,
  });

  const filas = plan.map(cuota => ({
    user_id: userId,
    fecha: toDateString(cuota.fecha),
    tipo: 'Gasto',
    categoria: input.categoria.trim(),
    importe: cuota.importe,
    estado_pago: cuota.numero === 1 && input.primeraPagada ? 'Pagado' : 'Pendiente',
    descripcion: etiquetaCuota(input.descripcion, cuota.numero, cuota.total),
    account_id: input.account_id,
    compra_id: compraId,
    cuota_numero: cuota.numero,
    cuota_total: cuota.total,
  }));

  const { data, error } = await supabase.from('transactions').insert(filas).select();

  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') {
      throw new Error(MENSAJE_MIGRACION_CUOTAS);
    }
    console.error('Error creando compra a cuotas:', error);
    throw new Error('No se pudo registrar la compra a cuotas');
  }

  return (data ?? []).map(mapTransaction);
};

/**
 * Borra la compra completa.
 *
 * Dejar tres cuotas sueltas de doce no le sirve a nadie: o la compra existe
 * entera o no existe. Para quitar una sola cuota se edita ese movimiento.
 */
export const deleteCompra = async (compraId: string): Promise<void> => {
  const userId = await requireUserId();

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .eq('compra_id', compraId);

  if (error) {
    console.error('Error eliminando compra a cuotas:', error);
    throw new Error('No se pudo eliminar la compra');
  }
};
