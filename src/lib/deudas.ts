import type { Debt, TipoDeuda, Transaction } from '../types';

/**
 * Cuanto te deben y cuanto debes.
 *
 * Una deuda no tiene monto propio en la base: se calcula sumando sus
 * movimientos. Asi no hay dos verdades que puedan desincronizarse —un campo
 * `monto_pendiente` y las transacciones reales— y un abono es simplemente un
 * movimiento mas, sin nada que recalcular a mano.
 *
 * La direccion depende del tipo:
 *
 *  - `me_deben` (le prestaste): la plata SALIO de tu cuenta, asi que el
 *    prestamo es un Gasto y la devolucion un Ingreso.
 *  - `debo` (te prestaron): al reves.
 *
 * En ambos casos los movimientos estan marcados con `debt_id` y quedan fuera
 * de ingresos y gastos: mueven saldos, no patrimonio.
 */

export interface EstadoDeuda {
  deuda: Debt;
  /** Lo que se movio en la direccion original (prestado o recibido). */
  original: number;
  /** Lo devuelto o abonado hasta ahora. */
  abonado: number;
  /** Lo que falta. Cero o menos = saldada. */
  pendiente: number;
  porcentaje: number;
  saldada: boolean;
  movimientos: number;
  ultimoMovimiento: Date | null;
}

/**
 * Un movimiento suma al original o resta como abono segun coincida con la
 * direccion de la deuda.
 *
 * Para `me_deben` la direccion original es 'Gasto' (sale de tu cuenta); para
 * `debo` es 'Ingreso'. Un movimiento del tipo contrario es un abono.
 */
const esDireccionOriginal = (tipo: TipoDeuda, movimiento: Transaction): boolean =>
  tipo === 'me_deben' ? movimiento.tipo === 'Gasto' : movimiento.tipo === 'Ingreso';

export const estadoDeDeuda = (deuda: Debt, transactions: Transaction[]): EstadoDeuda => {
  const propios = transactions.filter(item => item.debt_id === deuda.id);

  let original = 0;
  let abonado = 0;
  let ultimoMovimiento: Date | null = null;

  propios.forEach(item => {
    const monto = Math.abs(item.importe);
    if (esDireccionOriginal(deuda.tipo, item)) original += monto;
    else abonado += monto;

    if (!ultimoMovimiento || item.fecha > ultimoMovimiento) ultimoMovimiento = item.fecha;
  });

  const pendiente = original - abonado;

  return {
    deuda,
    original,
    abonado,
    pendiente,
    porcentaje: original > 0 ? Math.min(100, (abonado / original) * 100) : 0,
    // `<= 0` y no `=== 0`: si alguien abona de mas, la deuda esta saldada
    // igual. Quedarse esperando el cero exacto la dejaria abierta para siempre.
    saldada: original > 0 && pendiente <= 0,
    movimientos: propios.length,
    ultimoMovimiento,
  };
};

export interface ResumenDeudas {
  estados: EstadoDeuda[];
  /** Solo las que siguen abiertas, que son las accionables. */
  abiertas: EstadoDeuda[];
  teDeben: number;
  debes: number;
  hayAlgo: boolean;
}

export const resumenDeudas = (
  deudas: Debt[],
  transactions: Transaction[]
): ResumenDeudas => {
  const estados = deudas
    .filter(deuda => !deuda.archivada)
    .map(deuda => estadoDeDeuda(deuda, transactions))
    // Las mas grandes primero: son las que importan.
    .sort((a, b) => b.pendiente - a.pendiente || a.deuda.persona.localeCompare(b.deuda.persona));

  const abiertas = estados.filter(estado => !estado.saldada && estado.pendiente > 0);

  const sumar = (tipo: TipoDeuda) =>
    abiertas
      .filter(estado => estado.deuda.tipo === tipo)
      .reduce((acc, estado) => acc + estado.pendiente, 0);

  return {
    estados,
    abiertas,
    teDeben: sumar('me_deben'),
    debes: sumar('debo'),
    hayAlgo: estados.length > 0,
  };
};

/** El tipo de movimiento que corresponde a prestar/recibir, o a abonar. */
export const tipoDeMovimiento = (
  tipoDeuda: TipoDeuda,
  operacion: 'original' | 'abono'
): 'Ingreso' | 'Gasto' => {
  const original = tipoDeuda === 'me_deben' ? 'Gasto' : 'Ingreso';
  if (operacion === 'original') return original;
  return original === 'Gasto' ? 'Ingreso' : 'Gasto';
};
