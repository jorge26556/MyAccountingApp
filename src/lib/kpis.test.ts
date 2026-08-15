import { describe, expect, it } from 'vitest';
import { applyFilters, computeKpis, previousPeriod, resolvePeriod } from './kpis';
import { toDateString } from './dates';
import type { DashboardFilters, SavingsGoal, Transaction } from '../types';

let seq = 0;
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: `id-${++seq}`,
  user_id: 'user-1',
  fecha: new Date(2026, 7, 10),
  tipo: 'Gasto',
  categoria: 'Mercado',
  importe: 10000,
  estado_pago: 'Pagado',
  descripcion: '',
  account_id: 'cuenta-1',
  transfer_group: null,
  ...over,
});

const SIN_RANGO = { desde: null, hasta: null };

describe('computeKpis · totales', () => {
  it('suma ingresos y gastos por separado', () => {
    const kpis = computeKpis(
      [
        tx({ tipo: 'Ingreso', importe: 3_000_000 }),
        tx({ tipo: 'Gasto', importe: 800_000 }),
        tx({ tipo: 'Gasto', importe: 200_000 }),
      ],
      [],
      []
    );

    expect(kpis.totalIngresos).toBe(3_000_000);
    expect(kpis.totalGastos).toBe(1_000_000);
    expect(kpis.beneficioNeto).toBe(2_000_000);
  });

  it('excluye los pendientes de los totales y los reporta aparte', () => {
    // Antes los pendientes se sumaban como si ya se hubieran pagado, asi que el
    // "ahorro" incluia plata que todavia no salia de la cuenta.
    const kpis = computeKpis(
      [
        tx({ tipo: 'Ingreso', importe: 1_000_000 }),
        tx({ tipo: 'Gasto', importe: 300_000 }),
        tx({ tipo: 'Gasto', importe: 500_000, estado_pago: 'Pendiente' }),
        tx({ tipo: 'Ingreso', importe: 250_000, estado_pago: 'Pendiente' }),
      ],
      [],
      []
    );

    expect(kpis.totalIngresos).toBe(1_000_000);
    expect(kpis.totalGastos).toBe(300_000);
    expect(kpis.beneficioNeto).toBe(700_000);
    expect(kpis.gastosPendientes).toBe(500_000);
    expect(kpis.ingresosPendientes).toBe(250_000);
  });

  it('normaliza importes negativos que pudieran venir de datos viejos', () => {
    const kpis = computeKpis([tx({ tipo: 'Gasto', importe: -50_000 })], [], []);
    expect(kpis.totalGastos).toBe(50_000);
  });

  it('devuelve ceros con dataset vacio, sin NaN', () => {
    const kpis = computeKpis([], [], []);

    expect(kpis.totalIngresos).toBe(0);
    expect(kpis.beneficioNeto).toBe(0);
    expect(Number.isNaN(kpis.variacionAhorro)).toBe(false);
  });
});

describe('computeKpis · transferencias entre cuentas propias', () => {
  const transferencia = (over: Partial<Transaction> = {}) =>
    tx({ transfer_group: 'grupo-1', categoria: 'Transferencia', ...over });

  it('no cuenta una transferencia ni como ingreso ni como gasto', () => {
    // El bug clasico: pasar $500.000 de una cuenta a otra se guardaba como un
    // gasto Y un ingreso normales. El balance seguia cuadrando —por eso nadie
    // lo notaba— pero ingresos y gastos del mes salian inflados en $500.000.
    const kpis = computeKpis(
      [
        tx({ tipo: 'Ingreso', importe: 1_000_000 }),
        tx({ tipo: 'Gasto', importe: 300_000 }),
        transferencia({ tipo: 'Gasto', importe: 500_000 }),
        transferencia({ tipo: 'Ingreso', importe: 500_000 }),
      ],
      [],
      []
    );

    expect(kpis.totalIngresos).toBe(1_000_000);
    expect(kpis.totalGastos).toBe(300_000);
    expect(kpis.beneficioNeto).toBe(700_000);
  });

  it('tampoco las cuenta en el periodo anterior', () => {
    const anteriores = [
      tx({ tipo: 'Ingreso', importe: 1_000_000 }),
      tx({ tipo: 'Gasto', importe: 400_000 }),
      transferencia({ tipo: 'Gasto', importe: 900_000 }),
      transferencia({ tipo: 'Ingreso', importe: 900_000 }),
    ];

    const kpis = computeKpis([tx({ tipo: 'Ingreso', importe: 600_000 })], anteriores, []);
    expect(kpis.ahorroPeriodoAnterior).toBe(600_000);
  });

  it('una transferencia pendiente tampoco entra en los pendientes', () => {
    const kpis = computeKpis(
      [transferencia({ tipo: 'Gasto', importe: 500_000, estado_pago: 'Pendiente' })],
      [],
      []
    );

    expect(kpis.gastosPendientes).toBe(0);
  });
});

