import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  Activity,
  AlertCircle,
  DollarSign,
  LogOut,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
  User,
} from 'lucide-react';

import FiltersBar from './components/FiltersBar';
import KpiCard from './components/KpiCard';
import PeriodSelector from './components/PeriodSelector';
import SettingsPanel from './components/SettingsPanel';
import TopNav from './components/TopNav';
import TransactionModal from './components/TransactionModal';
import TransactionsTable from './components/TransactionsTable';
import GoalsPanel from './components/GoalsPanel';

// recharts pesa mas que todo el resto de la app junta. Cargarlo aparte deja que
// las vistas de transacciones y configuracion no lo descarguen nunca.
const DashboardCharts = lazy(() => import('./components/DashboardCharts'));
import Auth from './components/Auth';
import ResetPassword from './components/ResetPassword';
import { errorMessage, useToast } from './lib/toast';

import { supabase } from './lib/supabase';
import { applyFilters, computeKpis, previousPeriod, resolvePeriod } from './lib/kpis';
import { EMPTY_FILTERS } from './lib/filters';
import { formatCurrency, formatPercent } from './lib/format';
import {
  createCategory,
  createSavingsGoal,
  createTransaction,
  createTransactionsBulk,
  deleteCategory,
  deleteSavingsGoal,
  deleteTransaction,
  fetchCategories,
  fetchSavingsGoals,
  fetchTransactions,
  updateSavingsGoal,
  updateTransaction,
} from './services/api';
import type { Category, DashboardFilters, SavingsGoal, Transaction } from './types';

