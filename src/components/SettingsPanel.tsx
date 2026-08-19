import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FolderCog,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Target,
  UserCog,
  Wallet,
} from 'lucide-react';
import type { Account, AccountType, Category, SavingsGoal, Transaction } from '../types';
import type { SaldoCuenta } from '../lib/accounts';
import type { Budget, RecurringTransaction } from '../services/extras';
import type { UsuarioAdmin } from '../services/access';
import { useIsMobile } from '../lib/useMediaQuery';

import AccountSection from './settings/AccountSection';
import AccountsSection from './settings/AccountsSection';
import CategoriesSection from './settings/CategoriesSection';
import GoalsSection from './settings/GoalsSection';
import BudgetsSection from './settings/BudgetsSection';
import RecurringSection from './settings/RecurringSection';
import DataSection from './settings/DataSection';
import UsersSection from './settings/UsersSection';

interface SettingsPanelProps {
  email: string;
  categories: Category[];
  loading: boolean;
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  budgets: Budget[];
  budgetsDisponibles: boolean;
  recurrentes: RecurringTransaction[];
  recurrentesDisponibles: boolean;
  saldos: SaldoCuenta[];
  cuentas: Account[];
  cuentasDisponibles: boolean;
  onCreateAccount: (input: { nombre: string; tipo: AccountType; saldoInicial: number }) => Promise<void>;
  onUpdateAccount: (id: string, changes: Partial<Account>) => Promise<void>;
  onDeleteAccount: (id: string, reassignTo?: string) => Promise<void>;
  onAddCategory: (name: string) => Promise<void>;
  onRenameCategory: (oldName: string, newName: string) => Promise<void>;
  onDeleteCategory: (name: string, reassignTo?: string) => Promise<void>;
  onAddGoal: (name: string, amount: number) => Promise<void>;
  onUpdateGoal: (id: string, name: string, amount: number) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
  onSaveBudget: (categoria: string, amount: number) => Promise<void>;
  onDeleteBudget: (id: string) => Promise<void>;
  onCreateRecurring: (
    input: Omit<RecurringTransaction, 'id' | 'ultima_generacion' | 'activo'>
  ) => Promise<void>;
  onToggleRecurring: (id: string, activo: boolean) => Promise<void>;
  onDeleteRecurring: (id: string) => Promise<void>;
  onImport: (rows: Array<Omit<Transaction, 'id' | 'user_id'>>) => Promise<number>;
  esAdmin: boolean;
  miUserId: string;
  usuarios: UsuarioAdmin[];
  onSetAprobado: (userId: string, aprobado: boolean) => Promise<void>;
  onReloadUsuarios: () => Promise<void>;
}

type SectionId =
  | 'cuentas'
  | 'cuenta'
  | 'categorias'
  | 'metas'
  | 'presupuestos'
  | 'recurrentes'
  | 'datos'
  | 'usuarios';

type Seccion = { id: SectionId; label: string; hint: string; icon: React.ElementType };

const SECCIONES_BASE: Seccion[] = [
  { id: 'cuentas', label: 'Cuentas', hint: 'Dónde está tu plata y cuánto hay', icon: Wallet },
  { id: 'categorias', label: 'Categorías', hint: 'Cómo clasificas tus movimientos', icon: FolderCog },
  { id: 'presupuestos', label: 'Presupuestos', hint: 'Topes mensuales por categoría', icon: PiggyBank },
  { id: 'metas', label: 'Metas de ahorro', hint: 'Objetivos a alcanzar', icon: Target },
  { id: 'recurrentes', label: 'Recurrentes', hint: 'Movimientos que se repiten', icon: Repeat },
  { id: 'datos', label: 'Datos', hint: 'Respaldo e importación', icon: Database },
  { id: 'cuenta', label: 'Mi perfil', hint: 'Correo, contraseña y baja', icon: UserCog },
];

/**
 * Antes esto era la misma tarjeta "hero" repetida tres veces, una por bloque,
 * con categorias, metas y datos pesando lo mismo visualmente. No habia jerarquia
 * y parecian tres paginas pegadas.
 *
 * Ahora hay un solo titulo y secciones reales: rail lateral en escritorio, y en
 * celular una lista en la que entras y vuelves, que es el patron que la gente
 * ya conoce de los ajustes del telefono.
 */
