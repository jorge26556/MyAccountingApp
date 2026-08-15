import type { Transaction, TransactionType } from '../types';
import type { RecurringTransaction } from '../services/extras';
import { endOfMonth, startOfMonth, today } from './dates';

/**
 * Agenda de lo que viene: "¿que tengo que pagar esta semana?".
 *
 * El estado `Pendiente` ya existia, pero solo vivia como un numero en una
 * tarjeta. Un total no se puede pagar; una lista con fechas si.
 *
 * La agenda mezcla dos fuentes, porque cualquiera de las dos sola miente:
 *
 *  - Los movimientos marcados como Pendiente (lo que ya registraste y aun no
 *    ejecutas).
 *  - Los recurrentes cuyo dia todavia no llega este mes. Estos no existen aun
 *    como transaccion —se materializan solos al llegar el dia— pero son
 *    exactamente la plata que se te va a ir. Sin ellos, la agenda de alguien
 *    con el arriendo y cinco suscripciones configuradas apareceria vacia.
 */

export type OrigenAgenda = 'pendiente' | 'recurrente';
export type GrupoAgenda = 'vencido' | 'hoy' | 'semana' | 'despues';

export interface ItemAgenda {
  /** Unico en toda la lista: los dos origenes pueden compartir uuid. */
  key: string;
  origen: OrigenAgenda;
  /** Id de la transaccion o de la plantilla recurrente, segun el origen. */
  id: string;
  fecha: Date;
  tipo: TransactionType;
  categoria: string;
  descripcion: string;
  importe: number;
  /** Negativo si ya vencio. 0 = hoy. */
  diasRestantes: number;
  grupo: GrupoAgenda;
}

export interface Agenda {
  items: ItemAgenda[];
  /** Vencidos + hoy + los proximos 7 dias: lo que exige atencion ahora. */
  urgentes: ItemAgenda[];
  vencidos: ItemAgenda[];
  /** Solo gastos urgentes. Es el numero del titular. */
  montoUrgente: number;
  porCobrar: number;
  hayAlgo: boolean;
}

const MS_POR_DIA = 86_400_000;

const diasEntre = (desde: Date, hasta: Date): number =>
  Math.round((hasta.getTime() - desde.getTime()) / MS_POR_DIA);

const agrupar = (diasRestantes: number): GrupoAgenda => {
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes === 0) return 'hoy';
  if (diasRestantes <= 7) return 'semana';
  return 'despues';
};

/**
 * Fecha en la que cae un recurrente dentro del mes de referencia.
 * El dia 31 en un mes de 30 se ajusta al ultimo, igual que hace la generacion
 * real; si no, la agenda anunciaria una fecha que nunca va a existir.
 */
const fechaDelRecurrente = (dia: number, referencia: Date): Date => {
  const ultimoDia = endOfMonth(referencia).getDate();
  return new Date(referencia.getFullYear(), referencia.getMonth(), Math.min(dia, ultimoDia));
};

export const construirAgenda = (
  transactions: Transaction[],
  recurrentes: RecurringTransaction[],
  hoy: Date = today()
): Agenda => {
  const inicioMes = startOfMonth(hoy);
  const items: ItemAgenda[] = [];

  transactions
    .filter(item => item.estado_pago === 'Pendiente')
    .forEach(item => {
      const diasRestantes = diasEntre(hoy, item.fecha);
      items.push({
        key: `tx-${item.id}`,
        origen: 'pendiente',
        id: item.id,
        fecha: item.fecha,
        tipo: item.tipo,
        categoria: item.categoria,
        descripcion: item.descripcion,
        importe: Math.abs(item.importe),
        diasRestantes,
        grupo: agrupar(diasRestantes),
      });
    });

  // Solo los que aun no han caido este mes. Los que ya pasaron su dia fueron
  // materializados al abrir la app, asi que anunciarlos seria contarlos dos
  // veces: una como transaccion real y otra como proyeccion.
  recurrentes
    .filter(
      plantilla =>
        plantilla.activo &&
        plantilla.dia_del_mes > hoy.getDate() &&
        (plantilla.ultima_generacion === null || plantilla.ultima_generacion < inicioMes)
    )
    .forEach(plantilla => {
      const fecha = fechaDelRecurrente(plantilla.dia_del_mes, hoy);
      const diasRestantes = diasEntre(hoy, fecha);
      items.push({
        key: `rec-${plantilla.id}`,
        origen: 'recurrente',
        id: plantilla.id,
        fecha,
        tipo: plantilla.tipo,
        categoria: plantilla.categoria,
        descripcion: plantilla.descripcion,
        importe: Math.abs(plantilla.importe),
        diasRestantes,
        grupo: agrupar(diasRestantes),
      });
    });

  items.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const urgentes = items.filter(item => item.diasRestantes <= 7);
  const vencidos = items.filter(item => item.grupo === 'vencido');

  return {
    items,
    urgentes,
    vencidos,
    montoUrgente: urgentes
      .filter(item => item.tipo === 'Gasto')
      .reduce((acc, item) => acc + item.importe, 0),
    porCobrar: items
      .filter(item => item.tipo === 'Ingreso')
      .reduce((acc, item) => acc + item.importe, 0),
    hayAlgo: items.length > 0,
  };
};
