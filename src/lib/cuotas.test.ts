import { describe, expect, it } from 'vitest';
import { MAX_CUOTAS, etiquetaCuota, planDeCuotas } from './cuotas';
import { toDateString } from './dates';

describe('planDeCuotas · reparto', () => {
  it('divide en partes iguales cuando la division es exacta', () => {
    const plan = planDeCuotas({ total: 1_200_000, cuotas: 12, primeraFecha: new Date(2026, 7, 15) });

    expect(plan).toHaveLength(12);
    expect(plan.every(cuota => cuota.importe === 100_000)).toBe(true);
  });

  it('la suma del plan es SIEMPRE el total exacto', () => {
    // El caso feo: 1.000.000 / 3 = 333.333,33. Redondeando cada cuota se
    // perderia un peso y el plan no cuadraria contra el extracto del banco.
    const casos: Array<[number, number]> = [
      [1_000_000, 3],
      [999_999, 7],
      [1_234_567, 13],
      [50_000, 60],
      [1, 2],
    ];

    for (const [total, cuotas] of casos) {
      const plan = planDeCuotas({ total, cuotas, primeraFecha: new Date(2026, 7, 15) });
      const suma = plan.reduce((acc, cuota) => acc + cuota.importe, 0);
      expect(suma).toBe(total);
    }
  });

  it('el sobrante va en la ultima cuota, no repartido al azar', () => {
    const plan = planDeCuotas({ total: 1_000_000, cuotas: 3, primeraFecha: new Date(2026, 7, 15) });

    expect(plan.map(c => c.importe)).toEqual([333_333, 333_333, 333_334]);
  });

  it('numera las cuotas desde 1 y guarda el total en cada una', () => {
    const plan = planDeCuotas({ total: 300_000, cuotas: 3, primeraFecha: new Date(2026, 7, 15) });

    expect(plan.map(c => c.numero)).toEqual([1, 2, 3]);
    expect(plan.every(c => c.total === 3)).toBe(true);
  });
});

describe('planDeCuotas · fechas', () => {
  it('avanza un mes por cuota conservando el dia', () => {
    const plan = planDeCuotas({ total: 300_000, cuotas: 3, primeraFecha: new Date(2026, 7, 15) });

    expect(plan.map(c => toDateString(c.fecha))).toEqual([
      '2026-08-15',
      '2026-09-15',
      '2026-10-15',
    ]);
  });

  it('cruza el fin de ano sin perderse', () => {
    const plan = planDeCuotas({ total: 300_000, cuotas: 3, primeraFecha: new Date(2026, 10, 20) });

    expect(plan.map(c => toDateString(c.fecha))).toEqual([
      '2026-11-20',
      '2026-12-20',
      '2027-01-20',
    ]);
  });

  it('el dia 31 se ajusta al ultimo dia del mes que no lo tiene', () => {
    const plan = planDeCuotas({ total: 400_000, cuotas: 4, primeraFecha: new Date(2026, 0, 31) });

    expect(plan.map(c => toDateString(c.fecha))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('el ajuste NO se arrastra: tras febrero vuelve al 31', () => {
    // Si cada cuota se calculara desde la anterior, una compra del 31 de enero
    // caeria el 28 de febrero y se quedaria clavada en el 28 para siempre.
    const plan = planDeCuotas({ total: 300_000, cuotas: 3, primeraFecha: new Date(2026, 0, 31) });
    expect(toDateString(plan[2].fecha)).toBe('2026-03-31');
  });

  it('todas las fechas quedan a medianoche local', () => {
    const plan = planDeCuotas({ total: 300_000, cuotas: 3, primeraFecha: new Date(2026, 7, 15) });

    for (const cuota of plan) {
      expect(cuota.fecha.getHours()).toBe(0);
      expect(cuota.fecha.getMinutes()).toBe(0);
      expect(cuota.fecha.getMilliseconds()).toBe(0);
    }
  });
});

describe('planDeCuotas · validacion', () => {
  const fecha = new Date(2026, 7, 15);

  it('rechaza totales no positivos', () => {
    expect(() => planDeCuotas({ total: 0, cuotas: 3, primeraFecha: fecha })).toThrow();
    expect(() => planDeCuotas({ total: -100, cuotas: 3, primeraFecha: fecha })).toThrow();
  });

  it('rechaza una sola cuota: eso es un gasto normal', () => {
    expect(() => planDeCuotas({ total: 100_000, cuotas: 1, primeraFecha: fecha })).toThrow();
  });

  it('rechaza numeros de cuota absurdos o no enteros', () => {
    expect(() => planDeCuotas({ total: 100_000, cuotas: MAX_CUOTAS + 1, primeraFecha: fecha })).toThrow();
    expect(() => planDeCuotas({ total: 100_000, cuotas: 2.5, primeraFecha: fecha })).toThrow();
  });
});

describe('etiquetaCuota', () => {
  it('numera la descripcion para que la cuota se identifique sola', () => {
    expect(etiquetaCuota('Nevera', 3, 12)).toBe('Nevera (3/12)');
  });

  it('sin descripcion sigue diciendo de que cuota se trata', () => {
    expect(etiquetaCuota('', 1, 6)).toBe('Cuota 1/6');
    expect(etiquetaCuota('   ', 1, 6)).toBe('Cuota 1/6');
  });
});
