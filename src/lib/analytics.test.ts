import { describe, expect, it } from 'vitest';
import {
  disponibleDelMes,
  estadoPresupuestos,
  gastoAcumuladoComparado,
  proyeccionCierreMes,
  tendenciaPorCategoria,
} from './analytics';
import type { RecurringTransaction } from '../services/extras';
import type { Transaction } from '../types';

let seq = 0;
const tx = (fecha: string, importe: number, over: Partial<Transaction> = {}): Transaction => {
  const [y, m, d] = fecha.split('-').map(Number);
  return {
    id: `id-${++seq}`,
    user_id: 'user-1',
    fecha: new Date(y, m - 1, d),
    tipo: 'Gasto',
    categoria: 'Mercado',
    importe,
    estado_pago: 'Pagado',
    descripcion: '',
    account_id: 'cuenta-1',
    transfer_group: null,
    compra_id: null,
    cuota_numero: null,
    cuota_total: null,
    debt_id: null,
    recibo_path: null,
    ...over,
  };
};

const recurrente = (over: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
  id: `rec-${++seq}`,
  tipo: 'Gasto',
  categoria: 'Servicios',
  importe: 50_000,
  account_id: 'cuenta-1',
  descripcion: '',
  dia_del_mes: 20,
  activo: true,
  ultima_generacion: null,
  ...over,
});

// Fechas fijas: todas las funciones reciben "hoy" para no depender del reloj.
const AGOSTO = new Date(2026, 7, 1);
const HOY_15_AGO = new Date(2026, 7, 15);

describe('gastoAcumuladoComparado', () => {
  const datos = [
    tx('2026-07-05', 100_000),
    tx('2026-07-20', 400_000),
    tx('2026-08-03', 200_000),
    tx('2026-08-10', 150_000),
  ];

  it('acumula el gasto dia a dia, no lo reinicia', () => {
    const serie = gastoAcumuladoComparado(datos, AGOSTO, HOY_15_AGO);

    expect(serie.find(d => d.dia === 3)?.actual).toBe(200_000);
    expect(serie.find(d => d.dia === 10)?.actual).toBe(350_000);
    expect(serie.find(d => d.dia === 15)?.actual).toBe(350_000);
  });

  it('corta la linea del mes en curso en el dia de hoy', () => {
    // Dibujarla plana hasta el 31 sugeriria que ya no vas a gastar mas.
    const serie = gastoAcumuladoComparado(datos, AGOSTO, HOY_15_AGO);

    expect(serie.find(d => d.dia === 15)?.actual).not.toBeNull();
    expect(serie.find(d => d.dia === 16)?.actual).toBeNull();
    expect(serie.find(d => d.dia === 31)?.actual).toBeNull();
  });

  it('dibuja el mes anterior completo', () => {
    const serie = gastoAcumuladoComparado(datos, AGOSTO, HOY_15_AGO);

    expect(serie.find(d => d.dia === 20)?.anterior).toBe(500_000);
    expect(serie.find(d => d.dia === 31)?.anterior).toBe(500_000);
  });

  it('ambas series arrancan desde cero el dia 1', () => {
    const serie = gastoAcumuladoComparado(datos, AGOSTO, HOY_15_AGO);
    expect(serie[0].dia).toBe(1);
    expect(serie[0].actual).toBe(0);
    expect(serie[0].anterior).toBe(0);
  });

  it('cubre tantos dias como el mas largo de los dos meses', () => {
    // Marzo (31) contra febrero (28).
    const serie = gastoAcumuladoComparado([], new Date(2026, 2, 1), new Date(2026, 2, 31));
    expect(serie).toHaveLength(31);
    // Febrero no tiene dia 29 en 2026: la serie anterior se corta ahi.
    expect(serie.find(d => d.dia === 29)?.anterior).toBeNull();
  });

  it('un mes pasado se dibuja completo, sin corte', () => {
    const serie = gastoAcumuladoComparado(datos, new Date(2026, 6, 1), HOY_15_AGO);
    expect(serie.find(d => d.dia === 31)?.actual).toBe(500_000);
  });

  it('ignora ingresos y pendientes', () => {
    const mezcla = [
      tx('2026-08-05', 100_000),
      tx('2026-08-06', 999_999, { tipo: 'Ingreso' }),
      tx('2026-08-07', 888_888, { estado_pago: 'Pendiente' }),
    ];
    const serie = gastoAcumuladoComparado(mezcla, AGOSTO, HOY_15_AGO);
    expect(serie.find(d => d.dia === 10)?.actual).toBe(100_000);
  });
});

