import { describe, expect, it } from 'vitest';
import { estadoDeDeuda, resumenDeudas, tipoDeMovimiento } from './deudas';
import { esNeutro, saldoTotal, saldosPorCuenta, soloIngresosYGastos } from './accounts';
import { computeKpis } from './kpis';
import type { Account, Debt, Transaction } from '../types';

let seq = 0;

const deuda = (over: Partial<Debt> = {}): Debt => ({
  id: `deuda-${++seq}`,
  persona: 'Juan',
  tipo: 'me_deben',
  descripcion: '',
  archivada: false,
  ...over,
});

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: `id-${++seq}`,
  user_id: 'user-1',
  fecha: new Date(2026, 7, 10),
  tipo: 'Gasto',
  categoria: 'Préstamo',
  importe: 500_000,
  estado_pago: 'Pagado',
  descripcion: '',
  account_id: 'cta-1',
  transfer_group: null,
  compra_id: null,
  cuota_numero: null,
  cuota_total: null,
  debt_id: null,
  recibo_path: null,
  ...over,
});

describe('estadoDeDeuda · me deben', () => {
  const juan = deuda({ id: 'd1', tipo: 'me_deben' });

  it('el préstamo sale de tu cuenta, asi que es un Gasto', () => {
    const estado = estadoDeDeuda(juan, [tx({ debt_id: 'd1', tipo: 'Gasto', importe: 500_000 })]);

    expect(estado.original).toBe(500_000);
    expect(estado.abonado).toBe(0);
    expect(estado.pendiente).toBe(500_000);
    expect(estado.saldada).toBe(false);
  });

  it('la devolucion entra como Ingreso y baja lo pendiente', () => {
    const estado = estadoDeDeuda(juan, [
      tx({ debt_id: 'd1', tipo: 'Gasto', importe: 500_000 }),
      tx({ debt_id: 'd1', tipo: 'Ingreso', importe: 200_000 }),
    ]);

    expect(estado.abonado).toBe(200_000);
    expect(estado.pendiente).toBe(300_000);
    expect(estado.porcentaje).toBeCloseTo(40);
  });

  it('queda saldada al devolver todo', () => {
    const estado = estadoDeDeuda(juan, [
      tx({ debt_id: 'd1', tipo: 'Gasto', importe: 500_000 }),
      tx({ debt_id: 'd1', tipo: 'Ingreso', importe: 500_000 }),
    ]);

    expect(estado.pendiente).toBe(0);
    expect(estado.saldada).toBe(true);
  });

  it('un abono de mas la salda igual, no la deja abierta para siempre', () => {
    const estado = estadoDeDeuda(juan, [
      tx({ debt_id: 'd1', tipo: 'Gasto', importe: 500_000 }),
      tx({ debt_id: 'd1', tipo: 'Ingreso', importe: 520_000 }),
    ]);

    expect(estado.saldada).toBe(true);
  });

  it('ignora los movimientos de otras deudas', () => {
    const estado = estadoDeDeuda(juan, [
      tx({ debt_id: 'd1', importe: 500_000 }),
      tx({ debt_id: 'd2', importe: 900_000 }),
      tx({ debt_id: null, importe: 100_000 }),
    ]);

    expect(estado.original).toBe(500_000);
    expect(estado.movimientos).toBe(1);
  });
});

describe('estadoDeDeuda · debo', () => {
  const mama = deuda({ id: 'd3', persona: 'Mamá', tipo: 'debo' });

  it('la direccion se invierte: recibir es Ingreso y pagar es Gasto', () => {
    const estado = estadoDeDeuda(mama, [
      tx({ debt_id: 'd3', tipo: 'Ingreso', importe: 1_000_000 }),
      tx({ debt_id: 'd3', tipo: 'Gasto', importe: 400_000 }),
    ]);

    expect(estado.original).toBe(1_000_000);
    expect(estado.abonado).toBe(400_000);
    expect(estado.pendiente).toBe(600_000);
  });
});