describe('computeKpis · variacion contra periodo anterior', () => {
  it('calcula el porcentaje de cambio del ahorro', () => {
    const actuales = [tx({ tipo: 'Ingreso', importe: 1_000_000 }), tx({ importe: 400_000 })];
    const anteriores = [tx({ tipo: 'Ingreso', importe: 1_000_000 }), tx({ importe: 500_000 })];

    // 600.000 vs 500.000 = +20%
    expect(computeKpis(actuales, anteriores, []).variacionAhorro).toBeCloseTo(20);
  });

  it('maneja ahorro anterior negativo sin invertir el signo', () => {
    const actuales = [tx({ tipo: 'Ingreso', importe: 100_000 })];
    const anteriores = [tx({ importe: 200_000 })]; // ahorro anterior = -200.000

    // Pasar de -200.000 a +100.000 es una mejora: debe dar positivo.
    expect(computeKpis(actuales, anteriores, []).variacionAhorro).toBeGreaterThan(0);
  });

  it('no divide por cero cuando el periodo anterior es 0', () => {
    const kpis = computeKpis([tx({ tipo: 'Ingreso', importe: 500_000 })], [], []);
    expect(kpis.variacionAhorro).toBe(100);
    expect(Number.isFinite(kpis.variacionAhorro)).toBe(true);
  });

  it('marca cuando no hay periodo anterior con el cual comparar', () => {
    expect(computeKpis([tx()], [], []).tieneComparativo).toBe(false);
    expect(computeKpis([tx()], [tx()], []).tieneComparativo).toBe(true);
  });
});

describe('computeKpis · metas de ahorro', () => {
  const metas: SavingsGoal[] = [
    { id: 'g1', name: 'Viaje', amount: 1_000_000 },
    { id: 'g2', name: 'Reserva', amount: 5_000_000 },
  ];

  it('devuelve el progreso de TODAS las metas, no solo la primera', () => {
    // Antes el dashboard hacia savingsGoals[0] y las demas eran invisibles.
    const kpis = computeKpis([tx({ tipo: 'Ingreso', importe: 2_000_000 })], [], metas);
    expect(kpis.metas).toHaveLength(2);
  });

  it('calcula porcentaje, faltante y completitud', () => {
    const kpis = computeKpis([tx({ tipo: 'Ingreso', importe: 2_000_000 })], [], metas);

    expect(kpis.metas[0].completada).toBe(true);
    expect(kpis.metas[0].faltante).toBe(0);
    expect(kpis.metas[1].completada).toBe(false);
    expect(kpis.metas[1].faltante).toBe(3_000_000);
    expect(kpis.metas[1].porcentaje).toBeCloseTo(40);
  });

  it('no produce porcentajes negativos con ahorro en rojo', () => {
    const kpis = computeKpis([tx({ importe: 500_000 })], [], metas);
    expect(kpis.metas[0].porcentaje).toBe(0);
    // Con el ahorro en -500.000, alcanzar una meta de 1.000.000 exige 1.500.000:
    // el faltante se mide desde donde estas, no desde cero.
    expect(kpis.metas[0].faltante).toBe(1_500_000);
  });
});

describe('resolvePeriod', () => {
  it('mes-actual cubre del 1 al ultimo dia del mes', () => {
    const { desde, hasta } = resolvePeriod('mes-actual', { dateFrom: null, dateTo: null });
    expect(desde!.getDate()).toBe(1);
    expect(hasta!.getMonth()).toBe(desde!.getMonth());
    // El dia siguiente al "hasta" ya es otro mes.
    const siguiente = new Date(hasta!.getTime() + 86_400_000);
    expect(siguiente.getMonth()).not.toBe(hasta!.getMonth());
  });

  it('todo no impone limites', () => {
    expect(resolvePeriod('todo', { dateFrom: null, dateTo: null })).toEqual({
      desde: null,
      hasta: null,
    });
  });

  it('custom respeta las fechas dadas', () => {
    const dateFrom = new Date(2026, 2, 1);
    const dateTo = new Date(2026, 2, 15);
    expect(resolvePeriod('custom', { dateFrom, dateTo })).toEqual({ desde: dateFrom, hasta: dateTo });
  });
});

