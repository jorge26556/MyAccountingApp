import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import type { Transaction } from '../types';
import { sinTransferencias } from '../lib/accounts';
import { formatCurrency, formatCurrencyCompact } from '../lib/format';
import { toDateString } from '../lib/dates';
import { gastoAcumuladoComparado, tendenciaPorCategoria } from '../lib/analytics';
import { useIsMobile } from '../lib/useMediaQuery';

interface DashboardChartsProps {
  /** Filtradas por el periodo seleccionado. */
  data: Transaction[];
  /** Todas: los comparativos mes a mes necesitan datos fuera del periodo. */
  allData: Transaction[];
}

const COLORS = ['#58a6ff', '#f97316', '#3fb950', '#bc8cff', '#d29922', '#388bfd'];

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  borderColor: 'var(--border-color)',
  borderRadius: '8px',
};

/**
 * Cuatro graficas, cada una contestando algo que ninguna otra contesta.
 *
 * Antes eran siete y tres decian lo mismo dos veces:
 *
 *  - "Flujo de caja en el tiempo" dibujaba ingresos y gastos dia a dia, que es
 *    "Resumen mensual" con mas ruido y menos legible.
 *  - "Ahorro acumulado" trazaba el neto dentro del periodo. Ahora el saldo real
 *    esta arriba del dashboard, en grande, y esa curva solo repetia el mismo
 *    dato peor.
 *  - El mapa de calor dia a dia era bonito y no cambiaba ninguna decision:
 *    "gaste mucho el jueves" no se acciona. Ademas solo cabia en escritorio.
 *
 * Una grafica que no cambia una decision es ruido que hay que hacer scroll para
 * pasar.
 */
const DashboardCharts: React.FC<DashboardChartsProps> = ({ data, allData }) => {
  const isMobile = useIsMobile();

  // Mover plata entre cuentas propias no es gasto: si entrara aqui, una
  // transferencia de $1.000.000 apareceria como la categoria en la que mas
  // gastas.
  const reales = useMemo(() => sinTransferencias(data), [data]);
  const todasReales = useMemo(() => sinTransferencias(allData), [allData]);

  const charts = useMemo(() => {
    const monthlyMap = new Map<
      string,
      { month: string; sortKey: string; ingresos: number; gastos: number }
    >();
    const expenseCategoryMap = new Map<string, number>();

    const ordenados = [...reales].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    ordenados.forEach(item => {
      const monthKey = toDateString(item.fecha).slice(0, 7);
      const monto = Math.abs(item.importe);
      const esIngreso = item.tipo === 'Ingreso';

      const displayMonth = format(item.fecha, 'MMM yyyy', { locale: es });
      const mes = monthlyMap.get(monthKey) ?? {
        month: displayMonth.charAt(0).toUpperCase() + displayMonth.slice(1),
        sortKey: monthKey,
        ingresos: 0,
        gastos: 0,
      };
      if (esIngreso) mes.ingresos += monto;
      else mes.gastos += monto;
      monthlyMap.set(monthKey, mes);

      if (!esIngreso) {
        expenseCategoryMap.set(item.categoria, (expenseCategoryMap.get(item.categoria) ?? 0) + monto);
      }
    });

    return {
      monthlyData: Array.from(monthlyMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
      expenseCategoryData: Array.from(expenseCategoryMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
    };
  }, [reales]);

  // Los comparativos mes a mes usan el dataset completo: recortarlo al periodo
  // dejaria el mes anterior siempre en cero.
  const acumuladoComparado = useMemo(() => gastoAcumuladoComparado(todasReales), [todasReales]);
  const tendencia = useMemo(() => tendenciaPorCategoria(todasReales, 6), [todasReales]);

  const tendenciaData = useMemo(
    () =>
      tendencia.meses.map((mes, index) => {
        const fila: Record<string, string | number> = {
          mes: format(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1), 'MMM', {
            locale: es,
          }),
        };
        tendencia.categorias.slice(0, 4).forEach(cat => {
          fila[cat.categoria] = cat.valores[index];
        });
        return fila;
      }),
    [tendencia]
  );

  if (reales.length === 0) {
    return (
      <div className="card empty-state">
        Aún no hay datos en este periodo para mostrar analítica visual.
      </div>
    );
  }

  const ejeY = {
    stroke: 'var(--text-secondary)',
    tickLine: false,
    axisLine: false,
    tickFormatter: (value: number | string) => formatCurrencyCompact(Number(value)),
    width: isMobile ? 52 : 80,
  };

  return (
    <div className="charts-grid">
      {/* ── La grafica que responde "¿voy mas rapido que el mes pasado?" ── */}
      <div className="card">
        <h4 className="chart-title">Gasto acumulado: este mes vs. el pasado</h4>
        <p className="chart-caption">
          Si la línea de este mes va por encima, estás gastando más rápido de lo que ibas.
        </p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={acumuladoComparado}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis
                dataKey="dia"
                stroke="var(--text-secondary)"
                tickLine={false}
                axisLine={false}
                minTickGap={20}
              />
              <YAxis {...ejeY} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={value => formatCurrency(Number(value))}
                labelFormatter={dia => `Día ${dia}`}
              />
              <Legend wrapperStyle={{ paddingTop: '16px' }} />
              <Line
                type="monotone"
                dataKey="anterior"
                name="Mes pasado"
                stroke="var(--text-muted)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Este mes"
                stroke="#f97316"
                strokeWidth={3}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 className="chart-title">Tendencia por categoría</h4>
        <p className="chart-caption">
          Últimos 6 meses. Sirve para ver qué categoría viene subiendo, no solo cuánto llevas.
        </p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tendenciaData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="mes" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis {...ejeY} />
              <Tooltip contentStyle={tooltipStyle} formatter={value => formatCurrency(Number(value))} />
              <Legend wrapperStyle={{ paddingTop: '16px' }} />
              {tendencia.categorias.slice(0, 4).map((cat, index) => (
                <Line
                  key={cat.categoria}
                  type="monotone"
                  dataKey={cat.categoria}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 className="chart-title">Resumen mensual</h4>
        <p className="chart-caption">Ingresos y gastos totales agrupados por mes.</p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis {...ejeY} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={value => formatCurrency(Number(value))}
                cursor={{ fill: 'var(--bg-secondary)', opacity: 0.4 }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="ingresos" name="Ingresos" fill="#3fb950" radius={[4, 4, 0, 0]} maxBarSize={50} />
              <Bar dataKey="gastos" name="Gastos" fill="#f85149" radius={[4, 4, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 className="chart-title">Top categorías de gasto</h4>
        <p className="chart-caption">En qué categorías se está yendo más dinero.</p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.expenseCategoryData} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" tickLine={false} axisLine={false} width={90} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={value => formatCurrency(Number(value))}
                cursor={{ fill: 'var(--bg-secondary)', opacity: 0.4 }}
              />
              <Bar dataKey="value" name="Gasto" fill="#f97316" radius={[0, 8, 8, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};

export default DashboardCharts;
