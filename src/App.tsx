import React, { useEffect, useMemo, useState } from 'react';
import { differenceInDays, endOfDay, startOfDay } from 'date-fns';
import { Activity, DollarSign, LogOut, Plus, Target, TrendingDown, TrendingUp, User } from 'lucide-react';
import DashboardCharts from './components/DashboardCharts';
import FiltersBar from './components/FiltersBar';
import KpiCard from './components/KpiCard';
import SettingsPanel from './components/SettingsPanel';
import TopNav from './components/TopNav';
import TransactionModal from './components/TransactionModal';
import TransactionsTable from './components/TransactionsTable';
import Auth from './components/Auth';
import { supabase } from './lib/supabase';
import {
  createCategory,
  createTransaction,
  deleteCategory,
  deleteTransaction,
  fetchCategories,
  fetchTransactions,
  updateTransaction,
  fetchSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
} from './services/api';
import type { AppView, Category, DashboardFilters, KpiData, SavingsGoal, Transaction } from './types';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [data, setData] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [modalState, setModalState] = useState<null | 'create' | Transaction>(null);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);

  const [filters, setFilters] = useState<DashboardFilters>({
    dateFrom: null,
    dateTo: null,
    tipo: 'Todos',
    categorias: [],
    canales: [],
    estadoPago: 'Todos',
    activeSearch: '',
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  const handleAddGoal = async (name: string, amount: number) => {
    const goal = await createSavingsGoal({ name, amount });
    setSavingsGoals(prev => [goal, ...prev]);
  };

  const handleUpdateGoal = async (id: string, name: string, amount: number) => {
    const updated = await updateSavingsGoal(id, { name, amount });
    setSavingsGoals(prev => prev.map(g => g.id === id ? updated : g));
  };

  const handleDeleteGoal = async (id: string) => {
    await deleteSavingsGoal(id);
    setSavingsGoals(prev => prev.filter(g => g.id !== id));
  };

  const loadAppData = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [transactions, categoryList, goalsList] = await Promise.all([
        fetchTransactions(), 
        fetchCategories(),
        fetchSavingsGoals()
      ]);
      setData(transactions);
      setCategories(categoryList);
      setSavingsGoals(goalsList);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar la informacion';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }

    loadAppData();
  }, [session]);

  const loadCategoriesOnly = async () => {
    const categoryList = await fetchCategories();
    setCategories(categoryList);

    setFilters(prev => ({
      ...prev,
      categorias: prev.categorias.filter(category => categoryList.some(item => item.name === category)),
    }));
  };

  const handleSaveTransaction = async (payload: Omit<Transaction, 'id' | 'user_id'>) => {
    if (modalState && modalState !== 'create') {
      await updateTransaction(modalState.id, payload);
    } else {
      await createTransaction(payload);
    }

    await loadAppData();
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      await deleteTransaction(id);
      setData(prev => prev.filter(transaction => transaction.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar la transaccion';
      setError(message);
    }
  };

  const handleAddCategory = async (name: string) => {
    await createCategory(name);
    await loadCategoriesOnly();
  };

  const handleDeleteCategory = async (name: string) => {
    await deleteCategory(name);
    await loadCategoriesOnly();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setActiveView('dashboard');
    setModalState(null);
  };

  const categoryNames = useMemo(() => categories.map(category => category.name), [categories]);

  const availableCategorias = useMemo(
    () => Array.from(new Set([...categoryNames, ...data.map(item => item.categoria)])).sort((a, b) => a.localeCompare(b)),
    [categoryNames, data]
  );

  const availableCanales = useMemo(
    () => Array.from(new Set(data.map(item => item.canal))).sort((a, b) => a.localeCompare(b)),
    [data]
  );

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchTipo = filters.tipo === 'Todos' || item.tipo === filters.tipo;
      const matchEstado = filters.estadoPago === 'Todos' || item.estado_pago === filters.estadoPago;
      const matchCategoria = filters.categorias.length === 0 || filters.categorias.includes(item.categoria);
      const matchCanal = filters.canales.length === 0 || filters.canales.includes(item.canal);
      const matchDate = (!filters.dateFrom || item.fecha >= startOfDay(filters.dateFrom))
        && (!filters.dateTo || item.fecha <= endOfDay(filters.dateTo));
      const searchLower = filters.activeSearch.toLowerCase();
      const matchSearch = !filters.activeSearch
        || item.descripcion.toLowerCase().includes(searchLower)
        || String(item.id).includes(searchLower);

      return matchTipo && matchEstado && matchCategoria && matchCanal && matchDate && matchSearch;
    });
  }, [data, filters]);

  const kpis: KpiData = useMemo(() => {
    const totalIngresos = filteredData.filter(item => item.tipo === 'Ingreso').reduce((acc, current) => acc + current.importe, 0);
    const totalGastos = filteredData.filter(item => item.tipo === 'Gasto').reduce((acc, current) => acc + Math.abs(current.importe), 0);
    const beneficioNeto = totalIngresos - totalGastos;

    const categoryBeneficio: Record<string, number> = {};
    const categoryGastos: Record<string, number> = {};
    let mayorGastoIndividual = 0;

    filteredData.forEach(item => {
      if (item.tipo === 'Ingreso') {
        categoryBeneficio[item.categoria] = (categoryBeneficio[item.categoria] ?? 0) + item.importe;
      } else {
        const absVal = Math.abs(item.importe);
        categoryGastos[item.categoria] = (categoryGastos[item.categoria] ?? 0) + absVal;
        if (absVal > mayorGastoIndividual) mayorGastoIndividual = absVal;
      }
    });

    let bestCat = { nombre: 'N/A', beneficio: 0 };
    Object.entries(categoryBeneficio).forEach(([name, beneficio]) => {
      if (beneficio > bestCat.beneficio) {
        bestCat = { nombre: name, beneficio };
      }
    });

    let worstCat = { nombre: 'N/A', gasto: 0 };
    Object.entries(categoryGastos).forEach(([name, gasto]) => {
      if (gasto > worstCat.gasto) worstCat = { nombre: name, gasto };
    });

    const servicios = filteredData.filter(item => item.categoria === 'Servicios');
    const ticketMedioServicios = servicios.length > 0
      ? servicios.reduce((acc, current) => acc + current.importe, 0) / servicios.length
      : 0;

    const todosGastos = filteredData.filter(item => item.tipo === 'Gasto');
    const ticketMedioGasto = todosGastos.length > 0 ? totalGastos / todosGastos.length : 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let ingresosMesActual = 0;
    let gastosMesActual = 0;
    let ingresosMesAnterior = 0;
    let gastosMesAnterior = 0;

    data.forEach(item => {
      const d = item.fecha;
      const tMonth = d.getMonth();
      const tYear = d.getFullYear();
      if (tYear === currentYear && tMonth === currentMonth) {
        if (item.tipo === 'Ingreso') ingresosMesActual += item.importe;
        else gastosMesActual += Math.abs(item.importe);
      } else if ((tYear === currentYear && tMonth === currentMonth - 1) || (currentMonth === 0 && tYear === currentYear - 1 && tMonth === 11)) {
        if (item.tipo === 'Ingreso') ingresosMesAnterior += item.importe;
        else gastosMesAnterior += Math.abs(item.importe);
      }
    });

    const ahorroMesActual = ingresosMesActual - gastosMesActual;
    const ahorroMesAnterior = ingresosMesAnterior - gastosMesAnterior;
    
    let variacionAhorro = 0;
    if (ahorroMesAnterior !== 0) {
      variacionAhorro = ((ahorroMesActual - ahorroMesAnterior) / Math.abs(ahorroMesAnterior)) * 100;
    } else {
      variacionAhorro = ahorroMesActual > 0 ? 100 : (ahorroMesActual < 0 ? -100 : 0);
    }

    let gastoPromedioDiario = 0;
    if (todosGastos.length > 0) {
      const dates = todosGastos.map(i => i.fecha.getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      const days = differenceInDays(endOfDay(maxDate), startOfDay(minDate)) + 1;
      gastoPromedioDiario = totalGastos / (days > 0 ? days : 1);
    }

    const metaAhorroActiva = savingsGoals.length > 0 ? savingsGoals[0] : null;

    return {
      totalIngresos,
      totalGastos,
      beneficioNeto,
      categoriaMasRentable: bestCat,
      numOperaciones: filteredData.length,
      ticketMedioServicios,
      ticketMedioGasto,
      ahorroMesActual,
      variacionAhorro,
      categoriaMasGasto: worstCat,
      gastoPromedioDiario,
      metaAhorroActiva,
      mayorGastoIndividual,
    };
  }, [filteredData, data, savingsGoals]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);

  if (!session) return <Auth />;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando tus finanzas...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="app-header">
        <div>
          <h1 className="app-title">MyContabilidadApp</h1>
          <p className="app-subtitle">Control de ingresos, gastos y metricas en tiempo real</p>
        </div>

        <div className="app-header__actions">
          <div className="user-chip">
            <User size={18} color="var(--accent-color)" />
            <span>{session.user.email}</span>
            <button onClick={handleLogout} className="ghost-icon-button" title="Cerrar sesion">
              <LogOut size={18} />
            </button>
          </div>

          {(activeView === 'dashboard' || activeView === 'transactions') && (
            <button onClick={() => setModalState('create')} className="primary-action">
              <Plus size={18} />
              Anadir transaccion
            </button>
          )}
        </div>
      </header>

      <TopNav activeView={activeView} onChangeView={setActiveView} />

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={loadAppData} className="error-banner__action">Reintentar</button>
        </div>
      )}

      {activeView === 'dashboard' && (
        <>
          <FiltersBar
            filters={filters}
            setFilters={setFilters}
            availableCategorias={availableCategorias}
            availableCanales={availableCanales}
          />

          <div className="dashboard-kpi-grid">
            <KpiCard title="Ingresos totales" value={formatCurrency(kpis.totalIngresos)} icon={TrendingUp} color="var(--success)" subtitle="Suma de todos tus ingresos" />
            <KpiCard title="Gastos totales" value={formatCurrency(kpis.totalGastos)} icon={TrendingDown} color="var(--danger)" subtitle="Suma absoluta de tus gastos" />
            <KpiCard title="Beneficio neto" value={formatCurrency(kpis.beneficioNeto)} icon={DollarSign} color={kpis.beneficioNeto >= 0 ? 'var(--success)' : 'var(--danger)'} isPositive={kpis.beneficioNeto >= 0} subtitle={kpis.beneficioNeto >= 0 ? 'Rentabilidad positiva' : 'Deficit operativo'} />
            <KpiCard title="Transacciones" value={String(kpis.numOperaciones)} icon={Activity} color="var(--accent-secondary)" subtitle="Total de registros" />
            <KpiCard title="Variacion ahorro" value={`${kpis.variacionAhorro > 0 ? '+' : ''}${kpis.variacionAhorro.toFixed(1)}%`} icon={Target} color={kpis.variacionAhorro >= 0 ? 'var(--success)' : 'var(--danger)'} isPositive={kpis.variacionAhorro >= 0} subtitle="Frente al mes anterior" />
            <KpiCard title="Ticket medio gastos" value={formatCurrency(kpis.ticketMedioGasto)} icon={Activity} color="var(--info)" subtitle="Promedio gastado por pago" />
            <KpiCard title="Promedio diario" value={formatCurrency(kpis.gastoPromedioDiario)} icon={TrendingDown} color="var(--danger)" subtitle="Gasto medio por dia" />
            <KpiCard title="Mayor Cat. Gasto" value={kpis.categoriaMasGasto.nombre} icon={Target} color="var(--warning)" subtitle={formatCurrency(kpis.categoriaMasGasto.gasto)} />
            <KpiCard title="Mayor gasto single" value={formatCurrency(kpis.mayorGastoIndividual)} icon={Activity} color="var(--danger)" subtitle="En esta busqueda" />
            {kpis.metaAhorroActiva && (
              <KpiCard
                title={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span>Meta: {kpis.metaAhorroActiva.name}</span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Valor meta: {formatCurrency(kpis.metaAhorroActiva.amount)}</span>
                  </div>
                }
                value={formatCurrency(kpis.ahorroMesActual)}
                icon={DollarSign}
                color={kpis.ahorroMesActual >= kpis.metaAhorroActiva.amount ? 'var(--success)' : 'var(--info)'}
                isPositive={kpis.ahorroMesActual >= kpis.metaAhorroActiva.amount}
                subtitle={kpis.ahorroMesActual >= kpis.metaAhorroActiva.amount
                  ? `Completada`
                  : `Faltan ${formatCurrency(kpis.metaAhorroActiva.amount - kpis.ahorroMesActual)}`}
              />
            )}
          </div>

          <DashboardCharts data={filteredData} />
        </>
      )}

      {activeView === 'transactions' && (
        <>
          <FiltersBar
            filters={filters}
            setFilters={setFilters}
            availableCategorias={availableCategorias}
            availableCanales={availableCanales}
          />

          <div className="section-heading">
            <h3>Historial de transacciones</h3>
            <div className="badge badge-pending">{filteredData.length} registros</div>
          </div>

          <TransactionsTable
            transactions={filteredData}
            onEdit={transaction => setModalState(transaction)}
            onDelete={handleDeleteTransaction}
          />
        </>
      )}

        {activeView === 'settings' && (
          <SettingsPanel
            categories={categories}
            loading={loading}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            savingsGoals={savingsGoals}
            onAddGoal={handleAddGoal}
            onUpdateGoal={handleUpdateGoal}
            onDeleteGoal={handleDeleteGoal}
          />
        )}

      {modalState !== null && (
        <TransactionModal
          categories={categoryNames}
          onClose={() => setModalState(null)}
          onSave={handleSaveTransaction}
          editingTransaction={modalState !== 'create' ? modalState : undefined}
        />
      )}

      <footer className="app-footer">&copy; {new Date().getFullYear()} © Jorge Gaitán | 2026 - MyContabilidadApp - Sistema de gestion financiera personal</footer>
    </div>
  );
};

export default App;