describe('proyeccionCierreMes', () => {
  it('extrapola el ritmo diario a todo el mes', () => {
    // 310.000 en 15 dias = 20.666/dia * 31 dias.
    const p = proyeccionCierreMes([tx('2026-08-05', 310_000)], AGOSTO, HOY_15_AGO);

    expect(p.gastadoHasta).toBe(310_000);
    expect(p.diasTranscurridos).toBe(15);
    expect(p.diasDelMes).toBe(31);
    expect(p.ritmoDiario).toBeCloseTo(20_666.67, 1);
    expect(p.proyectado).toBeCloseTo(640_666.67, 1);
  });

  it('compara la proyeccion contra el mes anterior completo', () => {
    const datos = [tx('2026-07-10', 600_000), tx('2026-08-05', 310_000)];
    const p = proyeccionCierreMes(datos, AGOSTO, HOY_15_AGO);

    expect(p.totalMesAnterior).toBe(600_000);
    expect(p.diferenciaVsAnterior).toBeCloseTo(40_666.67, 1);
  });

  it('para un mes ya cerrado la proyeccion es el total real', () => {
    const p = proyeccionCierreMes([tx('2026-07-10', 600_000)], new Date(2026, 6, 1), HOY_15_AGO);

    expect(p.esMesEnCurso).toBe(false);
    expect(p.diasTranscurridos).toBe(31);
    expect(p.proyectado).toBeCloseTo(600_000);
  });

  it('no divide por cero sin datos', () => {
    const p = proyeccionCierreMes([], AGOSTO, HOY_15_AGO);
    expect(p.proyectado).toBe(0);
    expect(Number.isFinite(p.ritmoDiario)).toBe(true);
  });
});

describe('tendenciaPorCategoria', () => {
  const datos = [
    tx('2026-06-05', 200_000, { categoria: 'Mercado' }),
    tx('2026-07-05', 250_000, { categoria: 'Mercado' }),
    tx('2026-08-05', 400_000, { categoria: 'Mercado' }),
    tx('2026-08-06', 90_000, { categoria: 'Salidas' }),
  ];

  it('devuelve un valor por mes, del mas antiguo al mas reciente', () => {
    const { meses, categorias } = tendenciaPorCategoria(datos, 3, AGOSTO);

    expect(meses).toEqual(['2026-06', '2026-07', '2026-08']);
    const mercado = categorias.find(c => c.categoria === 'Mercado')!;
    expect(mercado.valores).toEqual([200_000, 250_000, 400_000]);
  });

  it('ordena las categorias por gasto total', () => {
    const { categorias } = tendenciaPorCategoria(datos, 3, AGOSTO);
    expect(categorias[0].categoria).toBe('Mercado');
  });

  it('detecta que una categoria viene subiendo', () => {
    const { categorias } = tendenciaPorCategoria(datos, 3, AGOSTO);
    const mercado = categorias.find(c => c.categoria === 'Mercado')!;

    // Ultimo mes 400.000 contra promedio previo de 225.000 = +77,8%
    expect(mercado.variacion).toBeCloseTo(77.8, 1);
  });

  it('no reporta variacion cuando no hay meses previos con datos', () => {
    const { categorias } = tendenciaPorCategoria(datos, 3, AGOSTO);
    const salidas = categorias.find(c => c.categoria === 'Salidas')!;
    expect(salidas.variacion).toBe(0);
  });

  it('ignora lo que cae fuera de la ventana de meses', () => {
    const { categorias } = tendenciaPorCategoria(datos, 2, AGOSTO);
    const mercado = categorias.find(c => c.categoria === 'Mercado')!;
    expect(mercado.valores).toEqual([250_000, 400_000]);
  });
});

