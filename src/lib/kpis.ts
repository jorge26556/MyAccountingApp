import type {
  CategoryTotal,
  DashboardFilters,
  GoalProgress,
  KpiData,
  PeriodPreset,
  SavingsGoal,
  Transaction,
} from '../types';
import { addMonths, endOfMonth, startOfMonth, today } from './dates';

/**
 * Calculo de KPIs, extraido de App.tsx.
 *
 * Vive aparte por dos razones:
 *  - Es la logica donde un error produce numeros equivocados sin que nada falle
 *    visiblemente, asi que necesita tests (ver kpis.test.ts).
 *  - Antes mezclaba dos fuentes: la mayoria de KPIs usaba los datos filtrados
 *    pero el ahorro y su variacion usaban el dataset completo, de modo que al
 *    aplicar un filtro esas dos tarjetas no se movian y nadie sabia por que.
 *    Ahora todo se calcula sobre el periodo seleccionado, y el comparativo es
 *    el periodo anterior equivalente.
 */

const esPagado = (t: Transaction) => t.estado_pago === 'Pagado';

const sumar = (items: Transaction[]) =>
  items.reduce((acc, item) => acc + Math.abs(item.importe), 0);

/** Resuelve un preset de periodo a un rango concreto [desde, hasta]. */
export const resolvePeriod = (
  period: PeriodPreset,
  custom: { dateFrom: Date | null; dateTo: Date | null }
): { desde: Date | null; hasta: Date | null } => {
  const hoy = today();

  switch (period) {
    case 'mes-actual':
      return { desde: startOfMonth(hoy), hasta: endOfMonth(hoy) };
    case 'mes-anterior': {
      const anterior = addMonths(hoy, -1);
      return { desde: startOfMonth(anterior), hasta: endOfMonth(anterior) };
    }
    case 'ultimos-3-meses':
      return { desde: startOfMonth(addMonths(hoy, -2)), hasta: endOfMonth(hoy) };
    case 'ano-actual':
      return {
        desde: new Date(hoy.getFullYear(), 0, 1),
        hasta: new Date(hoy.getFullYear(), 11, 31),
      };
    case 'todo':
      return { desde: null, hasta: null };
    case 'custom':
      return { desde: custom.dateFrom, hasta: custom.dateTo };
  }
};

/**
 * Rango equivalente inmediatamente anterior, para la variacion.
 * Un periodo de 31 dias se compara contra los 31 dias previos.
 *
 * Se cuenta en dias completos y se devuelven fechas a medianoche local. Restar
 * milisegundos (`desde - 1ms`) dejaba el inicio del rango anterior a las
 * 23:59:59.999 del primer dia, y como las transacciones se guardan a medianoche,
 * las del dia 1 quedaban fuera: al comparar agosto contra julio se perdian el
 * salario y el arriendo del 1 de julio.
 */
export const previousPeriod = (
  desde: Date | null,
  hasta: Date | null
): { desde: Date; hasta: Date } | null => {
  if (!desde || !hasta) return null;

  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1;

  // Aritmetica por componentes de fecha, no por milisegundos: asi el resultado
  // cae siempre a medianoche local aunque haya cambios de horario de por medio.
  const hastaAnterior = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() - 1);
  const desdeAnterior = new Date(
    hastaAnterior.getFullYear(),
    hastaAnterior.getMonth(),
    hastaAnterior.getDate() - (dias - 1)
  );

  return { desde: desdeAnterior, hasta: hastaAnterior };
};

const mayorPorCategoria = (
  items: Transaction[],
  tipo: 'Ingreso' | 'Gasto'
): CategoryTotal => {
  const totales = new Map<string, number>();

  items
    .filter(item => item.tipo === tipo)
    .forEach(item => {
      totales.set(item.categoria, (totales.get(item.categoria) ?? 0) + Math.abs(item.importe));
    });

  let mayor: CategoryTotal = { nombre: 'N/A', monto: 0 };
  totales.forEach((monto, nombre) => {
    if (monto > mayor.monto) mayor = { nombre, monto };
  });

  return mayor;
};

const progresoMetas = (goals: SavingsGoal[], ahorro: number): GoalProgress[] =>
  goals.map(goal => {
    const porcentaje = goal.amount > 0 ? (ahorro / goal.amount) * 100 : 0;
    return {
      goal,
      ahorro,
      porcentaje: Math.max(0, porcentaje),
      completada: ahorro >= goal.amount,
      faltante: Math.max(0, goal.amount - ahorro),
    };
  });

