import type { Transaction } from '../types';
import type { RecurringTransaction } from '../services/extras';
import { esTransferencia } from './accounts';
import { addMonths, endOfMonth, startOfMonth, toMonthKey, today } from './dates';

/**
 * Analitica que responde "¿como voy?" en vez de "¿cuanto llevo?".
 *
 * El dashboard anterior solo mostraba totales del periodo. Eso te dice donde
 * estas, pero no si vas bien: a mitad de mes, $800.000 gastados puede ser
 * excelente o pesimo segun como venias. Estas funciones comparan contra el mes
 * anterior y proyectan el cierre.
 */

// Una transferencia entre tus propias cuentas no es gasto ni ingreso. Si se
// colara aqui, mover plata de un bolsillo a otro dispararia las graficas de
// gasto y te haria creer que estas gastando el doble.
const esGastoPagado = (t: Transaction) =>
  t.tipo === 'Gasto' && t.estado_pago === 'Pagado' && !esTransferencia(t);

const esIngresoPagado = (t: Transaction) =>
  t.tipo === 'Ingreso' && t.estado_pago === 'Pagado' && !esTransferencia(t);

export interface AcumuladoDia {
  dia: number;
  /** Acumulado del mes en curso. `null` a partir de manana: la linea se corta. */
  actual: number | null;
  anterior: number | null;
}

/**
 * Gasto acumulado dia a dia del mes de referencia contra el mes anterior.
 *
 * Es la grafica que a mitad de mes te dice si vas mas rapido que el mes pasado,
 * cuando todavia puedes corregir. Ambas series arrancan en cero el dia 1, asi
 * que la comparacion es justa aunque los meses tengan distinta duracion.
 */
export const gastoAcumuladoComparado = (
  transactions: Transaction[],
  referencia: Date = today(),
  hoy: Date = today()
): AcumuladoDia[] => {
  const mesActual = toMonthKey(referencia);
  const mesAnterior = toMonthKey(addMonths(referencia, -1));

  const porDia = (mes: string) => {
    const totales = new Map<number, number>();
    transactions.forEach(item => {
      if (!esGastoPagado(item) || toMonthKey(item.fecha) !== mes) return;
      const dia = item.fecha.getDate();
      totales.set(dia, (totales.get(dia) ?? 0) + Math.abs(item.importe));
    });
    return totales;
  };

  const gastosActual = porDia(mesActual);
  const gastosAnterior = porDia(mesAnterior);

  const diasActual = endOfMonth(referencia).getDate();
  const diasAnterior = endOfMonth(addMonths(referencia, -1)).getDate();
  const diasAMostrar = Math.max(diasActual, diasAnterior);

  // Si la referencia es el mes en curso, la linea actual se corta hoy. Dibujarla
  // plana hasta fin de mes daria la impresion falsa de que ya no vas a gastar.
  const esMesEnCurso = toMonthKey(hoy) === mesActual;
  const ultimoDiaConDatos = esMesEnCurso ? hoy.getDate() : diasActual;

  let acumActual = 0;
  let acumAnterior = 0;

  return Array.from({ length: diasAMostrar }, (_, index) => {
    const dia = index + 1;

    acumActual += gastosActual.get(dia) ?? 0;
    acumAnterior += gastosAnterior.get(dia) ?? 0;

    return {
      dia,
      actual: dia <= ultimoDiaConDatos ? acumActual : null,
      anterior: dia <= diasAnterior ? acumAnterior : null,
    };
  });
};

export interface Proyeccion {
  gastadoHasta: number;
  ritmoDiario: number;
  proyectado: number;
  diasTranscurridos: number;
  diasDelMes: number;
  /** Total gastado en el mes anterior completo, para comparar el cierre. */
  totalMesAnterior: number;
  /** Positivo = vas a cerrar gastando mas que el mes pasado. */
  diferenciaVsAnterior: number;
  esMesEnCurso: boolean;
}

/**
 * "A este ritmo terminas el mes en $X."
 *
 * Extrapolacion lineal simple: gastado / dias transcurridos * dias del mes.
 * No intenta modelar que el arriendo se paga el dia 1 — para eso estan los
 * recurrentes. Su valor es dar una senal temprana, no un pronostico exacto.
 */
export const proyeccionCierreMes = (
  transactions: Transaction[],
  referencia: Date = today(),
  hoy: Date = today()
): Proyeccion => {
  const mesActual = toMonthKey(referencia);
  const mesAnterior = toMonthKey(addMonths(referencia, -1));

  const sumaMes = (mes: string) =>
    transactions
      .filter(item => esGastoPagado(item) && toMonthKey(item.fecha) === mes)
      .reduce((acc, item) => acc + Math.abs(item.importe), 0);

  const gastadoHasta = sumaMes(mesActual);
  const totalMesAnterior = sumaMes(mesAnterior);

  const diasDelMes = endOfMonth(referencia).getDate();
  const esMesEnCurso = toMonthKey(hoy) === mesActual;
  const diasTranscurridos = esMesEnCurso ? hoy.getDate() : diasDelMes;

  const ritmoDiario = diasTranscurridos > 0 ? gastadoHasta / diasTranscurridos : 0;
  const proyectado = ritmoDiario * diasDelMes;

  return {
    gastadoHasta,
    ritmoDiario,
    proyectado,
    diasTranscurridos,
    diasDelMes,
    totalMesAnterior,
    diferenciaVsAnterior: proyectado - totalMesAnterior,
    esMesEnCurso,
  };
};

