import { describe, expect, it } from 'vitest';
import {
  cuentasActivas,
  esTransferencia,
  movimientosSinCuenta,
  nombreDeCuenta,
  saldoTotal,
  saldosPorCuenta,
  soloIngresosYGastos,
} from './accounts';
import type { Account, Transaction } from '../types';

const cuenta = (over: Partial<Account> = {}): Account => ({
  id: 'cta-1',
  nombre: 'Principal',
  tipo: 'Banco',
  saldoInicial: 0,
  archivada: false,
  orden: 0,
  ...over,
});

let seq = 0;
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: `id-${++seq}`,
  user_id: 'user-1',
  fecha: new Date(2026, 7, 10),
  tipo: 'Gasto',
  categoria: 'Mercado',
  importe: 10_000,
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

describe('saldosPorCuenta', () => {
  it('parte del saldo inicial y le aplica los movimientos', () => {
    const [saldo] = saldosPorCuenta(
      [cuenta({ saldoInicial: 1_000_000 })],
      [tx({ tipo: 'Ingreso', importe: 500_000 }), tx({ tipo: 'Gasto', importe: 200_000 })]
    );

    expect(saldo.saldo).toBe(1_300_000);
    expect(saldo.movimientos).toBe(2);
  });

  it('un pendiente NO mueve el saldo', () => {
    // Es un compromiso, no un movimiento: esa plata todavia esta en la cuenta.
    const [saldo] = saldosPorCuenta(
      [cuenta({ saldoInicial: 1_000_000 })],
      [tx({ tipo: 'Gasto', importe: 300_000, estado_pago: 'Pendiente' })]
    );

    expect(saldo.saldo).toBe(1_000_000);
  });

  it('un saldo inicial negativo modela una tarjeta de credito', () => {
    const [saldo] = saldosPorCuenta(
      [cuenta({ tipo: 'Tarjeta', saldoInicial: -2_000_000 })],
      [tx({ tipo: 'Ingreso', importe: 500_000 })]
    );

    expect(saldo.saldo).toBe(-1_500_000);
  });

  it('no mezcla los movimientos de una cuenta con los de otra', () => {
    const saldos = saldosPorCuenta(
      [cuenta({ id: 'a', nombre: 'A', orden: 0 }), cuenta({ id: 'b', nombre: 'B', orden: 1 })],
      [
        tx({ account_id: 'a', tipo: 'Ingreso', importe: 100_000 }),
        tx({ account_id: 'b', tipo: 'Ingreso', importe: 700_000 }),
      ]
    );

    expect(saldos.map(s => s.saldo)).toEqual([100_000, 700_000]);
  });

  it('una cuenta sin movimientos devuelve su saldo inicial, no undefined', () => {
    const [saldo] = saldosPorCuenta([cuenta({ saldoInicial: 250_000 })], []);
    expect(saldo.saldo).toBe(250_000);
    expect(saldo.movimientos).toBe(0);
  });

  it('normaliza importes negativos heredados de datos viejos', () => {
    const [saldo] = saldosPorCuenta([cuenta()], [tx({ tipo: 'Gasto', importe: -50_000 })]);
    expect(saldo.saldo).toBe(-50_000);
  });

  it('ordena por el campo orden, no por nombre', () => {
    const saldos = saldosPorCuenta(
      [cuenta({ id: 'z', nombre: 'Zulu', orden: 0 }), cuenta({ id: 'a', nombre: 'Alfa', orden: 1 })],
      []
    );

    expect(saldos.map(s => s.cuenta.nombre)).toEqual(['Zulu', 'Alfa']);
  });
});

describe('transferencias', () => {
  const transferencia = (over: Partial<Transaction> = {}) =>
    tx({ transfer_group: 'grupo-1', categoria: 'Transferencia', ...over });

  it('SI mueven los saldos: la plata cambio de bolsillo de verdad', () => {
    const saldos = saldosPorCuenta(
      [
        cuenta({ id: 'a', nombre: 'A', saldoInicial: 1_000_000, orden: 0 }),
        cuenta({ id: 'b', nombre: 'B', saldoInicial: 0, orden: 1 }),
      ],
      [
        transferencia({ account_id: 'a', tipo: 'Gasto', importe: 400_000 }),
        transferencia({ account_id: 'b', tipo: 'Ingreso', importe: 400_000 }),
      ]
    );

    expect(saldos[0].saldo).toBe(600_000);
    expect(saldos[1].saldo).toBe(400_000);
  });

  it('el total no cambia al transferir entre cuentas propias', () => {
    const antes = saldoTotal(
      saldosPorCuenta(
        [cuenta({ id: 'a', saldoInicial: 1_000_000, orden: 0 }), cuenta({ id: 'b', nombre: 'B', orden: 1 })],
        []
      )
    );

    const despues = saldoTotal(
      saldosPorCuenta(
        [cuenta({ id: 'a', saldoInicial: 1_000_000, orden: 0 }), cuenta({ id: 'b', nombre: 'B', orden: 1 })],
        [
          transferencia({ account_id: 'a', tipo: 'Gasto', importe: 400_000 }),
          transferencia({ account_id: 'b', tipo: 'Ingreso', importe: 400_000 }),
        ]
      )
    );

    expect(despues).toBe(antes);
  });

  it('esTransferencia distingue por transfer_group, no por la categoria', () => {
    // Alguien puede llamar "Transferencia" a una categoria suya sin que eso la
    // convierta en una transferencia entre cuentas.
    expect(esTransferencia(tx({ categoria: 'Transferencia' }))).toBe(false);
    expect(esTransferencia(tx({ transfer_group: 'x' }))).toBe(true);
  });

  it('soloIngresosYGastos las filtra y conserva el resto', () => {
    const items = [tx(), transferencia(), tx()];
    expect(soloIngresosYGastos(items)).toHaveLength(2);
  });
});

describe('saldoTotal y cuentas huerfanas', () => {
  it('una cuenta archivada sigue sumando al total', () => {
    // Archivar es "no me la ofrezcas al registrar", no "esa plata desaparecio".
    const saldos = saldosPorCuenta(
      [
        cuenta({ id: 'a', saldoInicial: 500_000, orden: 0 }),
        cuenta({ id: 'b', nombre: 'Vieja', saldoInicial: 300_000, archivada: true, orden: 1 }),
      ],
      []
    );

    expect(saldoTotal(saldos)).toBe(800_000);
  });

  it('un movimiento sin cuenta no se reparte en silencio: se cuenta aparte', () => {
    const items = [tx({ account_id: null }), tx()];
    const saldos = saldosPorCuenta([cuenta({ saldoInicial: 0 })], items);

    expect(saldos[0].saldo).toBe(-10_000); // solo el que si tiene cuenta
    expect(movimientosSinCuenta(items)).toBe(1);
  });
});

describe('helpers de cuentas', () => {
  it('cuentasActivas excluye las archivadas', () => {
    const lista = [cuenta({ id: 'a' }), cuenta({ id: 'b', nombre: 'B', archivada: true })];
    expect(cuentasActivas(lista).map(c => c.id)).toEqual(['a']);
  });

  it('nombreDeCuenta tolera ids inexistentes y nulos', () => {
    const lista = [cuenta({ id: 'a', nombre: 'Nequi' })];
    expect(nombreDeCuenta(lista, 'a')).toBe('Nequi');
    expect(nombreDeCuenta(lista, 'zzz')).toBe('Sin cuenta');
    expect(nombreDeCuenta(lista, null)).toBe('Sin cuenta');
  });
});