/** Dias cubiertos por el rango, o el span real de los datos si no hay rango. */
const diasDelPeriodo = (
  items: Transaction[],
  desde: Date | null,
  hasta: Date | null
): number => {
  const MS_POR_DIA = 86_400_000;

  if (desde && hasta) {
    return Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / MS_POR_DIA) + 1);
  }

  if (items.length === 0) return 1;

  const tiempos = items.map(item => item.fecha.getTime());
  const span = Math.max(...tiempos) - Math.min(...tiempos);
  return Math.max(1, Math.round(span / MS_POR_DIA) + 1);
};

export const computeKpis = (
  actuales: Transaction[],
  anteriores: Transaction[],
  goals: SavingsGoal[],
  rango: { desde: Date | null; hasta: Date | null } = { desde: null, hasta: null }
): KpiData => {
  const pagadas = actuales.filter(esPagado);

  const ingresos = pagadas.filter(item => item.tipo === 'Ingreso');
  const gastos = pagadas.filter(item => item.tipo === 'Gasto');

  const totalIngresos = sumar(ingresos);
  const totalGastos = sumar(gastos);
  const beneficioNeto = totalIngresos - totalGastos;

  const pendientes = actuales.filter(item => !esPagado(item));
  const ingresosPendientes = sumar(pendientes.filter(item => item.tipo === 'Ingreso'));
  const gastosPendientes = sumar(pendientes.filter(item => item.tipo === 'Gasto'));

  const mayorGastoIndividual = gastos.reduce(
    (max, item) => Math.max(max, Math.abs(item.importe)),
    0
  );

  const anterioresPagadas = anteriores.filter(esPagado);
  const ahorroPeriodoAnterior =
    sumar(anterioresPagadas.filter(item => item.tipo === 'Ingreso')) -
    sumar(anterioresPagadas.filter(item => item.tipo === 'Gasto'));

  const tieneComparativo = anteriores.length > 0;

  let variacionAhorro = 0;
  if (ahorroPeriodoAnterior !== 0) {
    variacionAhorro =
      ((beneficioNeto - ahorroPeriodoAnterior) / Math.abs(ahorroPeriodoAnterior)) * 100;
  } else if (beneficioNeto !== 0) {
    variacionAhorro = beneficioNeto > 0 ? 100 : -100;
  }

  return {
    totalIngresos,
    totalGastos,
    beneficioNeto,
    ingresosPendientes,
    gastosPendientes,
    numOperaciones: actuales.length,
    ticketMedioGasto: gastos.length > 0 ? totalGastos / gastos.length : 0,
    gastoPromedioDiario: totalGastos / diasDelPeriodo(gastos, rango.desde, rango.hasta),
    mayorGastoIndividual,
    categoriaMasGasto: mayorPorCategoria(pagadas, 'Gasto'),
    categoriaMasRentable: mayorPorCategoria(pagadas, 'Ingreso'),
    ahorroPeriodoAnterior,
    variacionAhorro,
    tieneComparativo,
    metas: progresoMetas(goals, beneficioNeto),
  };
};

/** Filtros que no son de fecha. El rango se aplica aparte. */
export const applyFilters = (
  items: Transaction[],
  filters: DashboardFilters,
  rango: { desde: Date | null; hasta: Date | null }
): Transaction[] => {
  const busqueda = filters.activeSearch.trim().toLowerCase();

  return items.filter(item => {
    if (filters.tipo !== 'Todos' && item.tipo !== filters.tipo) return false;
    if (filters.estadoPago !== 'Todos' && item.estado_pago !== filters.estadoPago) return false;
    if (filters.categorias.length > 0 && !filters.categorias.includes(item.categoria)) return false;
    if (filters.canales.length > 0 && !filters.canales.includes(item.canal)) return false;

    if (rango.desde && item.fecha < rango.desde) return false;
    if (rango.hasta && item.fecha > rango.hasta) return false;

    if (busqueda) {
      const enDescripcion = item.descripcion.toLowerCase().includes(busqueda);
      const enCategoria = item.categoria.toLowerCase().includes(busqueda);
      const enId = item.id.toLowerCase().includes(busqueda);
      if (!enDescripcion && !enCategoria && !enId) return false;
    }

    return true;
  });
};