export interface TendenciaCategoria {
  categoria: string;
  /** Un total por mes, del mas antiguo al mas reciente. */
  valores: number[];
  total: number;
  /** Variacion del ultimo mes contra el promedio de los anteriores, en %. */
  variacion: number;
}

/**
 * Cuanto se gasta en cada categoria mes a mes.
 *
 * El periodo seleccionado dice cuanto llevas; esto dice hacia donde va. Que
 * "Mercado" haya subido tres meses seguidos no se ve en ningun total.
 */
export const tendenciaPorCategoria = (
  transactions: Transaction[],
  meses = 6,
  referencia: Date = today()
): { meses: string[]; categorias: TendenciaCategoria[] } => {
  const clavesMes = Array.from({ length: meses }, (_, index) =>
    toMonthKey(addMonths(referencia, -(meses - 1 - index)))
  );
  const indicePorMes = new Map(clavesMes.map((clave, index) => [clave, index]));

  const porCategoria = new Map<string, number[]>();

  transactions.forEach(item => {
    if (!esGastoPagado(item)) return;
    const indice = indicePorMes.get(toMonthKey(item.fecha));
    if (indice === undefined) return;

    if (!porCategoria.has(item.categoria)) {
      porCategoria.set(item.categoria, new Array(meses).fill(0));
    }
    const valores = porCategoria.get(item.categoria)!;
    valores[indice] += Math.abs(item.importe);
  });

  const categorias = Array.from(porCategoria.entries())
    .map(([categoria, valores]) => {
      const total = valores.reduce((acc, valor) => acc + valor, 0);
      const previos = valores.slice(0, -1);
      const mesesConDato = previos.filter(valor => valor > 0).length;
      const promedioPrevio = mesesConDato > 0
        ? previos.reduce((acc, valor) => acc + valor, 0) / mesesConDato
        : 0;
      const ultimo = valores[valores.length - 1];

      const variacion = promedioPrevio > 0 ? ((ultimo - promedioPrevio) / promedioPrevio) * 100 : 0;

      return { categoria, valores, total, variacion };
    })
    .sort((a, b) => b.total - a.total);

  return { meses: clavesMes, categorias };
};

export interface EstadoPresupuesto {
  categoria: string;
  presupuesto: number;
  gastado: number;
  porcentaje: number;
  restante: number;
  excedido: boolean;
  /** Se supera el presupuesto si se mantiene el ritmo del mes. */
  enRiesgo: boolean;
}

/**
 * Cruce de presupuestos con el gasto real del mes.
 *
 * "En riesgo" mira la proyeccion, no el acumulado: avisar el dia 28 de que te
 * pasaste no sirve de nada; el dia 12 con el ritmo apuntando a exceso, si.
 */
export const estadoPresupuestos = (
  transactions: Transaction[],
  presupuestos: Array<{ categoria: string; amount: number }>,
  referencia: Date = today(),
  hoy: Date = today()
): EstadoPresupuesto[] => {
  const mes = toMonthKey(referencia);
  const diasDelMes = endOfMonth(referencia).getDate();
  const diasTranscurridos = toMonthKey(hoy) === mes ? hoy.getDate() : diasDelMes;

  const gastoPorCategoria = new Map<string, number>();
  transactions.forEach(item => {
    if (!esGastoPagado(item) || toMonthKey(item.fecha) !== mes) return;
    gastoPorCategoria.set(
      item.categoria,
      (gastoPorCategoria.get(item.categoria) ?? 0) + Math.abs(item.importe)
    );
  });

  return presupuestos
    .map(({ categoria, amount }) => {
      const gastado = gastoPorCategoria.get(categoria) ?? 0;
      const porcentaje = amount > 0 ? (gastado / amount) * 100 : 0;
      const proyectado = diasTranscurridos > 0 ? (gastado / diasTranscurridos) * diasDelMes : 0;

      return {
        categoria,
        presupuesto: amount,
        gastado,
        porcentaje,
        restante: Math.max(0, amount - gastado),
        excedido: gastado > amount,
        enRiesgo: gastado <= amount && proyectado > amount,
      };
    })
    .sort((a, b) => b.porcentaje - a.porcentaje);
};

/** Movimientos del mes de referencia, para las tarjetas del dashboard. */
export const transaccionesDelMes = (transactions: Transaction[], referencia: Date = today()) => {
  const desde = startOfMonth(referencia);
  const hasta = endOfMonth(referencia);
  return transactions.filter(item => item.fecha >= desde && item.fecha <= hasta);
};

/* ─────────────────── cuanto puedo gastar, y cuanto es fijo ─────────────────── */