const SettingsPanel: React.FC<SettingsPanelProps> = props => {
  const isMobile = useIsMobile();
  const [active, setActive] = useState<SectionId | null>(null);

  /**
   * La seccion de usuarios solo existe para un administrador. Ocultarla no es
   * la proteccion —esa la pone la RLS—, es no ensuciar el menu de todos con
   * algo que no van a poder usar.
   */
  const pendientes = props.usuarios.filter(item => !item.aprobado).length;

  const SECCIONES: Seccion[] = props.esAdmin
    ? [
        ...SECCIONES_BASE,
        {
          id: 'usuarios',
          label: 'Usuarios',
          hint:
            pendientes === 0
              ? 'Quien puede entrar a la app'
              : `${pendientes} pendiente(s) de aprobación`,
          icon: ShieldCheck,
        },
      ]
    : SECCIONES_BASE;

  const seccionActiva: SectionId = active ?? 'cuentas';

  const contenido = (id: SectionId) => {
    switch (id) {
      case 'cuentas':
        return (
          <AccountsSection
            disponible={props.cuentasDisponibles}
            saldos={props.saldos}
            onCreate={props.onCreateAccount}
            onUpdate={props.onUpdateAccount}
            onDelete={props.onDeleteAccount}
          />
        );
      case 'cuenta':
        return <AccountSection email={props.email} />;
      case 'categorias':
        return (
          <CategoriesSection
            categories={props.categories}
            loading={props.loading}
            onAdd={props.onAddCategory}
            onRename={props.onRenameCategory}
            onDelete={props.onDeleteCategory}
          />
        );
      case 'presupuestos':
        return (
          <BudgetsSection
            disponible={props.budgetsDisponibles}
            budgets={props.budgets}
            categorias={props.categories.map(c => c.name)}
            onSave={props.onSaveBudget}
            onDelete={props.onDeleteBudget}
          />
        );
      case 'metas':
        return (
          <GoalsSection
            goals={props.savingsGoals}
            onAdd={props.onAddGoal}
            onUpdate={props.onUpdateGoal}
            onDelete={props.onDeleteGoal}
          />
        );
      case 'recurrentes':
        return (
          <RecurringSection
            disponible={props.recurrentesDisponibles}
            recurrentes={props.recurrentes}
            categorias={props.categories.map(c => c.name)}
            cuentas={props.cuentas}
            onCreate={props.onCreateRecurring}
            onToggle={props.onToggleRecurring}
            onDelete={props.onDeleteRecurring}
          />
        );
      case 'usuarios':
        return (
          <UsersSection
            usuarios={props.usuarios}
            miUserId={props.miUserId}
            onSetAprobado={props.onSetAprobado}
            onReload={props.onReloadUsuarios}
          />
        );
      case 'datos':
        return (
          <DataSection
            transactions={props.transactions}
            accounts={props.cuentas}
            onImport={props.onImport}
          />
        );
    }
  };

  /* ── Celular: lista → sección, con vuelta atrás ── */
  if (isMobile) {
    if (active === null) {
      return (
        <section className="settings">
          <h2 className="settings__title">Configuración</h2>

          <nav className="settings-nav" aria-label="Secciones de configuración">
            {SECCIONES.map(seccion => {
              const Icon = seccion.icon;
              return (
                <button
                  key={seccion.id}
                  type="button"
                  className="settings-nav__item"
                  onClick={() => setActive(seccion.id)}
                >
                  <span className="settings-nav__icon">
                    <Icon size={18} />
                  </span>
                  <span className="settings-nav__text">
                    <strong>{seccion.label}</strong>
                    <small>{seccion.hint}</small>
                  </span>
                  <ChevronRight size={18} className="settings-nav__chevron" />
                </button>
              );
            })}
          </nav>
        </section>
      );
    }

    const actual = SECCIONES.find(s => s.id === active)!;
    return (
      <section className="settings">
        <button type="button" className="settings-back" onClick={() => setActive(null)}>
          <ChevronLeft size={18} />
          Configuración
        </button>
        <h2 className="settings__title">{actual.label}</h2>
        <p className="settings__hint">{actual.hint}</p>
        {contenido(active)}
      </section>
    );
  }

  /* ── Escritorio: rail + contenido ── */
  const actual = SECCIONES.find(s => s.id === seccionActiva)!;

  return (
    <section className="settings settings--desktop">
      <aside className="settings-rail">
        <h2 className="settings__title">Configuración</h2>
        <nav aria-label="Secciones de configuración">
          {SECCIONES.map(seccion => {
            const Icon = seccion.icon;
            return (
              <button
                key={seccion.id}
                type="button"
                className={`settings-rail__item ${seccionActiva === seccion.id ? 'is-active' : ''}`}
                onClick={() => setActive(seccion.id)}
                aria-current={seccionActiva === seccion.id ? 'page' : undefined}
              >
                <Icon size={17} />
                <span>{seccion.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="settings-content">
        <header className="settings-content__head">
          <h3>{actual.label}</h3>
          <p>{actual.hint}</p>
        </header>
        {contenido(seccionActiva)}
      </div>
    </section>
  );
};

export default SettingsPanel;
