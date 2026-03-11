import React, { useEffect, useMemo, useState } from 'react';
import { endOfDay, startOfDay } from 'date-fns';
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
} from './services/api';
import type { AppView, Category, DashboardFilters, KpiData, Transaction } from './types';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [data, setData] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [modalState, setModalState] = useState<null | 'create' | Transaction>(null);

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

  const loadAppData = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [transactions, categoryList] = await Promise.all([fetchTransactions(), fetchCategories()]);
      setData(transactions);
      setCategories(categoryList);
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
    filteredData.forEach(item => {
      categoryBeneficio[item.categoria] = (categoryBeneficio[item.categoria] ?? 0) + item.importe;
    });

    let bestCat = { nombre: 'N/A', beneficio: 0 };
    Object.entries(categoryBeneficio).forEach(([name, beneficio]) => {
      if (beneficio > bestCat.beneficio) {
        bestCat = { nombre: name, beneficio };
      }
    });

    const servicios = filteredData.filter(item => item.categoria === 'Servicios');
    const ticketMedio = servicios.length > 0
      ? servicios.reduce((acc, current) => acc + current.importe, 0) / servicios.length
      : 0;

    return {
      totalIngresos,
      totalGastos,
      beneficioNeto,
      categoriaMasRentable: bestCat,
      numOperaciones: filteredData.length,
      ticketMedioServicios: ticketMedio,
    };
  }, [filteredData]);

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

          {activeView === 'dashboard' && (
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

      {activeView === 'dashboard' ? (
        <>
          <FiltersBar
            filters={filters}
            setFilters={setFilters}
            availableCategorias={availableCategorias}
            availableCanales={availableCanales}
          />

          <div className="kpi-grid">
            <KpiCard title="Ingresos totales" value={formatCurrency(kpis.totalIngresos)} icon={TrendingUp} color="var(--success)" subtitle="Suma de todos tus ingresos" />
            <KpiCard title="Gastos totales" value={formatCurrency(kpis.totalGastos)} icon={TrendingDown} color="var(--danger)" subtitle="Suma absoluta de tus gastos" />
            <KpiCard title="Beneficio neto" value={formatCurrency(kpis.beneficioNeto)} icon={DollarSign} color={kpis.beneficioNeto >= 0 ? 'var(--success)' : 'var(--danger)'} isPositive={kpis.beneficioNeto >= 0} subtitle={kpis.beneficioNeto >= 0 ? 'Rentabilidad positiva' : 'Deficit operativo'} />
            <KpiCard title="Cat. mas rentable" value={kpis.categoriaMasRentable.nombre} icon={Target} color="var(--accent-secondary)" subtitle={formatCurrency(kpis.categoriaMasRentable.beneficio)} />
            <KpiCard title="Ticket medio" value={formatCurrency(kpis.ticketMedioServicios)} icon={Activity} color="var(--info)" subtitle="Promedio categoria Servicios" />
          </div>

          <DashboardCharts data={filteredData} />

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
      ) : (
        <SettingsPanel
          categories={categories}
          loading={loading}
          onAddCategory={handleAddCategory}
          onDeleteCategory={handleDeleteCategory}
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

      <footer className="app-footer">&copy; {new Date().getFullYear()} MyContabilidadApp - Sistema de gestion financiera personal</footer>
    </div>
  );
};

export default App;