export interface DisponibleMes {
  /** Plata real en todas las cuentas, ahora mismo. */
  saldoActual: number;
  /** Gastos pendientes y recurrentes que aun no han caido: ya estan gastados. */
  comprometido: number;
  porCobrar: number;
  /** Tope duro: lo que puedes mover sin quedarte en rojo. */
  disponible: number;

  ingresosDelMes: number;
  gastosDelMes: number;
  /** Lo que entro menos lo que salio y lo que falta por salir, este mes. */
  flujoDelMes: number;
  /** Lo que puedes gastar SIN tocar el ahorro. Cero si ya lo estas tocando. */
  margenDelMes: number;
  enDeficit: boolean;

  diasRestantes: number;
  porDia: number;

  /** Lo que cuesta existir cada mes: la suma de los recurrentes de gasto. */
  costoFijoMensual: number;
  esMesEnCurso: boolean;
}

/**
 * "¿Cuanto puedo gastar?" — la pregunta que uno se hace parado en la caja.
 *
 * Hay dos formas de responderla y ninguna sirve sola:
 *
 *  - Solo con el flujo del mes (entro menos salio) el numero se va a menos
 *    varios millones en cuanto tocas el ahorro para un viaje o una compra
 *    grande, y deja de significar nada.
 *  - Solo con el saldo, te dice que puedes gastarte hasta el ultimo peso
 *    ahorrado, que es pesimo consejo.
 *
 * Asi que se calculan los dos y se dice la verdad:
 *
 *  - `margenDelMes` es lo que puedes gastar sin tocar el ahorro. Es de donde
 *    sale el "$X por dia".
 *  - `disponible` es el tope real: saldo + lo que falta por cobrar − lo ya
 *    comprometido.
 *  - Si `enDeficit`, la app lo dice explicitamente en vez de ofrecer un
 *    presupuesto diario que en realidad sale del ahorro.
 *
 * Los recurrentes que ya cayeron este mes NO se suman a `comprometido`: ya son
 * transacciones reales y contarlos otra vez seria cobrarlos dos veces.
 */
export const disponibleDelMes = (
  transactions: Transaction[],
  recurrentes: RecurringTransaction[],
  saldoActual: number,
  referencia: Date = today(),
  hoy: Date = today()
): DisponibleMes => {
  const mes = toMonthKey(referencia);
  const inicioMes = startOfMonth(referencia);
  const finMes = endOfMonth(referencia);
  const diasDelMes = finMes.getDate();
  const esMesEnCurso = toMonthKey(hoy) === mes;

  const sumar = (items: Transaction[]) =>
    items.reduce((acc, item) => acc + Math.abs(item.importe), 0);

  const delMes = transactions.filter(item => toMonthKey(item.fecha) === mes);

  const ingresosDelMes = sumar(delMes.filter(esIngresoPagado));
  const gastosDelMes = sumar(delMes.filter(esGastoPagado));

  // Los pendientes vencidos de meses anteriores siguen siendo plata que debes,
  // asi que entran igual: por eso el corte es "hasta fin de mes", no "de este
  // mes". Un recibo de julio sin pagar no deja de existir en agosto.
  const pendientes = transactions.filter(
    item => item.estado_pago === 'Pendiente' && item.fecha <= finMes && !esTransferencia(item)
  );

  const pendientesGasto = sumar(pendientes.filter(item => item.tipo === 'Gasto'));
  const pendientesIngreso = sumar(pendientes.filter(item => item.tipo === 'Ingreso'));

  const activos = recurrentes.filter(item => item.activo);
  const sinCaer = activos.filter(
    item =>
      esMesEnCurso &&
      item.dia_del_mes > hoy.getDate() &&
      (item.ultima_generacion === null || item.ultima_generacion < inicioMes)
  );

  const sumarRecurrentes = (items: RecurringTransaction[], tipo: 'Ingreso' | 'Gasto') =>
    items
      .filter(item => item.tipo === tipo)
      .reduce((acc, item) => acc + Math.abs(item.importe), 0);

  const comprometido = pendientesGasto + sumarRecurrentes(sinCaer, 'Gasto');
  const porCobrar = pendientesIngreso + sumarRecurrentes(sinCaer, 'Ingreso');

  const disponible = saldoActual + porCobrar - comprometido;
  const flujoDelMes = ingresosDelMes + porCobrar - gastosDelMes - comprometido;

  // El margen nunca supera el disponible: de nada sirve decirte que te sobran
  // $500.000 del mes si en la cuenta solo hay $200.000.
  const margenDelMes = Math.max(0, Math.min(flujoDelMes, disponible));

  const diasRestantes = esMesEnCurso ? Math.max(1, diasDelMes - hoy.getDate() + 1) : diasDelMes;

  return {
    saldoActual,
    comprometido,
    porCobrar,
    disponible,
    ingresosDelMes,
    gastosDelMes,
    flujoDelMes,
    margenDelMes,
    enDeficit: flujoDelMes < 0,
    diasRestantes,
    porDia: margenDelMes / diasRestantes,
    costoFijoMensual: sumarRecurrentes(activos, 'Gasto'),
    esMesEnCurso,
  };
};