describe('previousPeriod', () => {
  it('agosto se compara contra julio COMPLETO, incluyendo el dia 1', () => {
    // Regresion: restando milisegundos, el inicio caia el 1 de julio a las
    // 23:59:59.999 y las transacciones de ese dia (guardadas a medianoche)
    // quedaban fuera del comparativo.
    const anterior = previousPeriod(new Date(2026, 7, 1), new Date(2026, 7, 31))!;

    expect(toDateString(anterior.desde)).toBe('2026-07-01');
    expect(toDateString(anterior.hasta)).toBe('2026-07-31');
  });

  it('devuelve fechas a medianoche local', () => {
    const anterior = previousPeriod(new Date(2026, 7, 1), new Date(2026, 7, 31))!;

    for (const fecha of [anterior.desde, anterior.hasta]) {
      expect(fecha.getHours()).toBe(0);
      expect(fecha.getMinutes()).toBe(0);
      expect(fecha.getSeconds()).toBe(0);
      expect(fecha.getMilliseconds()).toBe(0);
    }
  });

  it('conserva la cantidad de dias del periodo original', () => {
    const casos: Array<[Date, Date, number]> = [
      [new Date(2026, 7, 1), new Date(2026, 7, 31), 31], // agosto
      [new Date(2026, 1, 1), new Date(2026, 1, 28), 28], // febrero
      [new Date(2026, 7, 10), new Date(2026, 7, 16), 7], // una semana
    ];

    for (const [desde, hasta, diasEsperados] of casos) {
      const anterior = previousPeriod(desde, hasta)!;
      const dias =
        Math.round((anterior.hasta.getTime() - anterior.desde.getTime()) / 86_400_000) + 1;
      expect(dias).toBe(diasEsperados);
    }
  });

  it('el rango anterior termina justo el dia previo al inicio del actual', () => {
    const anterior = previousPeriod(new Date(2026, 0, 1), new Date(2026, 0, 31))!;
    // Cruce de ano.
    expect(toDateString(anterior.hasta)).toBe('2025-12-31');
    expect(toDateString(anterior.desde)).toBe('2025-12-01');
  });

  it('es null cuando el periodo es abierto', () => {
    expect(previousPeriod(null, null)).toBeNull();
    expect(previousPeriod(new Date(), null)).toBeNull();
  });
});

describe('applyFilters', () => {
  const base: DashboardFilters = {
    period: 'todo',
    dateFrom: null,
    dateTo: null,
    tipo: 'Todos',
    categorias: [],
    cuentas: [],
    estadoPago: 'Todos',
    activeSearch: '',
  };

  const datos = [
    tx({ categoria: 'Mercado', account_id: 'nequi', tipo: 'Gasto', descripcion: 'Frutas' }),
    tx({ categoria: 'Arriendo', account_id: 'banco', tipo: 'Gasto', descripcion: 'Agosto' }),
    tx({ categoria: 'Salario', account_id: 'banco', tipo: 'Ingreso', descripcion: 'Quincena' }),
  ];

  it('sin filtros devuelve todo', () => {
    expect(applyFilters(datos, base, SIN_RANGO)).toHaveLength(3);
  });

  it('filtra por tipo', () => {
    expect(applyFilters(datos, { ...base, tipo: 'Ingreso' }, SIN_RANGO)).toHaveLength(1);
  });

  it('filtra por cuenta', () => {
    expect(applyFilters(datos, { ...base, cuentas: ['nequi'] }, SIN_RANGO)).toHaveLength(1);
  });

  it('combina categoria y cuenta como AND', () => {
    const resultado = applyFilters(
      datos,
      { ...base, categorias: ['Arriendo'], cuentas: ['banco'] },
      SIN_RANGO
    );
    expect(resultado).toHaveLength(1);
    expect(resultado[0].categoria).toBe('Arriendo');
  });

  it('un movimiento sin cuenta no cuela en el filtro de cuentas', () => {
    // Antes `item.canal` siempre tenia valor. `account_id` puede ser null si se
    // borro la cuenta, y `null` no debe coincidir con ninguna seleccion.
    const huerfano = [tx({ account_id: null })];
    expect(applyFilters(huerfano, { ...base, cuentas: ['banco'] }, SIN_RANGO)).toHaveLength(0);
  });

  it('la busqueda tambien mira la categoria, no solo la descripcion', () => {
    expect(applyFilters(datos, { ...base, activeSearch: 'arriendo' }, SIN_RANGO)).toHaveLength(1);
  });

  it('la busqueda ignora mayusculas y espacios sobrantes', () => {
    expect(applyFilters(datos, { ...base, activeSearch: '  FRUTAS ' }, SIN_RANGO)).toHaveLength(1);
  });

  it('respeta los limites del rango de fechas de forma inclusiva', () => {
    const datosFecha = [
      tx({ fecha: new Date(2026, 7, 1) }),
      tx({ fecha: new Date(2026, 7, 15) }),
      tx({ fecha: new Date(2026, 8, 1) }),
    ];

    const resultado = applyFilters(datosFecha, base, {
      desde: new Date(2026, 7, 1),
      hasta: new Date(2026, 7, 31),
    });

    expect(resultado).toHaveLength(2);
  });
});