describe('estadoPresupuestos', () => {
  const presupuestos = [
    { categoria: 'Mercado', amount: 600_000 },
    { categoria: 'Salidas', amount: 200_000 },
  ];

  it('calcula lo gastado y lo que resta', () => {
    const estado = estadoPresupuestos(
      [tx('2026-08-03', 150_000, { categoria: 'Mercado' })],
      presupuestos,
      AGOSTO,
      HOY_15_AGO
    );
    const mercado = estado.find(e => e.categoria === 'Mercado')!;

    expect(mercado.gastado).toBe(150_000);
    expect(mercado.restante).toBe(450_000);
    expect(mercado.porcentaje).toBeCloseTo(25);
    expect(mercado.excedido).toBe(false);
  });

  it('marca excedido cuando ya se paso', () => {
    const estado = estadoPresupuestos(
      [tx('2026-08-03', 700_000, { categoria: 'Mercado' })],
      presupuestos,
      AGOSTO,
      HOY_15_AGO
    );
    const mercado = estado.find(e => e.categoria === 'Mercado')!;

    expect(mercado.excedido).toBe(true);
    expect(mercado.restante).toBe(0);
    expect(mercado.enRiesgo).toBe(false); // ya se excedio, no "en riesgo"
  });

  it('avisa "en riesgo" por el ritmo, antes de excederse', () => {
    // 400.000 el dia 15 de un mes de 31: proyecta 826.000 sobre un tope de
    // 600.000. Todavia no se excede, pero va camino a hacerlo.
    const estado = estadoPresupuestos(
      [tx('2026-08-03', 400_000, { categoria: 'Mercado' })],
      presupuestos,
      AGOSTO,
      HOY_15_AGO
    );
    const mercado = estado.find(e => e.categoria === 'Mercado')!;

    expect(mercado.excedido).toBe(false);
    expect(mercado.enRiesgo).toBe(true);
  });

  it('no marca en riesgo un ritmo que cierra dentro del tope', () => {
    const estado = estadoPresupuestos(
      [tx('2026-08-03', 100_000, { categoria: 'Mercado' })],
      presupuestos,
      AGOSTO,
      HOY_15_AGO
    );
    const mercado = estado.find(e => e.categoria === 'Mercado')!;

    expect(mercado.enRiesgo).toBe(false);
  });

  it('ordena mostrando primero lo mas comprometido', () => {
    const estado = estadoPresupuestos(
      [
        tx('2026-08-03', 60_000, { categoria: 'Mercado' }),
        tx('2026-08-04', 180_000, { categoria: 'Salidas' }),
      ],
      presupuestos,
      AGOSTO,
      HOY_15_AGO
    );

    expect(estado[0].categoria).toBe('Salidas');
  });

  it('una categoria sin gasto queda en cero, no undefined', () => {
    const estado = estadoPresupuestos([], presupuestos, AGOSTO, HOY_15_AGO);
    expect(estado.every(e => e.gastado === 0)).toBe(true);
    expect(estado.every(e => Number.isFinite(e.porcentaje))).toBe(true);
  });

  it('solo cuenta el mes de referencia', () => {
    const estado = estadoPresupuestos(
      [
        tx('2026-07-20', 500_000, { categoria: 'Mercado' }),
        tx('2026-08-03', 100_000, { categoria: 'Mercado' }),
      ],
      presupuestos,
      AGOSTO,
      HOY_15_AGO
    );
    expect(estado.find(e => e.categoria === 'Mercado')!.gastado).toBe(100_000);
  });
});

describe('analitica · transferencias', () => {
  const transferencia = (fecha: string, importe: number, over: Partial<Transaction> = {}) =>
    tx(fecha, importe, { transfer_group: 'grupo-1', categoria: 'Transferencia', ...over });

  it('una transferencia no cuenta como gasto en la proyeccion del mes', () => {
    const conTransferencia = proyeccionCierreMes(
      [tx('2026-08-05', 300_000), transferencia('2026-08-06', 2_000_000)],
      AGOSTO,
      HOY_15_AGO
    );

    expect(conTransferencia.gastadoHasta).toBe(300_000);
  });

  it('tampoco consume presupuesto', () => {
    const estado = estadoPresupuestos(
      [transferencia('2026-08-06', 900_000, { categoria: 'Mercado' })],
      [{ categoria: 'Mercado', amount: 600_000 }],
      AGOSTO,
      HOY_15_AGO
    );

    expect(estado[0].gastado).toBe(0);
    expect(estado[0].excedido).toBe(false);
  });
});

