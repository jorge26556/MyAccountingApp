import React, { useRef, useState } from 'react';
import {
  Check,
  Download,
  Edit2,
  FolderCog,
  Plus,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Category, SavingsGoal, Transaction } from '../types';
import { formatCurrency } from '../lib/format';
import { downloadCsv, parseCsv } from '../lib/csv';
import { toDateString, today } from '../lib/dates';
import { countTransactionsByCategory } from '../services/api';
import { errorMessage, useToast } from '../lib/toast';

interface SettingsPanelProps {
  categories: Category[];
  loading: boolean;
  transactions: Transaction[];
  onAddCategory: (name: string) => Promise<void>;
  onDeleteCategory: (name: string, reassignTo?: string) => Promise<void>;
  savingsGoals: SavingsGoal[];
  onAddGoal: (name: string, amount: number) => Promise<void>;
  onUpdateGoal: (id: string, name: string, amount: number) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
  onImport: (rows: Array<Omit<Transaction, 'id' | 'user_id'>>) => Promise<number>;
}

interface PendingDelete {
  name: string;
  affected: number;
  reassignTo: string;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  categories,
  loading,
  transactions,
  onAddCategory,
  onDeleteCategory,
  savingsGoals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onImport,
}) => {
  const toast = useToast();

  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalAmount, setNewGoalAmount] = useState('');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalName, setEditGoalName] = useState('');
  const [editGoalAmount, setEditGoalAmount] = useState('');

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ─────────────────────────── categorias ─────────────────────────── */

  const handleAddCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onAddCategory(newCategory);
      toast.success(`Categoría "${newCategory.trim()}" creada`);
      setNewCategory('');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo crear la categoría'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Borrar una categoria dejaba transacciones apuntando a un nombre que ya no
   * existia. Ahora primero se cuenta cuantas quedarian huerfanas y se ofrece
   * reasignarlas.
   */
  const startDeleteCategory = async (name: string) => {
    try {
      const affected = await countTransactionsByCategory(name);
      const destino = categories.find(item => item.name !== name)?.name ?? '';
      setPendingDelete({ name, affected, reassignTo: affected > 0 ? destino : '' });
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo verificar la categoría'));
    }
  };

  const confirmDeleteCategory = async () => {
    if (!pendingDelete) return;

    setSaving(true);
    try {
      await onDeleteCategory(
        pendingDelete.name,
        pendingDelete.affected > 0 && pendingDelete.reassignTo ? pendingDelete.reassignTo : undefined
      );
      toast.success(
        pendingDelete.affected > 0 && pendingDelete.reassignTo
          ? `Categoría eliminada y ${pendingDelete.affected} transacciones movidas a "${pendingDelete.reassignTo}"`
          : 'Categoría eliminada'
      );
      setPendingDelete(null);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar la categoría'));
    } finally {
      setSaving(false);
    }
  };

  /* ────────────────────────── metas de ahorro ─────────────────────── */

  const handleAddGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await onAddGoal(newGoalName, Number(newGoalAmount));
      toast.success(`Meta "${newGoalName.trim()}" creada`);
      setNewGoalName('');
      setNewGoalAmount('');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo crear la meta'));
    }
  };

  const handleEditGoalSave = async (id: string) => {
    try {
      await onUpdateGoal(id, editGoalName, Number(editGoalAmount));
      toast.success('Meta actualizada');
      setEditingGoalId(null);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo actualizar la meta'));
    }
  };

  const handleDeleteGoal = async (id: string, name: string) => {
    try {
      await onDeleteGoal(id);
      toast.success(`Meta "${name}" eliminada`);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar la meta'));
    }
  };

  /* ──────────────────────────── datos ─────────────────────────────── */

  const handleExport = () => {
    if (transactions.length === 0) {
      toast.info('No hay transacciones para exportar');
      return;
    }
    downloadCsv(transactions, `mis-finanzas-${toDateString(today())}.csv`);
    toast.success(`${transactions.length} transacciones exportadas`);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const contenido = await file.text();
      const { rows, errors } = parseCsv(contenido);

      if (errors.length > 0) {
        // Se muestran las primeras: un archivo malo puede tener cientos.
        toast.error(`${errors.length} fila(s) con problemas. ${errors.slice(0, 2).join(' · ')}`);
      }

      if (rows.length > 0) {
        const insertadas = await onImport(rows);
        toast.success(`${insertadas} transacciones importadas`);
      } else if (errors.length === 0) {
        toast.info('El archivo no tenía filas para importar');
      }
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo leer el archivo'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <section className="settings-layout">
      {/* ───────────── categorias ───────────── */}
      <div className="card settings-hero">
        <div className="settings-hero__icon">
          <FolderCog size={28} />
        </div>
        <div>
          <h2>Configuración</h2>
          <p>Administra las categorías que usas al crear o editar transacciones.</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="card settings-card align-self-start">
          <div className="settings-card__header">
            <h3>Nueva categoría</h3>
            <span className="badge badge-pending">{categories.length} activas</span>
          </div>
          <form onSubmit={handleAddCategory} className="settings-form">
            <label htmlFor="category-name">Nombre</label>
            <div className="settings-form__row">
              <input
                id="category-name"
                type="text"
                className="input-style"
                placeholder="Ej: Salud, Educación..."
                value={newCategory}
                onChange={event => setNewCategory(event.target.value)}
                disabled={saving || loading}
              />
              <button
                type="submit"
                className="primary-action"
                disabled={saving || loading || !newCategory.trim()}
              >
                <Plus size={16} />
                {saving ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>

        <div className="card settings-card">
          <div className="settings-card__header">
            <h3>Categorías disponibles</h3>
            <span className="settings-card__hint">Se reflejan de inmediato en el formulario.</span>
          </div>

          <div className="settings-list">
            {categories.map(category => (
              <div key={category.id} className="settings-list__item">
                <div>
                  <strong>{category.name}</strong>
                  <p>Disponible al crear y editar transacciones</p>
                </div>
                <button
                  type="button"
                  className="danger-action"
                  onClick={() => startDeleteCategory(category.name)}
                  disabled={loading || saving || categories.length <= 1}
                  title={categories.length <= 1 ? 'Debe quedar al menos una categoría' : 'Eliminar'}
                >
                  <Trash2 size={15} />
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {pendingDelete && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginTop: '1rem' }}>
          <h3 style={{ color: 'var(--danger)', marginBottom: '0.75rem' }}>
            Eliminar "{pendingDelete.name}"
          </h3>

          {pendingDelete.affected > 0 ? (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {pendingDelete.affected} transacción(es) usan esta categoría. Si no las reasignas,
                quedarán con una categoría que ya no existe.
              </p>
              <label htmlFor="reassign-to" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Mover esas transacciones a:
              </label>
              <select
                id="reassign-to"
                className="input-style"
                style={{ marginTop: '0.4rem', maxWidth: '320px' }}
                value={pendingDelete.reassignTo}
                onChange={event =>
                  setPendingDelete({ ...pendingDelete, reassignTo: event.target.value })
                }
              >
                <option value="">No reasignar (dejarlas huérfanas)</option>
                {categories
                  .filter(item => item.name !== pendingDelete.name)
                  .map(item => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </>
          ) : (
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Ninguna transacción usa esta categoría. Se puede eliminar sin efectos.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="danger-action" onClick={confirmDeleteCategory} disabled={saving}>
              <Trash2 size={15} />
              {saving ? 'Eliminando...' : 'Confirmar eliminación'}
            </button>
            <button type="button" className="ghost-icon-button" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ───────────── metas ───────────── */}
      <div className="card settings-hero" style={{ marginTop: '2rem' }}>
        <div
          className="settings-hero__icon"
          style={{ background: 'rgba(56, 139, 253, 0.12)', color: 'var(--info)' }}
        >
          <Target size={28} />
        </div>
        <div>
          <h2>Metas de ahorro</h2>
          <p>
            El dashboard compara tu ahorro del periodo seleccionado contra cada una de estas metas.
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="card settings-card align-self-start">
          <div className="settings-card__header">
            <h3>Nueva meta</h3>
          </div>
          <form onSubmit={handleAddGoal} className="settings-form">
            <label htmlFor="goal-name">Nombre</label>
            <input
              id="goal-name"
              type="text"
              className="input-style"
              placeholder="Ej: Ahorro vacaciones"
              value={newGoalName}
              onChange={event => setNewGoalName(event.target.value)}
            />

            <label htmlFor="goal-amount" style={{ marginTop: '0.5rem' }}>
              Monto objetivo (COP)
            </label>
            <div className="settings-form__row">
              <input
                id="goal-amount"
                type="number"
                min="1"
                className="input-style"
                placeholder="Ej: 500000"
                value={newGoalAmount}
                onChange={event => setNewGoalAmount(event.target.value)}
              />
              <button
                type="submit"
                className="primary-action"
                disabled={!newGoalName.trim() || Number(newGoalAmount) <= 0}
              >
                <Plus size={16} /> Agregar
              </button>
            </div>
          </form>
        </div>

        <div className="card settings-card">
          <div className="settings-card__header">
            <h3>Tus metas</h3>
            <span className="settings-card__hint">Todas se muestran en el dashboard.</span>
          </div>

          <div className="settings-list">
            {savingsGoals.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No tienes metas activas.
              </p>
            ) : (
              savingsGoals.map(goal => (
                <div key={goal.id} className="settings-list__item">
                  {editingGoalId === goal.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                      <input
                        type="text"
                        className="input-style"
                        value={editGoalName}
                        onChange={event => setEditGoalName(event.target.value)}
                        placeholder="Nombre de meta"
                      />
                      <input
                        type="number"
                        min="1"
                        className="input-style"
                        value={editGoalAmount}
                        onChange={event => setEditGoalAmount(event.target.value)}
                        placeholder="Monto"
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="primary-action"
                          onClick={() => handleEditGoalSave(goal.id)}
                          style={{ padding: '0.5rem 0.8rem' }}
                        >
                          <Check size={14} /> Guardar
                        </button>
                        <button
                          type="button"
                          className="ghost-icon-button"
                          onClick={() => setEditingGoalId(null)}
                          style={{ padding: '0.5rem 0.8rem' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <strong>{goal.name}</strong>
                        <p>{formatCurrency(goal.amount)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="ghost-icon-button"
                          style={{
                            color: 'var(--accent-primary)',
                            padding: '0.4rem',
                            border: '1px solid rgba(88, 166, 255, 0.2)',
                            borderRadius: '8px',
                          }}
                          onClick={() => {
                            setEditingGoalId(goal.id);
                            setEditGoalName(goal.name);
                            setEditGoalAmount(String(goal.amount));
                          }}
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="danger-action"
                          style={{ padding: '0.4rem 0.6rem' }}
                          onClick={() => handleDeleteGoal(goal.id, goal.name)}
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ───────────── datos ───────────── */}
      <div className="card settings-hero" style={{ marginTop: '2rem' }}>
        <div
          className="settings-hero__icon"
          style={{ background: 'rgba(63, 185, 80, 0.12)', color: 'var(--success)' }}
        >
          <Download size={28} />
        </div>
        <div>
          <h2>Tus datos</h2>
          <p>
            Exporta un respaldo completo en CSV, o importa movimientos desde el extracto de tu banco
            en vez de digitarlos uno por uno.
          </p>
        </div>
      </div>

      <div className="card settings-card">
        <div className="settings-card__header">
          <h3>Respaldo e importación</h3>
          <span className="settings-card__hint">
            Columnas: fecha (YYYY-MM-DD), tipo, categoria, importe, estado_pago, canal, descripcion.
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button type="button" className="primary-action" onClick={handleExport}>
            <Download size={16} />
            Exportar {transactions.length} transacciones
          </button>

          <button
            type="button"
            className="ghost-icon-button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1rem',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
            }}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload size={16} />
            {importing ? 'Importando...' : 'Importar CSV'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </section>
  );
};

export default SettingsPanel;
