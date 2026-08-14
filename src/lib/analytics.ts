import type { Transaction } from '../types';
import { addMonths, endOfMonth, startOfMonth, toMonthKey, today } from './dates';

/**
 * Analitica que responde "¿como voy?" en vez de "¿cuanto llevo?".
 *
 * El dashboard anterior solo mostraba totales del periodo. Eso te dice donde
 * estas, pero no si vas bien: a mitad de mes, $800.000 gastados puede ser
 * excelente o pesimo segun como venias. Estas funciones comparan contra el mes
 * anterior y proyectan el cierre.
 */

const esGastoPagado = (t: Transaction) => t.tipo === 'Gasto' && t.estado_pago === 'Pagado';

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
