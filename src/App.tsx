import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { AlertCircle, Plus, TrendingDown, TrendingUp } from 'lucide-react';

import FiltersBar from './components/FiltersBar';
import KpiCard from './components/KpiCard';
import PeriodSelector from './components/PeriodSelector';
import SettingsPanel from './components/SettingsPanel';
import TopNav from './components/TopNav';
import TransactionModal from './components/TransactionModal';
import type { CompraInput, TransferInput } from './components/TransactionModal';
import SyncBanner from './components/SyncBanner';
import TransactionsTable from './components/TransactionsTable';
import GoalsPanel from './components/GoalsPanel';
import MesEnCurso from './components/MesEnCurso';
import SaldoHero from './components/SaldoHero';
import AgendaPanel from './components/AgendaPanel';
import BudgetsPanel from './components/BudgetsPanel';
import AccountMenu from './components/AccountMenu';
import DeudasPanel from './components/DeudasPanel';
import DeudaModal from './components/DeudaModal';
import type { AbonoInput, NuevaDeudaInput } from './components/DeudaModal';
import RefreshButton from './components/RefreshButton';

// recharts pesa mas que todo el resto de la app junta. Cargarlo aparte deja que
// las vistas de transacciones y configuracion no lo descarguen nunca.
const DashboardCharts = lazy(() => import('./components/DashboardCharts'));
import Auth from './components/Auth';
import ResetPassword from './components/ResetPassword';
import { errorMessage, useToast } from './lib/toast';

import { supabase } from './lib/supabase';
import { applyFilters, computeKpis, previousPeriod, resolvePeriod } from './lib/kpis';
import { EMPTY_FILTERS } from './lib/filters';
import { disponibleDelMes, estadoPresupuestos, proyeccionCierreMes } from './lib/analytics';
import { construirAgenda } from './lib/agenda';
import {
  cuentasActivas,
  movimientosSinCuenta,
  saldoTotal,
  saldosPorCuenta,
  soloIngresosYGastos,
} from './lib/accounts';
import { formatCurrency, formatPercent } from './lib/format';
import { downloadCsv } from './lib/csv';
import { toDateString, today } from './lib/dates';
import {
  contarPendientesDeSincronizar,
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
  hayColumnasDeCuotas,
  sincronizarPendientes,
  updateSavingsGoal,
  updateTransaction,
} from './services/api';
import { createCompraACuotas, cuotasDisponibles, deleteCompra } from './services/cuotas';
import {
  createDebt,
  deleteDebt,
  fetchDebts,
  registrarMovimientoDeDeuda,
  updateDebt,
} from './services/deudas';
import { borrarRecibo, recibosDisponibles, subirRecibo } from './services/recibos';
import { resumenDeudas, type EstadoDeuda } from './lib/deudas';
import { actualizarBadge } from './lib/badge';
import { borrarSnapshots, estaEnLinea, guardarSnapshot, leerSnapshot } from './lib/offline';
import {
  createAccount,
  createTransfer,
  deleteAccount,
  deleteTransfer,
  fetchAccounts,
  updateAccount,
} from './services/accounts';
import {
  createRecurring,
  deleteBudget,
  deleteRecurring,
  fetchBudgets,
  fetchRecurring,
  generarRecurrentesPendientes,
  toggleRecurring,
  upsertBudget,
  type Budget,
  type RecurringTransaction,
} from './services/extras';
import type {
  Account,
  AccountType,
  Category,
  DashboardFilters,
  Debt,
  SavingsGoal,
  Transaction,
} from './types';

type ModalState =
  | null
  | { mode: 'create' }
  | { mode: 'edit'; tx: Transaction }
  | { mode: 'repeat'; tx: Transaction };

/** El modal de deudas: crear una nueva, o abonar a una existente. */
type DeudaModalState = null | { modo: 'nueva' } | { modo: 'abono'; estado: EstadoDeuda };