describe('resumenDeudas', () => {
  const datos = [
    tx({ debt_id: 'a', tipo: 'Gasto', importe: 500_000 }),
    tx({ debt_id: 'a', tipo: 'Ingreso', importe: 200_000 }),
    tx({ debt_id: 'b', tipo: 'Gasto', importe: 100_000 }),
    tx({ debt_id: 'c', tipo: 'Ingreso', importe: 700_000 }),
  ];

  const deudas = [
    deuda({ id: 'a', persona: 'Juan', tipo: 'me_deben' }),
    deuda({ id: 'b', persona: 'Ana', tipo: 'me_deben' }),
    deuda({ id: 'c', persona: 'Mamá', tipo: 'debo' }),
  ];

  it('separa lo que te deben de lo que debes', () => {
    const resumen = resumenDeudas(deudas, datos);

    expect(resumen.teDeben).toBe(400_000); // 300.000 de Juan + 100.000 de Ana
    expect(resumen.debes).toBe(700_000);
  });

  it('las saldadas no suman a los totales', () => {
    const conSaldada = [...datos, tx({ debt_id: 'b', tipo: 'Ingreso', importe: 100_000 })];
    const resumen = resumenDeudas(deudas, conSaldada);

    expect(resumen.teDeben).toBe(300_000);
    expect(resumen.abiertas).toHaveLength(2);
  });

  it('las archivadas desaparecen del resumen', () => {
    const resumen = resumenDeudas(
      deudas.map(d => (d.id === 'c' ? { ...d, archivada: true } : d)),
      datos
    );

    expect(resumen.debes).toBe(0);
    expect(resumen.estados).toHaveLength(2);
  });

  it('ordena por monto pendiente, de mayor a menor', () => {
    const resumen = resumenDeudas(deudas, datos);
    expect(resumen.estados.map(e => e.deuda.persona)).toEqual(['Mamá', 'Juan', 'Ana']);
  });

  it('sin deudas no hay nada que mostrar', () => {
    const resumen = resumenDeudas([], datos);
    expect(resumen.hayAlgo).toBe(false);
    expect(resumen.teDeben).toBe(0);
  });
});

describe('tipoDeMovimiento', () => {
  it('para "me deben", prestar es Gasto y el abono es Ingreso', () => {
    expect(tipoDeMovimiento('me_deben', 'original')).toBe('Gasto');
    expect(tipoDeMovimiento('me_deben', 'abono')).toBe('Ingreso');
  });

  it('para "debo" es al reves', () => {
    expect(tipoDeMovimiento('debo', 'original')).toBe('Ingreso');
    expect(tipoDeMovimiento('debo', 'abono')).toBe('Gasto');
  });
});

describe('una deuda no es ni gasto ni ingreso', () => {
  const prestamo = tx({ debt_id: 'd1', tipo: 'Gasto', importe: 500_000 });

  it('el prestamo SI saca la plata de la cuenta', () => {
    // Es lo que lo distingue de una anotacion suelta: el dinero se movio.
    const cuenta: Account = {
      id: 'cta-1',
      nombre: 'Banco',
      tipo: 'Banco',
      saldoInicial: 2_000_000,
      archivada: false,
      orden: 0,
    };

    expect(saldoTotal(saldosPorCuenta([cuenta], [prestamo]))).toBe(1_500_000);
  });

  it('pero NO infla los gastos del periodo', () => {
    // Prestar no te empobrece: la plata sigue siendo tuya, solo que la tiene
    // otro. Contarlo como gasto hundiria el balance del mes sin motivo.
    const kpis = computeKpis(
      [tx({ tipo: 'Gasto', importe: 300_000, debt_id: null }), prestamo],
      [],
      []
    );

    expect(kpis.totalGastos).toBe(300_000);
    expect(kpis.beneficioNeto).toBe(-300_000);
  });

  it('ni la devolucion cuenta como ingreso', () => {
    const kpis = computeKpis(
      [tx({ tipo: 'Ingreso', importe: 500_000, debt_id: 'd1' })],
      [],
      []
    );

    expect(kpis.totalIngresos).toBe(0);
  });

  it('esNeutro cubre transferencias y deudas por igual', () => {
    expect(esNeutro(tx({ transfer_group: 'g1' }))).toBe(true);
    expect(esNeutro(tx({ debt_id: 'd1' }))).toBe(true);
    expect(esNeutro(tx())).toBe(false);
  });

  it('soloIngresosYGastos las deja fuera de las graficas', () => {
    const items = [tx(), tx({ debt_id: 'd1' }), tx({ transfer_group: 'g1' })];
    expect(soloIngresosYGastos(items)).toHaveLength(1);
  });
});
