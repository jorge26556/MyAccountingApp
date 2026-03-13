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
import { eachDayOfInterval, format, startOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

import type { Transaction } from '../types';

interface DashboardChartsProps {
  data: Transaction[];
}

const COLORS = ['#58a6ff', '#f97316', '#3fb950', '#bc8cff', '#d29922', '#388bfd'];

const DashboardCharts: React.FC<DashboardChartsProps> = ({ data }) => {
  const formatCurrency = (value: number) => new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);

  const timelineMap = new Map<string, { fecha: string; ingresos: number; gastos: number; neto: number }>();
  data
    .slice()
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .forEach(item => {
      const key = format(item.fecha, 'yyyy-MM-dd');
      const current = timelineMap.get(key) ?? {
        fecha: format(item.fecha, 'dd MMM', { locale: es }),
        ingresos: 0,
        gastos: 0,
        neto: 0,
      };

      if (item.tipo === 'Ingreso') {
        current.ingresos += item.importe;
        current.neto += item.importe;
      } else {
        const gasto = Math.abs(item.importe);
        current.gastos += gasto;
        current.neto -= gasto;
      }

      timelineMap.set(key, current);
    });

  const timelineData = Array.from(timelineMap.values());

  let acumulado = 0;
  const cumulativeData = timelineData.map(item => {
    acumulado += item.neto;
    return { ...item, acumulado };
  });

  const today = startOfDay(new Date());
  const startDate = subDays(today, 89);
  const daysRange = eachDayOfInterval({ start: startDate, end: today });

  const monthlyMap = new Map<string, { month: string; sortKey: string; ingresos: number; gastos: number }>();
  
  const expenseCategoryMap = new Map<string, number>();
  const incomeCategoryMap = new Map<string, number>();
  const channelMap = new Map<string, { ingresos: number; gastos: number }>();

  data.forEach(item => {
    // Agrupacion mensual
    const monthKey = format(item.fecha, 'yyyy-MM');
    const displayMonth = format(item.fecha, 'MMM yyyy', { locale: es });
    
    const currentMonth = monthlyMap.get(monthKey) ?? {
      month: displayMonth.charAt(0).toUpperCase() + displayMonth.slice(1),
      sortKey: monthKey,
      ingresos: 0,
      gastos: 0
    };

    if (item.tipo === 'Ingreso') {
      currentMonth.ingresos += item.importe;
    } else {
      currentMonth.gastos += Math.abs(item.importe);
    }
    
    monthlyMap.set(monthKey, currentMonth);

    // Agrupacion por categorias y canales
    if (item.tipo === 'Gasto') {
      expenseCategoryMap.set(item.categoria, (expenseCategoryMap.get(item.categoria) ?? 0) + Math.abs(item.importe));
    } else {
      incomeCategoryMap.set(item.categoria, (incomeCategoryMap.get(item.categoria) ?? 0) + item.importe);
    }

    const currentChannel = channelMap.get(item.canal) ?? { ingresos: 0, gastos: 0 };
    if (item.tipo === 'Ingreso') {
      currentChannel.ingresos += item.importe;
    } else {
      currentChannel.gastos += Math.abs(item.importe);
    }
    channelMap.set(item.canal, currentChannel);
  });

  const monthlyData = Array.from(monthlyMap.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const expenseCategoryData = Array.from(expenseCategoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const incomeCategoryData = Array.from(incomeCategoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const channelData = Array.from(channelMap.entries())
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => (b.ingresos + b.gastos) - (a.ingresos + a.gastos));

  const dailyExpensesMap = new Map<string, number>();
  data.forEach(item => {
    if (item.tipo === 'Gasto') {
      const key = format(item.fecha, 'yyyy-MM-dd');
      dailyExpensesMap.set(key, (dailyExpensesMap.get(key) ?? 0) + Math.abs(item.importe));
    }
  });

  const maxExpense = Math.max(...Array.from(dailyExpensesMap.values()), 1);

  const heatmapData = daysRange.map(date => {
    const key = format(date, 'yyyy-MM-dd');
    const amount = dailyExpensesMap.get(key) ?? 0;
    let intensity = amount / maxExpense;
    // ensure even small expenses are visible
    if (amount > 0 && intensity < 0.2) intensity = 0.2; 
    return { date, key, amount, intensity };
  });

  if (data.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
        Aun no hay suficientes datos para mostrar analitica visual.
      </div>
    );
  }

  return (
    <div className="charts-grid">
      <div className="card">
        <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Flujo de caja en el tiempo</h4>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Compara lo que entro, lo que salio y el balance neto por fecha.
        </p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timelineData}>
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
              <XAxis dataKey="fecha" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} tickFormatter={value => formatCurrency(Number(value)).replace(',00', '')} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                formatter={value => formatCurrency(Number(value))}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#3fb950" fill="url(#incomeFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#f85149" fill="url(#expenseFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="neto" name="Balance neto" stroke="#58a6ff" fill="transparent" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Ahorro Acumulado</h4>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          La trayectoria de tu capital en el tiempo.
        </p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cumulativeData}>
              <defs>
                <linearGradient id="accFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3fb950" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="fecha" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} tickFormatter={value => formatCurrency(Number(value)).replace(',00', '')} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                formatter={value => formatCurrency(Number(value))}
              />
              <Area type="monotone" dataKey="acumulado" name="Capital Total" stroke="#3fb950" fill="url(#accFill)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Resumen Mensual</h4>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Tus ingresos y gastos totales agrupados por cada mes.
        </p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} tickFormatter={value => formatCurrency(Number(value)).replace(',00', '')} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
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
        <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Top categorias de gasto</h4>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Muestra en que categorias se esta yendo mas dinero.
        </p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={expenseCategoryData} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" tickLine={false} axisLine={false} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                formatter={value => formatCurrency(Number(value))}
                cursor={{ fill: 'var(--bg-secondary)', opacity: 0.4 }}
              />
              <Bar dataKey="value" name="Gasto" fill="#f97316" radius={[0, 8, 8, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Distribucion de gastos</h4>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Representacion porcentual de en que gastas mas dinero.
        </p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={expenseCategoryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={4}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                labelLine={false}
                fill="var(--text-primary)"
              >
                {expenseCategoryData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                formatter={value => formatCurrency(Number(value))}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Distribucion de ingresos</h4>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Ayuda a identificar de donde vienen mas ingresos.
        </p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={incomeCategoryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={4}
              >
                {incomeCategoryData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                formatter={value => formatCurrency(Number(value))}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Movimiento por canal</h4>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Compara por cada canal cuanto ingreso y cuanto gasto se movio.
        </p>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={channelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} tickFormatter={value => formatCurrency(Number(value)).replace(',00', '')} width={110} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                formatter={value => formatCurrency(Number(value))}
              />
              <Legend />
              <Bar dataKey="ingresos" name="Ingresos" fill="#3fb950" radius={[8, 8, 0, 0]} />
              <Bar dataKey="gastos" name="Gastos" fill="#f85149" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Heatmap (Actividad de gastos ultimos 90 dias)</h4>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Diferencia la intensidad de lo que has estado gastando dia tras dia.
        </p>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {heatmapData.map(day => {
            const opacity = day.amount > 0 ? 0.2 + (day.intensity * 0.8) : 0.05;
            return (
              <div 
                key={day.key} 
                title={`${format(day.date, 'dd MMM yyyy', { locale: es })}: ${formatCurrency(day.amount)}`}
                style={{ 
                  width: '16px', 
                  height: '16px', 
                  backgroundColor: day.amount > 0 ? `rgba(248, 81, 73, ${opacity})` : 'var(--bg-tertiary)',
                  borderRadius: '4px',
                  cursor: 'help',
                  transition: 'transform 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.3)'}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DashboardCharts;
