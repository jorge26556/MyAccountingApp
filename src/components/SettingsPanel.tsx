import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FolderCog,
  PiggyBank,
  Repeat,
  Target,
  UserCog,
} from 'lucide-react';
import type { Category, SavingsGoal, Transaction } from '../types';
import type { Budget, RecurringTransaction } from '../services/extras';
import { useIsMobile } from '../lib/useMediaQuery';

import AccountSection from './settings/AccountSection';
import CategoriesSection from './settings/CategoriesSection';
import GoalsSection from './settings/GoalsSection';
import BudgetsSection from './settings/BudgetsSection';
import RecurringSection from './settings/RecurringSection';
import DataSection from './settings/DataSection';

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
  onAddCategory: (name: string) => Promise<void>;
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
}

type SectionId = 'cuenta' | 'categorias' | 'metas' | 'presupuestos' | 'recurrentes' | 'datos';

const SECCIONES: Array<{ id: SectionId; label: string; hint: string; icon: React.ElementType }> = [
  { id: 'cuenta', label: 'Cuenta', hint: 'Perfil, contraseña y baja', icon: UserCog },
  { id: 'categorias', label: 'Categorías', hint: 'Cómo clasificas tus movimientos', icon: FolderCog },
  { id: 'presupuestos', label: 'Presupuestos', hint: 'Topes mensuales por categoría', icon: PiggyBank },
  { id: 'metas', label: 'Metas de ahorro', hint: 'Objetivos a alcanzar', icon: Target },
  { id: 'recurrentes', label: 'Recurrentes', hint: 'Movimientos que se repiten', icon: Repeat },
  { id: 'datos', label: 'Datos', hint: 'Respaldo e importación', icon: Database },
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

  const seccionActiva: SectionId = active ?? 'cuenta';

  const contenido = (id: SectionId) => {
    switch (id) {
      case 'cuenta':
        return <AccountSection email={props.email} />;
      case 'categorias':
        return (
          <CategoriesSection
            categories={props.categories}
            loading={props.loading}
            onAdd={props.onAddCategory}
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
            onCreate={props.onCreateRecurring}
            onToggle={props.onToggleRecurring}
            onDelete={props.onDeleteRecurring}
          />
        );
      case 'datos':
        return <DataSection transactions={props.transactions} onImport={props.onImport} />;
    }
  };

  /* ── Celular: lista → sección, con vuelta atrás ── */
  if (isMobile) {
    if (active === null) {
      return (
        <section className="settings">
          <h2 className="settings__title">Configuración</h2>

          <nav className="settings-list" aria-label="Secciones de configuración">
            {SECCIONES.map(seccion => {
              const Icon = seccion.icon;
              return (
                <button
                  key={seccion.id}
                  type="button"
                  className="settings-list__item"
                  onClick={() => setActive(seccion.id)}
                >
                  <span className="settings-list__icon">
                    <Icon size={18} />
                  </span>
                  <span className="settings-list__text">
                    <strong>{seccion.label}</strong>
                    <small>{seccion.hint}</small>
                  </span>
                  <ChevronRight size={18} className="settings-list__chevron" />
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
