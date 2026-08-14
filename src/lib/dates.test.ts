import { describe, expect, it } from 'vitest';
import { addMonths, endOfMonth, parseLocalDate, startOfMonth, toDateString, toMonthKey } from './dates';

describe('parseLocalDate', () => {
  it('interpreta "YYYY-MM-DD" en zona local, no en UTC', () => {
    // Este es el bug original: new Date("2026-08-14") daba medianoche UTC, que
    // en cualquier zona al oeste de Greenwich cae el dia anterior.
    const fecha = parseLocalDate('2026-08-14');

    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth()).toBe(7); // agosto
    expect(fecha.getDate()).toBe(14);
  });

  it('no se corre un dia respecto a new Date() sobre el mismo string', () => {
    const local = parseLocalDate('2026-01-01');
    expect(local.getDate()).toBe(1);
    expect(local.getMonth()).toBe(0);
    expect(local.getFullYear()).toBe(2026);
  });

  it('ignora la parte horaria de un ISO completo', () => {
    const fecha = parseLocalDate('2026-03-02T00:00:00+00:00');
    expect(toDateString(fecha)).toBe('2026-03-02');
  });

  it('deja pasar un Date sin tocarlo', () => {
    const original = new Date(2026, 5, 9);
    expect(parseLocalDate(original)).toBe(original);
  });
});

describe('toDateString', () => {
  it('serializa usando componentes locales', () => {
    expect(toDateString(new Date(2026, 7, 14))).toBe('2026-08-14');
  });

  it('rellena mes y dia con ceros', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('hace round-trip exacto con parseLocalDate', () => {
    for (const valor of ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29']) {
      expect(toDateString(parseLocalDate(valor))).toBe(valor);
    }
  });
});

describe('helpers de mes', () => {
  it('toMonthKey agrupa por ano-mes local', () => {
    expect(toMonthKey(new Date(2026, 7, 31))).toBe('2026-08');
    expect(toMonthKey(new Date(2026, 0, 1))).toBe('2026-01');
  });

  it('startOfMonth y endOfMonth cubren el mes completo', () => {
    const referencia = new Date(2026, 1, 15); // febrero 2026
    expect(toDateString(startOfMonth(referencia))).toBe('2026-02-01');
    expect(toDateString(endOfMonth(referencia))).toBe('2026-02-28');
  });

  it('endOfMonth respeta anos bisiestos', () => {
    expect(toDateString(endOfMonth(new Date(2024, 1, 10)))).toBe('2024-02-29');
  });

  it('addMonths cruza el cambio de ano', () => {
    expect(toMonthKey(addMonths(new Date(2026, 0, 15), -1))).toBe('2025-12');
    expect(toMonthKey(addMonths(new Date(2026, 11, 15), 1))).toBe('2027-01');
  });
});
