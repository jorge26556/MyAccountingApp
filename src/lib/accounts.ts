import type { Account, Transaction } from '../types';

/**
 * Saldos reales por cuenta.
 *
 * La app llevaba flujos (entro / salio) pero no saldos, asi que no podia
 * responder la pregunta mas basica de todas: cuanta plata tienes. Esto la
 * responde.
 *
 * Dos reglas que definen todo lo demas:
 *
 *  1. Solo lo PAGADO mueve el saldo. Un pendiente es un compromiso, no un
 *     movimiento: si contara, el saldo mostraria plata que todavia no ha
 *     salido de la cuenta (o que aun no ha entrado).
 *
 *  2. Las transferencias SI cuentan aqui, y NO cuentan como ingreso ni gasto.
 *     Pasar plata de Bancolombia a Nequi cambia dos saldos pero no te hace ni
 *     mas rico ni mas pobre.
 */

/** Categoria reservada para las dos patas de una transferencia. */
export const CATEGORIA_TRANSFERENCIA = 'Transferencia';

/** Categoria reservada para los movimientos de una deuda. */
export const CATEGORIA_PRESTAMO = 'Préstamo';

export const esTransferencia = (item: Transaction): boolean => item.transfer_group !== null;

export const esMovimientoDeDeuda = (item: Transaction): boolean => item.debt_id !== null;

/**
 * Movimientos que mueven saldo pero NO son ingreso ni gasto.
 *
 * Dos casos, y la razon es la misma en ambos: la plata cambia de sitio sin que
 * tu patrimonio cambie.
 *
 *  - Pasar plata de Bancolombia a Nequi.
 *  - Prestarle $500.000 a alguien: sale de tu cuenta pero sigue siendo tuya,
 *    solo que la tiene otro. Contarlo como gasto inflaria el mes y hundiria tu
 *    patrimonio; contar la devolucion como ingreso lo inflaria despues.
 */
export const esNeutro = (item: Transaction): boolean =>
  esTransferencia(item) || esMovimientoDeDeuda(item);

/** Movimientos que cuentan como ingreso o gasto de verdad. */
export const soloIngresosYGastos = (items: Transaction[]): Transaction[] =>
  items.filter(item => !esNeutro(item));

export interface SaldoCuenta {
  cuenta: Account;
  saldo: number;
  movimientos: number;
}

const efectoEnSaldo = (item: Transaction): number => {
  if (item.estado_pago !== 'Pagado') return 0;
  const monto = Math.abs(item.importe);
  return item.tipo === 'Ingreso' ? monto : -monto;
};

export const saldosPorCuenta = (
  accounts: Account[],
  transactions: Transaction[]
): SaldoCuenta[] => {
  const porCuenta = new Map<string, { saldo: number; movimientos: number }>();

  transactions.forEach(item => {
    if (!item.account_id) return;
    const actual = porCuenta.get(item.account_id) ?? { saldo: 0, movimientos: 0 };
    actual.saldo += efectoEnSaldo(item);
    actual.movimientos += 1;
    porCuenta.set(item.account_id, actual);
  });

  return accounts
    .map(cuenta => {
      const acumulado = porCuenta.get(cuenta.id) ?? { saldo: 0, movimientos: 0 };
      return {
        cuenta,
        saldo: cuenta.saldoInicial + acumulado.saldo,
        movimientos: acumulado.movimientos,
      };
    })
    .sort((a, b) => a.cuenta.orden - b.cuenta.orden || a.cuenta.nombre.localeCompare(b.cuenta.nombre));
};

/**
 * Las cuentas archivadas siguen sumando: archivar es "no me la ofrezcas al
 * registrar", no "esa plata dejo de existir". Para que dejara de contar habria
 * que borrar la cuenta.
 */
export const saldoTotal = (saldos: SaldoCuenta[]): number =>
  saldos.reduce((acc, item) => acc + item.saldo, 0);

/**
 * Movimientos que quedaron sin cuenta porque se borro la suya.
 *
 * No se reparten en silencio entre las demas: eso descuadraria un saldo sin
 * que nada lo explique. La app los cuenta para poder avisar.
 */
export const movimientosSinCuenta = (transactions: Transaction[]): number =>
  transactions.filter(item => !item.account_id).length;

/** Cuentas que se ofrecen al registrar un movimiento. */
export const cuentasActivas = (accounts: Account[]): Account[] =>
  accounts.filter(cuenta => !cuenta.archivada);

export const nombreDeCuenta = (accounts: Account[], id: string | null): string => {
  if (!id) return 'Sin cuenta';
  return accounts.find(cuenta => cuenta.id === id)?.nombre ?? 'Sin cuenta';
};