const App: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [recoveringPassword, setRecoveringPassword] = useState(false);

  const [data, setData] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalState, setModalState] = useState<null | 'create' | Transaction>(null);
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);

  /* ─────────────────────────────── sesion ─────────────────────────────── */

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: current } }) => {
      setSession(current);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Al llegar desde el enlace de recuperacion, Supabase entrega una sesion
      // temporal. Hay que pedir la contrasena nueva antes de mostrar la app.
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
      if (event === 'SIGNED_OUT') {
        setData([]);
        setCategories([]);
        setSavingsGoals([]);
      }
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  /* ──────────────────────────────── datos ─────────────────────────────── */

  const loadAppData = useCallback(async () => {
    setLoading(true);
    try {
      const [transactions, categoryList, goalsList] = await Promise.all([
        fetchTransactions(),
        fetchCategories(),
        fetchSavingsGoals(),
      ]);
      setData(transactions);
      setCategories(categoryList);
      setSavingsGoals(goalsList);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar la información'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Se depende del id y no del objeto `session`: Supabase emite una sesion
  // nueva en cada refresco de token (cada hora), y eso recargaria toda la app.
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!authReady) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    loadAppData();
  }, [authReady, userId, loadAppData]);

  /* ─────────────────────────── periodo y filtros ──────────────────────── */

  const rango = useMemo(
    () => resolvePeriod(filters.period, { dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
    [filters.period, filters.dateFrom, filters.dateTo]
  );

  const filteredData = useMemo(() => applyFilters(data, filters, rango), [data, filters, rango]);

  /**
   * Transacciones del periodo inmediatamente anterior, con los mismos filtros,
   * para poder calcular la variacion. Antes la variacion se sacaba del dataset
   * completo mientras el resto de KPIs usaba los datos filtrados, asi que al
   * filtrar esa tarjeta no se movia.
   */
  const previousData = useMemo(() => {
    const anterior = previousPeriod(rango.desde, rango.hasta);
    if (!anterior) return [];
    return applyFilters(data, filters, anterior);
  }, [data, filters, rango]);

  const kpis = useMemo(
    () => computeKpis(filteredData, previousData, savingsGoals, rango),
    [filteredData, previousData, savingsGoals, rango]
  );

  const categoryNames = useMemo(() => categories.map(category => category.name), [categories]);

  const availableCategorias = useMemo(
    () =>
      Array.from(new Set([...categoryNames, ...data.map(item => item.categoria)])).sort((a, b) =>
        a.localeCompare(b)
      ),
    [categoryNames, data]
  );

  const availableCanales = useMemo(
    () => Array.from(new Set(data.map(item => item.canal))).sort((a, b) => a.localeCompare(b)),
    [data]
  );

  /* ────────────────────────────── acciones ────────────────────────────── */

  const handleSaveTransaction = async (payload: Omit<Transaction, 'id' | 'user_id'>) => {
    // Actualizacion puntual del array en vez de recargar las tres tablas
    // completas en cada guardado.
    if (modalState && modalState !== 'create') {
      const updated = await updateTransaction(modalState.id, payload);
      setData(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      toast.success('Transacción actualizada');
    } else {
      const created = await createTransaction(payload);
      setData(prev => [created, ...prev]);
      toast.success('Transacción guardada');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const snapshot = data;
    setData(prev => prev.filter(item => item.id !== id)); // optimista
    try {
      await deleteTransaction(id);
      toast.success('Transacción eliminada');
    } catch (err) {
      setData(snapshot); // revertir
      toast.error(errorMessage(err, 'No se pudo eliminar la transacción'));
    }
  };

  const handleImport = async (rows: Array<Omit<Transaction, 'id' | 'user_id'>>) => {
    const insertadas = await createTransactionsBulk(rows);
    await loadAppData();
    return insertadas;
  };

  const reloadCategories = async () => {
    const categoryList = await fetchCategories();
    setCategories(categoryList);
    setFilters(prev => ({
      ...prev,
      categorias: prev.categorias.filter(name => categoryList.some(item => item.name === name)),
    }));
  };

  const handleAddCategory = async (name: string) => {
    await createCategory(name);
    await reloadCategories();
  };

  const handleDeleteCategory = async (name: string, reassignTo?: string) => {
    await deleteCategory(name, reassignTo);
    await Promise.all([reloadCategories(), loadAppData()]);
  };

  const handleAddGoal = async (name: string, amount: number) => {
    const goal = await createSavingsGoal({ name, amount });
    setSavingsGoals(prev => [goal, ...prev]);
  };

  const handleUpdateGoal = async (id: string, name: string, amount: number) => {
    const updated = await updateSavingsGoal(id, { name, amount });
    setSavingsGoals(prev => prev.map(goal => (goal.id === id ? updated : goal)));
  };

  const handleDeleteGoal = async (id: string) => {
    await deleteSavingsGoal(id);
    setSavingsGoals(prev => prev.filter(goal => goal.id !== id));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setModalState(null);
    navigate('/');
  };

  /* ────────────────────────────── render ──────────────────────────────── */

  if (!authReady) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Verificando tu sesión...</p>
      </div>
    );
  }

  if (recoveringPassword) {
    return (
      <ResetPassword
        onDone={() => {
          setRecoveringPassword(false);
          toast.success('Contraseña actualizada');
        }}
      />
    );
  }

  if (!session) return <Auth />;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Cargando tus finanzas...</p>
      </div>
    );
  }

  const filtersBar = (
    <FiltersBar
      filters={filters}
      setFilters={setFilters}
      availableCategorias={availableCategorias}
      availableCanales={availableCanales}
      resultCount={filteredData.length}
    />
  );

  const dashboard = (
    <>
      <PeriodSelector
        value={filters.period}
        onChange={period => setFilters(prev => ({ ...prev, period }))}
        rango={rango}
      />

      {filtersBar}

      <div className="dashboard-kpi-grid">
        <KpiCard
          title="Ingresos"
          value={formatCurrency(kpis.totalIngresos)}
          icon={TrendingUp}
          color="var(--success)"
          subtitle={
            kpis.ingresosPendientes > 0
              ? `+ ${formatCurrency(kpis.ingresosPendientes)} pendientes`
              : 'Solo movimientos pagados'
          }
        />
        <KpiCard
          title="Gastos"
          value={formatCurrency(kpis.totalGastos)}
          icon={TrendingDown}
          color="var(--danger)"
          subtitle={
            kpis.gastosPendientes > 0
              ? `+ ${formatCurrency(kpis.gastosPendientes)} pendientes`
              : 'Solo movimientos pagados'
          }
        />
        <KpiCard
          title="Balance del periodo"
          value={formatCurrency(kpis.beneficioNeto)}
          icon={DollarSign}
          color={kpis.beneficioNeto >= 0 ? 'var(--success)' : 'var(--danger)'}
          isPositive={kpis.beneficioNeto >= 0}
          subtitle={kpis.beneficioNeto >= 0 ? 'Estás ahorrando' : 'Estás gastando de más'}
        />
        <KpiCard
          title="Variación vs periodo anterior"
          value={kpis.tieneComparativo ? formatPercent(kpis.variacionAhorro) : '—'}
          icon={Target}
          color={kpis.variacionAhorro >= 0 ? 'var(--success)' : 'var(--danger)'}
          isPositive={kpis.tieneComparativo ? kpis.variacionAhorro >= 0 : undefined}
          subtitle={
            kpis.tieneComparativo
              ? `Antes: ${formatCurrency(kpis.ahorroPeriodoAnterior)}`
              : 'Sin datos previos para comparar'
          }
        />
        <KpiCard
          title="Transacciones"
          value={String(kpis.numOperaciones)}
          icon={Activity}
          color="var(--accent-secondary)"
          subtitle="Registros en el periodo"
        />
        <KpiCard
          title="Ticket medio de gasto"
          value={formatCurrency(kpis.ticketMedioGasto)}
          icon={Activity}
          color="var(--info)"
          subtitle="Promedio por pago"
        />
        <KpiCard
          title="Promedio diario"
          value={formatCurrency(kpis.gastoPromedioDiario)}
          icon={TrendingDown}
          color="var(--danger)"
          subtitle="Gasto medio por día"
        />
        <KpiCard
          title="Mayor categoría de gasto"
          value={kpis.categoriaMasGasto.nombre}
          icon={Target}
          color="var(--warning)"
          subtitle={formatCurrency(kpis.categoriaMasGasto.monto)}
        />
        <KpiCard
          title="Mayor gasto individual"
          value={formatCurrency(kpis.mayorGastoIndividual)}
          icon={Activity}
          color="var(--danger)"
          subtitle="En este periodo"
        />
      </div>

      <GoalsPanel metas={kpis.metas} />

      <Suspense
        fallback={
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Cargando gráficas...
          </div>
        }
      >
        <DashboardCharts data={filteredData} rango={rango} />
      </Suspense>
    </>
  );

  return (
    <div className="dashboard-container">
      <header className="app-header">
        <div>
          <h1 className="app-title">MyContabilidadApp</h1>
          <p className="app-subtitle">Control de ingresos, gastos y métricas en tiempo real</p>
        </div>

        <div className="app-header__actions">
          <div className="user-chip">
            <User size={18} color="var(--accent-color)" />
            <span>{session.user.email}</span>
            <button onClick={handleLogout} className="ghost-icon-button" title="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>

          <button onClick={() => setModalState('create')} className="primary-action">
            <Plus size={18} />
            Añadir transacción
          </button>
        </div>
      </header>

      <TopNav />

      {error && (
        <div className="error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={loadAppData} className="error-banner__action">
            Reintentar
          </button>
        </div>
      )}

      <Routes>
        <Route path="/" element={dashboard} />
        <Route
          path="/transacciones"
          element={
            <>
              <PeriodSelector
                value={filters.period}
                onChange={period => setFilters(prev => ({ ...prev, period }))}
                rango={rango}
              />
              {filtersBar}
              <TransactionsTable
                transactions={filteredData}
                onEdit={transaction => setModalState(transaction)}
                onDelete={handleDeleteTransaction}
              />
            </>
          }
        />
        <Route
          path="/configuracion"
          element={
            <SettingsPanel
              categories={categories}
              loading={loading}
              transactions={data}
              onAddCategory={handleAddCategory}
              onDeleteCategory={handleDeleteCategory}
              savingsGoals={savingsGoals}
              onAddGoal={handleAddGoal}
              onUpdateGoal={handleUpdateGoal}
              onDeleteGoal={handleDeleteGoal}
              onImport={handleImport}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {modalState !== null && (
        <TransactionModal
          categories={categoryNames}
          onClose={() => setModalState(null)}
          onSave={handleSaveTransaction}
          editingTransaction={modalState !== 'create' ? modalState : undefined}
        />
      )}

      <footer className="app-footer">
        © {new Date().getFullYear()} Jorge Gaitán — MyContabilidadApp
      </footer>
    </div>
  );
};

export default App;
