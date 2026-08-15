import { describe, expect, it } from 'vitest';
import { construirAgenda } from './agenda';
import { toDateString } from './dates';
import type { RecurringTransaction } from '../services/extras';
import type { Transaction } from '../types';

let seq = 0;
const tx = (fecha: string, over: Partial<Transaction> = {}): Transaction => {
  const [y, m, d] = fecha.split('-').map(Number);
  return {
    id: `id-${++seq}`,
    user_id: 'user-1',
    fecha: new Date(y, m - 1, d),
    tipo: 'Gasto',
    categoria: 'Servicios',
    importe: 100_000,
    estado_pago: 'Pendiente',
    descripcion: '',
    account_id: 'cta-1',
    transfer_group: null,
    compra_id: null,
    cuota_numero: null,
    cuota_total: null,
    ...over,
  };
};

const recurrente = (over: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
  id: `rec-${++seq}`,
  tipo: 'Gasto',
  categoria: 'Servicios',
  importe: 50_000,
  account_id: 'cta-1',
  descripcion: '',
  dia_del_mes: 20,
  activo: true,
  ultima_generacion: null,
  ...over,
});

const HOY = new Date(2026, 7, 14); // 14 de agosto

describe('construirAgenda · pendientes', () => {
  it('ignora los movimientos ya pagados', () => {
    const agenda = construirAgenda([tx('2026-08-20', { estado_pago: 'Pagado' })], [], HOY);
    expect(agenda.hayAlgo).toBe(false);
  });

  it('agrupa por urgencia', () => {
    const agenda = construirAgenda(
      [
        tx('2026-08-10'), // vencido
        tx('2026-08-14'), // hoy
        tx('2026-08-18'), // esta semana
        tx('2026-09-05'), // mas adelante
      ],
      [],
      HOY
    );

    expect(agenda.items.map(item => item.grupo)).toEqual(['vencido', 'hoy', 'semana', 'despues']);
  });

  it('ordena por fecha, del mas urgente al mas lejano', () => {
    const agenda = construirAgenda([tx('2026-09-01'), tx('2026-08-05'), tx('2026-08-20')], [], HOY);
    expect(agenda.items.map(item => toDateString(item.fecha))).toEqual([
      '2026-08-05',
      '2026-08-20',
      '2026-09-01',
    ]);
  });

  it('calcula los dias restantes con signo: negativo si ya vencio', () => {
    const agenda = construirAgenda([tx('2026-08-11'), tx('2026-08-14'), tx('2026-08-21')], [], HOY);
    expect(agenda.items.map(item => item.diasRestantes)).toEqual([-3, 0, 7]);
  });

  it('el limite de "esta semana" son 7 dias inclusive', () => {
    const agenda = construirAgenda([tx('2026-08-21'), tx('2026-08-22')], [], HOY);
    expect(agenda.items[0].grupo).toBe('semana');
    expect(agenda.items[1].grupo).toBe('despues');
  });

  it('los urgentes incluyen lo vencido: es lo que mas exige atencion', () => {
    const agenda = construirAgenda([tx('2026-08-01'), tx('2026-09-30')], [], HOY);
    expect(agenda.urgentes).toHaveLength(1);
    expect(agenda.vencidos).toHaveLength(1);
  });

  it('separa lo que debes de lo que te deben', () => {
    const agenda = construirAgenda(
      [tx('2026-08-16', { importe: 300_000 }), tx('2026-08-17', { tipo: 'Ingreso', importe: 900_000 })],
      [],
      HOY
    );

    expect(agenda.montoUrgente).toBe(300_000);
    expect(agenda.porCobrar).toBe(900_000);
  });
});

describe('construirAgenda · recurrentes proyectados', () => {
  it('anuncia los recurrentes que aun no han caido este mes', () => {
    // Sin esto, alguien con el arriendo y cinco suscripciones configuradas
    // veria la agenda vacia justo cuando mas plata tiene comprometida.
    const agenda = construirAgenda([], [recurrente({ dia_del_mes: 20, importe: 100_690 })], HOY);

    expect(agenda.items).toHaveLength(1);
    expect(agenda.items[0].origen).toBe('recurrente');
    expect(toDateString(agenda.items[0].fecha)).toBe('2026-08-20');
    expect(agenda.items[0].diasRestantes).toBe(6);
  });

  it('NO anuncia los que ya pasaron su dia: ya existen como transaccion real', () => {
    const agenda = construirAgenda([], [recurrente({ dia_del_mes: 4 })], HOY);
    expect(agenda.hayAlgo).toBe(false);
  });

  it('NO anuncia los que ya se generaron este mes', () => {
    const agenda = construirAgenda(
      [],
      [recurrente({ dia_del_mes: 20, ultima_generacion: new Date(2026, 7, 1) })],
      HOY
    );
    expect(agenda.hayAlgo).toBe(false);
  });

  it('si se genero el mes pasado, este mes vuelve a anunciarse', () => {
    const agenda = construirAgenda(
      [],
      [recurrente({ dia_del_mes: 20, ultima_generacion: new Date(2026, 6, 1) })],
      HOY
    );
    expect(agenda.items).toHaveLength(1);
  });

  it('un recurrente pausado no aparece', () => {
    const agenda = construirAgenda([], [recurrente({ dia_del_mes: 20, activo: false })], HOY);
    expect(agenda.hayAlgo).toBe(false);
  });

  it('el dia 31 en un mes de 30 se ajusta al ultimo dia, no a una fecha inexistente', () => {
    const agenda = construirAgenda([], [recurrente({ dia_del_mes: 31 })], new Date(2026, 8, 10));
    expect(toDateString(agenda.items[0].fecha)).toBe('2026-09-30');
  });

  it('mezcla ambas fuentes en una sola lista ordenada', () => {
    const agenda = construirAgenda(
      [tx('2026-08-18')],
      [recurrente({ dia_del_mes: 16 }), recurrente({ dia_del_mes: 25 })],
      HOY
    );

    expect(agenda.items.map(item => toDateString(item.fecha))).toEqual([
      '2026-08-16',
      '2026-08-18',
      '2026-08-25',
    ]);
  });

  it('las claves son unicas aunque las dos fuentes compartieran id', () => {
    const agenda = construirAgenda([tx('2026-08-18', { id: 'mismo' })], [recurrente({ id: 'mismo' })], HOY);
    const claves = agenda.items.map(item => item.key);
    expect(new Set(claves).size).toBe(claves.length);
  });
});
