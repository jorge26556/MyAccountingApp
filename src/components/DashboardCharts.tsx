import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { eachDayOfInterval, format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

import type { Transaction } from '../types';
import { formatCurrency, formatCurrencyCompact } from '../lib/format';
import { toDateString, today } from '../lib/dates';

interface DashboardChartsProps {
  data: Transaction[];
  rango: { desde: Date | null; hasta: Date | null };
}

const COLORS = ['#58a6ff', '#f97316', '#3fb950', '#bc8cff', '#d29922', '#388bfd'];

/** El heatmap se limita a 366 celdas: mas alla deja de ser legible. */
const MAX_HEATMAP_DIAS = 366;

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  borderColor: 'var(--border-color)',
  borderRadius: '8px',
};

const DashboardCharts: React.FC<DashboardChartsProps> = ({ data, rango }) => {
  /**
   * Todo el derivado va dentro de un useMemo. Antes se recalculaba entero en
   * cada render del padre, incluyendo el recorrido completo de transacciones
   * cuatro veces y la construccion del heatmap.
   */
  const charts = useMemo(() => {
    const timelineMap = new Map<
      string,
      { fecha: string; ingresos: number; gastos: number; neto: number }
    >();
    const monthlyMap = new Map<
      string,
      { month: string; sortKey: string; ingresos: number; gastos: number }
    >();
    const expenseCategoryMap = new Map<string, number>();
    const incomeCategoryMap = new Map<string, number>();
    const channelMap = new Map<string, { ingresos: number; gastos: number }>();
    const dailyExpensesMap = new Map<string, number>();

    const ordenados = [...data].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    ordenados.forEach(item => {
      const dayKey = toDateString(item.fecha);
      const monthKey = dayKey.slice(0, 7);
      const monto = Math.abs(item.importe);
      const esIngreso = item.tipo === 'Ingreso';

      const dia = timelineMap.get(dayKey) ?? {
        fecha: format(item.fecha, 'dd MMM', { locale: es }),
        ingresos: 0,
        gastos: 0,
        neto: 0,
      };
      if (esIngreso) {
        dia.ingresos += monto;
        dia.neto += monto;
      } else {
        dia.gastos += monto;
        dia.neto -= monto;
      }
      timelineMap.set(dayKey, dia);

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

      if (esIngreso) {
        incomeCategoryMap.set(item.categoria, (incomeCategoryMap.get(item.categoria) ?? 0) + monto);
      } else {
        expenseCategoryMap.set(item.categoria, (expenseCategoryMap.get(item.categoria) ?? 0) + monto);
        dailyExpensesMap.set(dayKey, (dailyExpensesMap.get(dayKey) ?? 0) + monto);
      }

      const canal = channelMap.get(item.canal) ?? { ingresos: 0, gastos: 0 };
      if (esIngreso) canal.ingresos += monto;
      else canal.gastos += monto;
      channelMap.set(item.canal, canal);
    });

    const timelineData = Array.from(timelineMap.values());

    let acumulado = 0;
    const cumulativeData = timelineData.map(item => {
      acumulado += item.neto;
      return { ...item, acumulado };
    });

    // El heatmap sigue el periodo elegido en vez de estar clavado a 90 dias.
    const hoy = today();
    const heatmapHasta = rango.hasta && rango.hasta < hoy ? rango.hasta : hoy;
    let heatmapDesde = rango.desde ?? subDays(heatmapHasta, 89);
    const spanDias = Math.round((heatmapHasta.getTime() - heatmapDesde.getTime()) / 86_400_000);
    if (spanDias > MAX_HEATMAP_DIAS) {
      heatmapDesde = subDays(heatmapHasta, MAX_HEATMAP_DIAS - 1);
    }
    if (heatmapDesde > heatmapHasta) heatmapDesde = heatmapHasta;

    const maxExpense = Math.max(...Array.from(dailyExpensesMap.values()), 1);
    const heatmapData = eachDayOfInterval({ start: heatmapDesde, end: heatmapHasta }).map(date => {
      const key = toDateString(date);
      const amount = dailyExpensesMap.get(key) ?? 0;
      let intensity = amount / maxExpense;
      if (amount > 0 && intensity < 0.2) intensity = 0.2;
      return { date, key, amount, intensity };
    });

    return {
      timelineData,
      cumulativeData,
      monthlyData: Array.from(monthlyMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
      expenseCategoryData: Array.from(expenseCategoryMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
      incomeCategoryData: Array.from(incomeCategoryMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
      channelData: Array.from(channelMap.entries())
        .map(([name, values]) => ({ name, ...values }))
        .sort((a, b) => b.ingresos + b.gastos - (a.ingresos + a.gastos)),
      heatmapData,
    };
  }, [data, rango]);

  if (data.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2.5rem' }}>
        Aún no hay datos en este periodo para mostrar analítica visual.
      </div>
    );
  }

  const ejeY = {
    stroke: 'var(--text-secondary)',
    tickLine: false,
    axisLine: false,
    tickFormatter: (value: number | string) => formatCurrencyCompact(Number(value)),
    width: 80,
  };

  return (
    <div className="charts-grid">
      <div className="card">
        <h4 className="chart-title">Flujo de caja en el tiempo</h4>
        <p className="chart-caption">Compara lo que entró, lo que salió y el balance neto por fecha.</p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts.timelineData}>
              <defs>
                <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3fb950" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f85149" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#f85149" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="fecha" stroke="var(--text-secondary)" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis {...ejeY} />
              <Tooltip contentStyle={tooltipStyle} formatter={value => formatCurrency(Number(value))} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#3fb950" fill="url(#incomeFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#f85149" fill="url(#expenseFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="neto" name="Balance neto" stroke="#58a6ff" fill="transparent" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 className="chart-title">Ahorro acumulado</h4>
        <p className="chart-caption">La trayectoria de tu capital dentro del periodo.</p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts.cumulativeData}>
              <defs>
                <linearGradient id="accFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3fb950" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="fecha" stroke="var(--text-secondary)" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis {...ejeY} />
              <Tooltip contentStyle={tooltipStyle} formatter={value => formatCurrency(Number(value))} />
              <Area type="monotone" dataKey="acumulado" name="Capital acumulado" stroke="#3fb950" fill="url(#accFill)" strokeWidth={3} />
            </AreaChart>
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
              <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" tickLine={false} axisLine={false} width={100} />
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

      <div className="card">
        <h4 className="chart-title">Distribución de gastos</h4>
        <p className="chart-caption">Peso porcentual de cada categoría sobre el total gastado.</p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={charts.expenseCategoryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={4}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {charts.expenseCategoryData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={value => formatCurrency(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 className="chart-title">Distribución de ingresos</h4>
        <p className="chart-caption">De dónde viene tu dinero.</p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={charts.incomeCategoryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={4}
              >
                {charts.incomeCategoryData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={value => formatCurrency(Number(value))} />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 className="chart-title">Movimiento por canal</h4>
        <p className="chart-caption">Cuánto entró y salió por cada medio de pago.</p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.channelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis {...ejeY} />
              <Tooltip contentStyle={tooltipStyle} formatter={value => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="ingresos" name="Ingresos" fill="#3fb950" radius={[8, 8, 0, 0]} />
              <Bar dataKey="gastos" name="Gastos" fill="#f85149" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h4 className="chart-title">Actividad de gasto día a día</h4>
        <p className="chart-caption">
          Cada celda es un día del periodo: mientras más intensa, más gastaste ese día.
        </p>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {charts.heatmapData.map(day => (
            <div
              key={day.key}
              title={`${format(day.date, 'dd MMM yyyy', { locale: es })}: ${formatCurrency(day.amount)}`}
              className="heatmap-cell"
              style={{
                backgroundColor:
                  day.amount > 0
                    ? `rgba(248, 81, 73, ${0.2 + day.intensity * 0.8})`
                    : 'var(--bg-tertiary)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardCharts;