describe('disponibleDelMes', () => {
  it('en superavit reparte lo que sobra entre los dias que quedan', () => {
    const resultado = disponibleDelMes(
      [
        tx('2026-08-01', 3_000_000, { tipo: 'Ingreso' }),
        tx('2026-08-05', 1_000_000),
      ],
      [],
      3_000_000,
      AGOSTO,
      HOY_15_AGO
    );

    expect(resultado.flujoDelMes).toBe(2_000_000);
    expect(resultado.enDeficit).toBe(false);
    // Del 15 al 31 quedan 17 dias contando hoy.
    expect(resultado.diasRestantes).toBe(17);
    expect(resultado.porDia).toBeCloseTo(2_000_000 / 17);
  });

  it('descuenta los recurrentes que aun no han caido este mes', () => {
    const resultado = disponibleDelMes(
      [tx('2026-08-01', 3_000_000, { tipo: 'Ingreso' })],
      [recurrente({ importe: 500_000, dia_del_mes: 20 })],
      3_000_000,
      AGOSTO,
      HOY_15_AGO
    );

    expect(resultado.comprometido).toBe(500_000);
    expect(resultado.flujoDelMes).toBe(2_500_000);
  });

  it('NO descuenta dos veces un recurrente que ya se materializo', () => {
    // Si ya se genero, existe como transaccion real. Contarlo tambien como
    // compromiso lo cobraria dos veces y el disponible saldria bajo sin motivo.
    const yaGenerado = recurrente({
      importe: 500_000,
      dia_del_mes: 4,
      ultima_generacion: new Date(2026, 7, 1),
    });

    const resultado = disponibleDelMes(
      [tx('2026-08-01', 3_000_000, { tipo: 'Ingreso' }), tx('2026-08-04', 500_000)],
      [yaGenerado],
      2_500_000,
      AGOSTO,
      HOY_15_AGO
    );

    expect(resultado.comprometido).toBe(0);
    expect(resultado.gastosDelMes).toBe(500_000);
    expect(resultado.flujoDelMes).toBe(2_500_000);
  });

  it('un recurrente pausado no compromete nada', () => {
    const resultado = disponibleDelMes(
      [],
      [recurrente({ importe: 500_000, activo: false })],
      1_000_000,
      AGOSTO,
      HOY_15_AGO
    );

    expect(resultado.comprometido).toBe(0);
    expect(resultado.costoFijoMensual).toBe(0);
  });

  it('en deficit no ofrece presupuesto diario: esa plata sale del ahorro', () => {
    const resultado = disponibleDelMes(
      [
        tx('2026-08-01', 2_000_000, { tipo: 'Ingreso' }),
        tx('2026-08-05', 6_000_000),
      ],
      [],
      3_000_000,
      AGOSTO,
      HOY_15_AGO
    );

    expect(resultado.enDeficit).toBe(true);
    expect(resultado.flujoDelMes).toBe(-4_000_000);
    expect(resultado.margenDelMes).toBe(0);
    expect(resultado.porDia).toBe(0);
    // Pero el tope real sigue siendo lo que hay en las cuentas.
    expect(resultado.disponible).toBe(3_000_000);
  });

  it('el margen nunca supera lo que de verdad hay en las cuentas', () => {
    // Ingresos de 5M en el mes pero solo 200.000 en el banco: decirle que puede
    // gastar 5M seria mentira, la plata ya no esta.
    const resultado = disponibleDelMes(
      [tx('2026-08-01', 5_000_000, { tipo: 'Ingreso' })],
      [],
      200_000,
      AGOSTO,
      HOY_15_AGO
    );

    expect(resultado.flujoDelMes).toBe(5_000_000);
    expect(resultado.margenDelMes).toBe(200_000);
  });

  it('los pendientes vencidos de meses anteriores siguen comprometiendo plata', () => {
    // Un recibo de julio sin pagar no deja de existir en agosto.
    const resultado = disponibleDelMes(
      [tx('2026-07-28', 400_000, { estado_pago: 'Pendiente' })],
      [],
      1_000_000,
      AGOSTO,
      HOY_15_AGO
    );

    expect(resultado.comprometido).toBe(400_000);
    expect(resultado.disponible).toBe(600_000);
  });

  it('costoFijoMensual suma todos los recurrentes de gasto activos', () => {
    const resultado = disponibleDelMes(
      [],
      [
        recurrente({ importe: 1_830_000, dia_del_mes: 1, ultima_generacion: new Date(2026, 7, 1) }),
        recurrente({ importe: 100_690, dia_del_mes: 20 }),
        recurrente({ importe: 3_000_000, tipo: 'Ingreso', dia_del_mes: 30 }),
      ],
      500_000,
      AGOSTO,
      HOY_15_AGO
    );

    expect(resultado.costoFijoMensual).toBe(1_930_690);
    expect(resultado.porCobrar).toBe(3_000_000);
  });

  it('una transferencia no cuenta como gasto del mes', () => {
    const resultado = disponibleDelMes(
      [
        tx('2026-08-01', 3_000_000, { tipo: 'Ingreso' }),
        tx('2026-08-06', 1_000_000, { transfer_group: 'g1' }),
        tx('2026-08-06', 1_000_000, { tipo: 'Ingreso', transfer_group: 'g1' }),
      ],
      [],
      3_000_000,
      AGOSTO,
      HOY_15_AGO
    );

    expect(resultado.gastosDelMes).toBe(0);
    expect(resultado.ingresosDelMes).toBe(3_000_000);
  });
});