const App: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [recoveringPassword, setRecoveringPassword] = useState(false);

  const [data, setData] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetsDisponibles, setBudgetsDisponibles] = useState(false);
  const [recurrentes, setRecurrentes] = useState<RecurringTransaction[]>([]);
  const [recurrentesDisponibles, setRecurrentesDisponibles] = useState(false);
  const [cuentas, setCuentas] = useState<Account[]>([]);
  const [hayCuentas, setHayCuentas] = useState(false);
  const [hayCuotas, setHayCuotas] = useState(false);
  const [deudas, setDeudas] = useState<Debt[]>([]);
  const [hayDeudas, setHayDeudas] = useState(false);
  const [hayRecibos, setHayRecibos] = useState(false);
  const [deudaModal, setDeudaModal] = useState<DeudaModalState>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Refresco a peticion del usuario. Va aparte de `loading` porque ese levanta
   * la pantalla completa de "Cargando tus finanzas...": correcto al arrancar,
   * insufrible cada vez que tocas "Actualizar".
   */
  const [refrescando, setRefrescando] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  /* ── Estado de conexion y cola de pendientes ── */
  const [enLinea, setEnLinea] = useState(estaEnLinea);
  const [porSincronizar, setPorSincronizar] = useState(0);
  const [desdeCache, setDesdeCache] = useState(false);

  /**
   * Borrados en marcha, esperando la ventana de "Deshacer".
   *
   * Se guardan en un ref y no en estado: cambiarlos no debe re-renderizar nada,
   * y si el componente se re-renderiza entre medias el temporizador tiene que
   * seguir siendo el mismo.
   */
  const borradosEnEspera = useRef(new Map<string, number>());

  /**
   * `repeat` copia los datos de un movimiento existente pero crea uno nuevo.
   * Antes el estado era `null | 'create' | Transaction`, que no podia expresar
   * "es una copia, no una edicion".
   */
  const [modalState, setModalState] = useState<ModalState>(null);
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);

  /* ─────────────────────────────── sesion ─────────────────────────────── */

  useEffect(() => {
    /**
     * `getSession()` lee la sesion de localStorage sin preguntarle al servidor,
     * asi que un JWT sigue pareciendo valido hasta que expira aunque la cuenta
     * ya no exista. Sin esta comprobacion, borrar la cuenta desde otro
     * dispositivo dejaba la app "abierta" mostrando errores raros de llave
     * foranea en vez de volver al login.
     *
     * `getUser()` si va al servidor. Es una sola peticion al arrancar, no en
     * cada operacion.
     */
    supabase.auth.getSession().then(async ({ data: { session: current } }) => {
      if (!current) {
        setSession(null);
        setAuthReady(true);
        return;
      }

      const { error } = await supabase.auth.getUser();
      if (error) {
        await supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(current);
      }
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
        setBudgets([]);
        setRecurrentes([]);
        setCuentas([]);
        setDeudas([]);
        // El snapshot sobrevive al cierre de la app a proposito, pero no al
        // cierre de sesion: son saldos y movimientos en el disco del
        // dispositivo. La cola SI se conserva —son movimientos que el usuario
        // escribio y que no existen en ningun otro lado.
        void borrarSnapshots();
      }
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  /* ──────────────────────────────── datos ─────────────────────────────── */

  // Se depende del id y no del objeto `session`: Supabase emite una sesion
  // nueva en cada refresco de token (cada hora), y eso recargaria toda la app.
  const userId = session?.user.id ?? null;

  /**
   * `silencioso` distingue "el usuario pidio actualizar" de "la app esta
   * arrancando". El trabajo es el mismo; lo que cambia es que en el primer caso
   * la pantalla no se vacia y al terminar se confirma con un aviso, porque el
   * usuario hizo algo y espera respuesta.
   */
  const loadAppData = useCallback(async (silencioso = false) => {
    if (!userId) return;
    if (silencioso) setRefrescando(true);
    else setLoading(true);

    /**
     * Primero se sube lo que quedo escrito sin senal, DESPUES se lee.
     *
     * Al reves, la lectura del servidor traeria una lista sin esos movimientos
     * y pisaria los locales: al usuario le pareceria que se perdieron justo
     * cuando volvio la conexion.
     */
    let sincronizadas = 0;
    let descartadas = 0;
    if (estaEnLinea()) {
      try {
        const resultado = await sincronizarPendientes();
        sincronizadas = resultado.creadas.length;
        descartadas = resultado.descartadas;
      } catch (err) {
        console.error('Error sincronizando pendientes:', err);
      }
    }

    try {
      const [
        transactions,
        categoryList,
        goalsList,
        budgetList,
        recurringList,
        accountList,
        debtList,
      ] = await Promise.all([
        fetchTransactions(),
        fetchCategories(),
        fetchSavingsGoals(),
        fetchBudgets(),
        fetchRecurring(),
        fetchAccounts(),
        fetchDebts(),
      ]);

      setDeudas(debtList.datos);
      setHayDeudas(debtList.disponible);
      setCategories(categoryList);
      setSavingsGoals(goalsList);
      setBudgets(budgetList.datos);
      setBudgetsDisponibles(budgetList.disponible);
      setRecurrentes(recurringList.datos);
      setRecurrentesDisponibles(recurringList.disponible);
      setCuentas(accountList.datos);
      setHayCuentas(accountList.disponible);

      /**
       * Las cuotas no son una tabla que exista o no, son tres columnas de
       * `transactions`. Lo normal es deducirlo de las filas que ya llegaron,
       * sin pedir nada extra. El sondeo explicito —que cuesta un 400 en la
       * consola— solo hace falta cuando no hay ni un movimiento del cual
       * deducirlo, es decir en una cuenta recien creada.
       */
      const deducido = hayColumnasDeCuotas();
      if (deducido === null) void cuotasDisponibles().then(setHayCuotas);
      else setHayCuotas(deducido);

      // El bucket de recibos no se puede deducir de los datos: hay que
      // preguntarle a Storage. Es una sola llamada por carga.
      void recibosDisponibles().then(setHayRecibos);

      // Los recurrentes que ya tocan este mes se materializan al abrir la app.
      // Se agregan al estado en vez de recargar: la insercion ya devolvio la
      // fila completa.
      let movimientos = transactions;
      if (recurringList.disponible && recurringList.datos.length > 0) {
        try {
          const cuentaPorDefecto = cuentasActivas(accountList.datos)[0]?.id ?? null;
          const generadas = await generarRecurrentesPendientes(
            recurringList.datos,
            cuentaPorDefecto
          );
          if (generadas.length > 0) {
            movimientos = [...generadas, ...movimientos];
            setRecurrentes((await fetchRecurring()).datos);
            toast.info(
              generadas.length === 1
                ? 'Se registró 1 movimiento recurrente de este mes'
                : `Se registraron ${generadas.length} movimientos recurrentes de este mes`
            );
          }
        } catch (err) {
          // Que falle la generacion no debe impedir ver las finanzas.
          console.error('Error generando recurrentes:', err);
        }
      }

      setData(movimientos);
      setError(null);
      setDesdeCache(false);
      setUltimaActualizacion(new Date());

      // Copia local para poder abrir la app sin señal. Se guarda despues de
      // materializar los recurrentes para que la foto sea la definitiva.
      void guardarSnapshot({
        userId,
        transactions: movimientos,
        accounts: accountList.datos,
        categories: categoryList,
        savingsGoals: goalsList,
        budgets: budgetList.datos,
        recurrentes: recurringList.datos,
      });

      if (sincronizadas > 0) {
        toast.success(
          sincronizadas === 1
            ? 'Se sincronizó 1 movimiento que habías registrado sin conexión'
            : `Se sincronizaron ${sincronizadas} movimientos registrados sin conexión`
        );
      }
      if (descartadas > 0) {
        toast.error(
          `${descartadas} movimiento(s) guardados sin conexión fueron rechazados al subirlos y se descartaron`
        );
      }
      // Sin este aviso, actualizar cuando no ha cambiado nada no se distingue de
      // que el boton no haya funcionado.
      if (silencioso && sincronizadas === 0 && descartadas === 0) {
        toast.success('Datos actualizados');
      }
    } catch (err) {
      /**
       * Si no se pudo leer del servidor se muestra la ultima copia local en vez
       * de una pantalla de error. Ver tus numeros de ayer es infinitamente mas
       * util que "No se pudo cargar la información", y el aviso deja claro que
       * pueden estar desactualizados.
       */
      const copia = await leerSnapshot(userId);
      if (copia) {
        setData(copia.transactions);
        setCategories(copia.categories);
        setSavingsGoals(copia.savingsGoals);
        setBudgets(copia.budgets);
        setRecurrentes(copia.recurrentes);
        setCuentas(copia.accounts);
        setHayCuentas(copia.accounts.length > 0);
        setDesdeCache(true);
        setError(null);
      } else {
        setError(errorMessage(err, 'No se pudo cargar la información'));
      }
      if (silencioso) toast.error(errorMessage(err, 'No se pudo actualizar'));
    } finally {
      setLoading(false);
      setRefrescando(false);
      setPorSincronizar(await contarPendientesDeSincronizar());
    }
  }, [toast, userId]);

  const refrescarDatos = useCallback(() => {
    void loadAppData(true);
  }, [loadAppData]);

  useEffect(() => {
    if (!authReady) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    loadAppData();
  }, [authReady, userId, loadAppData]);

  /**
   * Al recuperar la señal se sube la cola sola, sin que el usuario tenga que
   * recargar ni enterarse. El evento `online` del navegador miente a veces
   * (dice que hay red cuando solo hay wifi sin internet), pero el peor caso es
   * un intento fallido que deja todo en cola.
   */
  useEffect(() => {
    const alConectar = () => {
      setEnLinea(true);
      loadAppData();
    };
    const alDesconectar = () => setEnLinea(false);

    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, [loadAppData]);

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
    () => computeKpis(filteredData, previousData, savingsGoals),
    [filteredData, previousData, savingsGoals]
  );

  /* ── Saldos, agenda y disponible: NO dependen del periodo ── */

  /**
   * Estos tres bloques usan `data` completo y `today()`, no el rango filtrado.
   * "Cuanta plata tengo" y "que tengo que pagar" son preguntas sobre el
   * presente; filtrarlas por "mes pasado" no significaria nada.
   */
  const saldos = useMemo(() => saldosPorCuenta(cuentas, data), [cuentas, data]);
  const total = useMemo(() => saldoTotal(saldos), [saldos]);
  const sinCuenta = useMemo(() => movimientosSinCuenta(data), [data]);

  const agenda = useMemo(() => construirAgenda(data, recurrentes), [data, recurrentes]);

  const deudasResumen = useMemo(() => resumenDeudas(deudas, data), [deudas, data]);

  /**
   * El contador sobre el icono de la app instalada.
   *
   * Es lo mas cerca que se puede estar de una notificacion sin montar
   * infraestructura de push (servidor, claves VAPID, permisos, una Edge
   * Function que despierte al usuario). Donde la API no existe, no pasa nada.
   */
  useEffect(() => {
    actualizarBadge(agenda.urgentes.length);
  }, [agenda.urgentes.length]);

  const disponible = useMemo(
    () => disponibleDelMes(data, recurrentes, total),
    [data, recurrentes, total]
  );

  // Proyeccion y presupuestos siempre miran el mes en curso, no el periodo
  // seleccionado: "voy a cerrar el mes en X" solo tiene sentido para este mes.
  const proyeccion = useMemo(() => proyeccionCierreMes(data), [data]);

  const presupuestos = useMemo(
    () => estadoPresupuestos(data, budgets.map(b => ({ categoria: b.categoria, amount: b.amount }))),
    [data, budgets]
  );

  const categoryNames = useMemo(() => categories.map(category => category.name), [categories]);

  // Las transferencias se descartan: "Transferencia" no es una categoria que
  // uno quiera ver en el filtro junto a Mercado y Arriendo.
  const availableCategorias = useMemo(
    () =>
      Array.from(
        new Set([...categoryNames, ...soloIngresosYGastos(data).map(item => item.categoria)])
      ).sort((a, b) => a.localeCompare(b)),
    [categoryNames, data]
  );

  /* ────────────────────────────── acciones ────────────────────────────── */

  const handleSaveTransaction = async (payload: Omit<Transaction, 'id' | 'user_id'>) => {
    // Actualizacion puntual del array en vez de recargar las tres tablas
    // completas en cada guardado.
    if (modalState?.mode === 'edit') {
      const updated = await updateTransaction(modalState.tx.id, payload);
      setData(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      toast.success('Movimiento actualizado');
    } else {
      const { transaccion, encolada } = await createTransaction(payload);
      setData(prev => [transaccion, ...prev]);

      if (encolada) {
        setPorSincronizar(total => total + 1);
        toast.info('Guardado sin conexión. Se subirá solo cuando vuelva la señal.');
      } else {
        toast.success('Movimiento guardado');
      }
    }
  };

  const ordenarPorFecha = (items: Transaction[]) =>
    [...items].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  const SEGUNDOS_PARA_DESHACER = 6000;

  /**
   * Borrar con ventana de arrepentimiento.
   *
   * El movimiento desaparece de la pantalla al instante, pero la llamada al
   * servidor se retrasa unos segundos: si le das a "Deshacer", el borrado
   * simplemente nunca ocurre. Es mas seguro que borrar y recrear —si el
   * "recrear" fallara por falta de señal, el dato se perderia de verdad— y
   * menos molesto que un dialogo de confirmacion en cada borrado acertado.
   *
   * Si cierras la app dentro de esa ventana el movimiento sigue ahi al volver.
   * Es el fallo benigno: no perder nada.
   *
   * Las dos patas de una transferencia se borran juntas; borrar una sola
   * dejaria una cuenta con plata que salio y la otra sin la que entro.
   */
  const handleDeleteTransaction = (tx: Transaction, compraCompleta = false) => {
    const grupo = tx.transfer_group;
    const compra = compraCompleta ? tx.compra_id : null;

    const afectadas = data.filter(item =>
      compra
        ? item.compra_id === compra
        : grupo
          ? item.transfer_group === grupo
          : item.id === tx.id
    );
    if (afectadas.length === 0) return;

    const ids = new Set(afectadas.map(item => item.id));
    setData(prev => prev.filter(item => !ids.has(item.id)));

    const temporizador = window.setTimeout(async () => {
      borradosEnEspera.current.delete(tx.id);
      try {
        if (compra) await deleteCompra(compra);
        else if (grupo) await deleteTransfer(grupo);
        else await deleteTransaction(tx.id);
      } catch (err) {
        setData(prev => ordenarPorFecha([...prev, ...afectadas]));
        toast.error(errorMessage(err, 'No se pudo eliminar la transacción'));
      }
    }, SEGUNDOS_PARA_DESHACER);

    borradosEnEspera.current.set(tx.id, temporizador);

    const mensaje = compra
      ? `Compra de ${afectadas.length} cuotas eliminada`
      : grupo
        ? 'Transferencia eliminada'
        : 'Movimiento eliminado';

    toast.success(mensaje, {
      label: 'Deshacer',
      onClick: () => {
        window.clearTimeout(temporizador);
        borradosEnEspera.current.delete(tx.id);
        setData(prev => ordenarPorFecha([...prev, ...afectadas]));
      },
    });
  };

  /* ────────────────────────────── deudas ──────────────────────────────── */

  const handleCrearDeuda = async (input: NuevaDeudaInput) => {
    const { deuda, movimiento } = await createDebt(input);
    setDeudas(prev => [deuda, ...prev]);
    setData(prev => ordenarPorFecha([movimiento, ...prev]));
    toast.success(
      input.tipo === 'me_deben'
        ? `Préstamo a ${deuda.persona} registrado`
        : `Préstamo de ${deuda.persona} registrado`
    );
  };

  const handleAbonar = async (input: AbonoInput) => {
    const movimiento = await registrarMovimientoDeDeuda({
      deuda: input.estado.deuda,
      operacion: 'abono',
      importe: input.importe,
      fecha: input.fecha,
      account_id: input.account_id,
    });

    setData(prev => ordenarPorFecha([movimiento, ...prev]));

    const restante = input.estado.pendiente - input.importe;
    toast.success(
      restante > 0
        ? `Registrado. Quedan ${formatCurrency(restante)}`
        : `Deuda con ${input.estado.deuda.persona} saldada`
    );
  };

  const handleArchivarDeuda = async (estado: EstadoDeuda) => {
    try {
      const actualizada = await updateDebt(estado.deuda.id, { archivada: true });
      setDeudas(prev => prev.map(item => (item.id === actualizada.id ? actualizada : item)));
      toast.success('Deuda archivada', {
        label: 'Deshacer',
        onClick: () => {
          void updateDebt(estado.deuda.id, { archivada: false }).then(vuelta =>
            setDeudas(prev => prev.map(item => (item.id === vuelta.id ? vuelta : item)))
          );
        },
      });
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo archivar la deuda'));
    }
  };

  /**
   * Borra la ficha, no los movimientos: la plata se movio de verdad y borrar el
   * historial descuadraria los saldos. Al quedarse sin `debt_id` esos
   * movimientos vuelven a contar como gasto o ingreso normal, que es justo lo
   * que son si la deuda se dio por perdida.
   */
  const handleEliminarDeuda = async (estado: EstadoDeuda) => {
    try {
      await deleteDebt(estado.deuda.id);
      setDeudas(prev => prev.filter(item => item.id !== estado.deuda.id));
      setData(prev =>
        prev.map(item => (item.debt_id === estado.deuda.id ? { ...item, debt_id: null } : item))
      );
      toast.success('Deuda eliminada. Sus movimientos se conservan.');
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar la deuda'));
    }
  };

  /* ────────────────────────────── recibos ─────────────────────────────── */

  const handleAdjuntarRecibo = async (tx: Transaction, archivo: File) => {
    const ruta = await subirRecibo(tx.id, archivo);
    const actualizado = await updateTransaction(tx.id, { recibo_path: ruta });
    setData(prev => prev.map(item => (item.id === tx.id ? actualizado : item)));
  };

  const handleQuitarRecibo = async (tx: Transaction) => {
    if (tx.recibo_path) await borrarRecibo(tx.recibo_path);
    const actualizado = await updateTransaction(tx.id, { recibo_path: null });
    setData(prev => prev.map(item => (item.id === tx.id ? actualizado : item)));
  };

  const handleCompra = async (input: CompraInput) => {
    const creadas = await createCompraACuotas({
      total: input.total,
      cuotas: input.cuotas,
      primeraFecha: input.primeraFecha,
      categoria: input.categoria,
      descripcion: input.descripcion,
      account_id: input.account_id,
      primeraPagada: input.primeraPagada,
    });

    setData(prev => ordenarPorFecha([...creadas, ...prev]));
    toast.success(`Compra registrada en ${creadas.length} cuotas`);
  };

  const handleTransfer = async (input: TransferInput) => {
    const creadas = await createTransfer(input);
    setData(prev => [...creadas, ...prev]);
    toast.success('Transferencia registrada');
  };

  /** Un toque desde la agenda, sin abrir el formulario. */
  const handleMarcarPagado = async (id: string) => {
    const snapshot = data;
    const movimiento = data.find(item => item.id === id);
    if (!movimiento) return;

    setData(prev =>
      prev.map(item => (item.id === id ? { ...item, estado_pago: 'Pagado' as const } : item))
    );

    try {
      const actualizado = await updateTransaction(id, { estado_pago: 'Pagado' });
      setData(prev => prev.map(item => (item.id === id ? actualizado : item)));
      toast.success(
        movimiento.tipo === 'Gasto' ? 'Marcado como pagado' : 'Marcado como cobrado'
      );
    } catch (err) {
      setData(snapshot);
      toast.error(errorMessage(err, 'No se pudo actualizar el movimiento'));
    }
  };

  const handleCreateAccount = async (input: {
    nombre: string;
    tipo: AccountType;
    saldoInicial: number;
  }) => {
    const creada = await createAccount(input);
    setCuentas(prev => [...prev, creada].sort((a, b) => a.orden - b.orden));
  };

  const handleUpdateAccount = async (id: string, changes: Partial<Account>) => {
    const actualizada = await updateAccount(id, changes);
    setCuentas(prev => prev.map(item => (item.id === id ? actualizada : item)));
  };

  const handleDeleteAccount = async (id: string, reassignTo?: string) => {
    await deleteAccount(id, reassignTo);
    setCuentas(prev => prev.filter(item => item.id !== id));

    /**
     * Se refrescan solo los movimientos, no `loadAppData()`. Recargarlo todo
     * levanta el `loading` de pantalla completa, y al volver el panel de
     * Configuración se remonta: terminabas de vuelta en el menú de secciones,
     * lejos de donde estabas. Los recurrentes tambien pudieron reasignarse, asi
     * que se traen aparte.
     */
    const [movimientos, recurringList] = await Promise.all([fetchTransactions(), fetchRecurring()]);
    setData(movimientos);
    setRecurrentes(recurringList.datos);
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

  const handleSaveBudget = async (categoria: string, amount: number) => {
    const guardado = await upsertBudget(categoria, amount);
    setBudgets(prev => {
      const sinEsa = prev.filter(b => b.id !== guardado.id && b.categoria !== guardado.categoria);
      return [...sinEsa, guardado].sort((a, b) => a.categoria.localeCompare(b.categoria));
    });
  };

  const handleDeleteBudget = async (id: string) => {
    await deleteBudget(id);
    setBudgets(prev => prev.filter(b => b.id !== id));
  };

  const handleCreateRecurring = async (
    input: Omit<RecurringTransaction, 'id' | 'ultima_generacion' | 'activo'>
  ) => {
    const creado = await createRecurring(input);
    setRecurrentes(prev => [...prev, creado].sort((a, b) => a.dia_del_mes - b.dia_del_mes));
  };

  const handleToggleRecurring = async (id: string, activo: boolean) => {
    await toggleRecurring(id, activo);
    setRecurrentes(prev => prev.map(item => (item.id === id ? { ...item, activo } : item)));
  };

  const handleDeleteRecurring = async (id: string) => {
    await deleteRecurring(id);
    setRecurrentes(prev => prev.filter(item => item.id !== id));
  };

  const openCreate = () => setModalState({ mode: 'create' });

  /** Respaldo rapido desde el menu de cuenta, sin pasar por Configuración. */
  const handleExport = () => {
    if (data.length === 0) {
      toast.info('Todavía no hay movimientos para exportar');
      return;
    }
    downloadCsv(data, `mis-finanzas-${toDateString(today())}.csv`, cuentas);
    toast.success(`${data.length} movimientos exportados`);
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
      accounts={cuentas}
      resultCount={filteredData.length}
    />
  );

  // El mismo boton en Inicio y en Transacciones: son las dos vistas que miran
  // datos que pueden haber cambiado desde otro dispositivo.
  const botonActualizar = (
    <RefreshButton
      onClick={refrescarDatos}
      refrescando={refrescando}
      ultimaActualizacion={ultimaActualizacion}
      enLinea={enLinea}
    />
  );

  /**
   * El dashboard va de "ahora" a "historia", en ese orden.
   *
   * Arriba, sin filtro de periodo: cuanta plata tienes, cuanto puedes gastar y
   * que se te viene. Son las tres preguntas que uno se hace al abrir la app y
   * ninguna depende del rango de fechas.
   *
   * Debajo, ya con el selector de periodo: como te fue. Ahi si tiene sentido
   * mirar "mes pasado" o "ultimos 3 meses".
   */
  const dashboard = (
    <>
      {botonActualizar}

      {hayCuentas && <SaldoHero saldos={saldos} total={total} sinCuenta={sinCuenta} />}

      <MesEnCurso disponible={disponible} proyeccion={proyeccion} />

      <AgendaPanel agenda={agenda} onMarcarPagado={handleMarcarPagado} />

      {hayDeudas && (
        <DeudasPanel
          resumen={deudasResumen}
          onNueva={() => setDeudaModal({ modo: 'nueva' })}
          onAbonar={estado => setDeudaModal({ modo: 'abono', estado })}
          onArchivar={handleArchivarDeuda}
          onEliminar={handleEliminarDeuda}
        />
      )}

      <BudgetsPanel estados={presupuestos} />

      <div className="dashboard-divider">
        <span>Cómo te fue</span>
      </div>

      <PeriodSelector
        value={filters.period}
        onChange={period => setFilters(prev => ({ ...prev, period }))}
        rango={rango}
      />

      {filtersBar}

      <div className={`balance-hero ${kpis.beneficioNeto >= 0 ? 'is-positive' : 'is-negative'}`}>
        <span className="balance-hero__label">Balance del periodo</span>
        <strong className="balance-hero__value">{formatCurrency(kpis.beneficioNeto)}</strong>
        <div className="balance-hero__meta">
          <span>{kpis.beneficioNeto >= 0 ? 'Estás ahorrando' : 'Estás gastando de más'}</span>
          {kpis.tieneComparativo && (
            <span className="balance-hero__delta">
              {formatPercent(kpis.variacionAhorro)} vs periodo anterior
            </span>
          )}
        </div>
      </div>

      {/* Antes eran ocho tarjetas mas un desplegable con otras cuatro. Se
          quedaron las dos que se miran: numero de movimientos, ticket medio y
          mayor gasto individual no cambiaban ninguna decision, y "mayor
          categoria" ya sale mejor en la grafica de barras de abajo. */}
      <div className="kpi-grid">
        <KpiCard
          title="Ingresos"
          value={formatCurrency(kpis.totalIngresos)}
          icon={TrendingUp}
          color="var(--success)"
          subtitle={
            kpis.ingresosPendientes > 0
              ? `+${formatCurrency(kpis.ingresosPendientes)} por cobrar`
              : undefined
          }
        />
        <KpiCard
          title="Gastos"
          value={formatCurrency(kpis.totalGastos)}
          icon={TrendingDown}
          color="var(--danger)"
          subtitle={
            kpis.gastosPendientes > 0
              ? `+${formatCurrency(kpis.gastosPendientes)} por pagar`
              : undefined
          }
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
        <DashboardCharts data={filteredData} allData={data} />
      </Suspense>
    </>
  );

  return (
    <div className="dashboard-container">
      <header className="app-header">
        <div className="app-header__brand">
          <h1 className="app-title">MyContabilidadApp</h1>
          <p className="app-subtitle">Control de ingresos, gastos y métricas</p>
        </div>

        <div className="app-header__actions">
          {/* El boton grande solo en escritorio: en celular esta accion vive en
              el FAB de la barra inferior, dentro del alcance del pulgar. */}
          <button onClick={openCreate} className="primary-action hide-mobile">
            <Plus size={18} />
            Nuevo movimiento
          </button>

          <AccountMenu
            email={session.user.email ?? ''}
            onLogout={handleLogout}
            onExport={handleExport}
          />
        </div>
      </header>

      <TopNav onAdd={openCreate} />

      <SyncBanner
        enLinea={enLinea}
        porSincronizar={porSincronizar}
        desdeCache={desdeCache}
        onReintentar={refrescarDatos}
      />

      {error && (
        <div className="error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => loadAppData()} className="error-banner__action">
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
              {botonActualizar}
              <PeriodSelector
                value={filters.period}
                onChange={period => setFilters(prev => ({ ...prev, period }))}
                rango={rango}
              />
              {filtersBar}
              <TransactionsTable
                transactions={filteredData}
                accounts={cuentas}
                hayRecibos={hayRecibos}
                enLinea={enLinea}
                onEdit={tx => setModalState({ mode: 'edit', tx })}
                onRepeat={tx => setModalState({ mode: 'repeat', tx })}
                onDelete={handleDeleteTransaction}
                onAdjuntarRecibo={handleAdjuntarRecibo}
                onQuitarRecibo={handleQuitarRecibo}
              />
            </>
          }
        />
        <Route
          path="/configuracion"
          element={
            <SettingsPanel
              email={session.user.email ?? ''}
              categories={categories}
              loading={loading}
              transactions={data}
              savingsGoals={savingsGoals}
              budgets={budgets}
              budgetsDisponibles={budgetsDisponibles}
              recurrentes={recurrentes}
              recurrentesDisponibles={recurrentesDisponibles}
              saldos={saldos}
              cuentas={cuentas}
              cuentasDisponibles={hayCuentas}
              onCreateAccount={handleCreateAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onAddCategory={handleAddCategory}
              onDeleteCategory={handleDeleteCategory}
              onAddGoal={handleAddGoal}
              onUpdateGoal={handleUpdateGoal}
              onDeleteGoal={handleDeleteGoal}
              onSaveBudget={handleSaveBudget}
              onDeleteBudget={handleDeleteBudget}
              onCreateRecurring={handleCreateRecurring}
              onToggleRecurring={handleToggleRecurring}
              onDeleteRecurring={handleDeleteRecurring}
              onImport={handleImport}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {modalState !== null && (
        <TransactionModal
          categories={categoryNames}
          accounts={cuentas}
          transactions={data}
          hayCuotas={hayCuotas}
          onClose={() => setModalState(null)}
          onSave={handleSaveTransaction}
          onTransfer={handleTransfer}
          onCompra={handleCompra}
          editingTransaction={modalState.mode === 'edit' ? modalState.tx : undefined}
          prefill={modalState.mode === 'repeat' ? modalState.tx : undefined}
        />
      )}

      {deudaModal !== null && (
        <DeudaModal
          accounts={cuentas}
          abonarA={deudaModal.modo === 'abono' ? deudaModal.estado : undefined}
          onClose={() => setDeudaModal(null)}
          onCrear={handleCrearDeuda}
          onAbonar={handleAbonar}
        />
      )}

      <footer className="app-footer">
        © {new Date().getFullYear()} Jorge Gaitán — MyContabilidadApp
      </footer>
    </div>
  );
};

export default App;
