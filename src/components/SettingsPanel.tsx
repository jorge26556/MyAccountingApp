import React, { useState } from 'react';
import { FolderCog, Plus, Trash2, Target, Edit2, X, Check } from 'lucide-react';
import type { Category, SavingsGoal } from '../types';

interface SettingsPanelProps {
  categories: Category[];
  loading: boolean;
  onAddCategory: (name: string) => Promise<void>;
  onDeleteCategory: (name: string) => Promise<void>;
  savingsGoals: SavingsGoal[];
  onAddGoal: (name: string, amount: number) => Promise<void>;
  onUpdateGoal: (id: string, name: string, amount: number) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  categories,
  loading,
  onAddCategory,
  onDeleteCategory,
  savingsGoals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
}) => {
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const handleAddCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      await onAddCategory(newCategory);
      setNewCategory('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la categoria';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (name: string) => {
    setDeletingName(name);

    try {
      await onDeleteCategory(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar la categoria';
      alert(message);
    } finally {
      setDeletingName(null);
    }
  };

  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalAmount, setNewGoalAmount] = useState('');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalName, setEditGoalName] = useState('');
  const [editGoalAmount, setEditGoalAmount] = useState('');

  const handleAddGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newGoalName.trim() || !newGoalAmount) return;
    
    try {
      await onAddGoal(newGoalName, Number(newGoalAmount));
      setNewGoalName('');
      setNewGoalAmount('');
    } catch (e) {
      alert('Error al guardar meta de ahorro');
    }
  };

  const handleDeleteGoal = async (id: string) => {
    try {
      await onDeleteGoal(id);
    } catch (e) {
      alert('Error al eliminar meta');
    }
  };

  const handleEditGoalInit = (goal: SavingsGoal) => {
    setEditingGoalId(goal.id);
    setEditGoalName(goal.name);
    setEditGoalAmount(goal.amount.toString());
  };

  const handleEditGoalSave = async (id: string) => {
    if (!editGoalName.trim() || !editGoalAmount) return;
    
    try {
      await onUpdateGoal(id, editGoalName, Number(editGoalAmount));
      setEditingGoalId(null);
    } catch (e) {
      alert('Error al actualizar meta');
    }
  };

  return (
    <section className="settings-layout">
      <div className="card settings-hero">
        <div className="settings-hero__icon">
          <FolderCog size={28} />
        </div>
        <div>
          <h2>Configuracion</h2>
          <p>
            Administra las categorias que vas a usar al crear o editar transacciones. Este modulo queda listo para
            crecer despues con nuevas opciones del sistema.
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="card settings-card align-self-start">
          <div className="settings-card__header">
            <h3>Nueva categoria</h3>
            <span className="badge badge-pending">{categories.length} activas</span>
          </div>
          <form onSubmit={handleAddCategory} className="settings-form">
            <label htmlFor="category-name">Nombre</label>
            <div className="settings-form__row">
              <input
                id="category-name"
                type="text"
                className="input-style"
                placeholder="Ej: Salud, Educacion..."
                value={newCategory}
                onChange={event => setNewCategory(event.target.value)}
                disabled={saving || loading}
              />
              <button type="submit" className="primary-action" disabled={saving || loading || !newCategory.trim()}>
                <Plus size={16} />
                {saving ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>

        <div className="card settings-card">
          <div className="settings-card__header">
            <h3>Categorias disponibles</h3>
            <span className="settings-card__hint">Se reflejan de inmediato en el formulario de transacciones.</span>
          </div>

          <div className="settings-list">
            {categories.map(category => (
              <div key={category.id} className="settings-list__item">
                <div>
                  <strong>{category.name}</strong>
                  <p>Disponible en crear y editar transacciones</p>
                </div>
                <button
                  type="button"
                  className="danger-action"
                  onClick={() => handleDeleteCategory(category.name)}
                  disabled={loading || deletingName === category.name || categories.length <= 1}
                >
                  <Trash2 size={15} />
                  {deletingName === category.name ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card settings-hero" style={{ marginTop: '2rem' }}>
        <div className="settings-hero__icon" style={{ background: 'rgba(56, 139, 253, 0.12)', color: 'var(--info)' }}>
          <Target size={28} />
        </div>
        <div>
          <h2>Metas de Ahorro</h2>
          <p>
            Establece objetivos de ahorro mensual. El dashboard comparara tu ahorro actual contra esta meta principal.
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="card settings-card align-self-start">
          <div className="settings-card__header">
            <h3>Nueva meta de ahorro</h3>
          </div>
          <form onSubmit={handleAddGoal} className="settings-form">
            <label htmlFor="goal-name">Nombre (Ej. Viaje, Reserva)</label>
            <input
              id="goal-name"
              type="text"
              className="input-style"
              placeholder="Ej: Ahorro Vacaciones"
              value={newGoalName}
              onChange={event => setNewGoalName(event.target.value)}
            />
            
            <label htmlFor="goal-amount" style={{ marginTop: '0.5rem' }}>Monto objetivo (COP)</label>
            <div className="settings-form__row">
              <input
                id="goal-amount"
                type="number"
                min="0"
                className="input-style"
                placeholder="Ej: 500000"
                value={newGoalAmount}
                onChange={event => setNewGoalAmount(event.target.value)}
              />
              <button type="submit" className="primary-action" disabled={!newGoalName.trim() || !newGoalAmount}>
                <Plus size={16} /> Agregar
              </button>
            </div>
          </form>
        </div>

        <div className="card settings-card">
          <div className="settings-card__header">
            <h3>Tus metas</h3>
            <span className="settings-card__hint">Visibles en el Dashboard principal.</span>
          </div>

          <div className="settings-list">
            {savingsGoals.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No tienes metas activas.</p>
            ) : (
              savingsGoals.map(goal => (
                <div key={goal.id} className="settings-list__item">
                  {editingGoalId === goal.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                      <input
                        type="text"
                        className="input-style"
                        value={editGoalName}
                        onChange={e => setEditGoalName(e.target.value)}
                        placeholder="Nombre de meta"
                      />
                      <input
                        type="number"
                        min="0"
                        className="input-style"
                        value={editGoalAmount}
                        onChange={e => setEditGoalAmount(e.target.value)}
                        placeholder="Monto"
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button type="button" className="primary-action" onClick={() => handleEditGoalSave(goal.id)} style={{ padding: '0.5rem 0.8rem' }}>
                          <Check size={14} /> Guardar
                        </button>
                        <button type="button" className="danger-action" onClick={() => setEditingGoalId(null)} style={{ padding: '0.5rem 0.8rem' }}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <strong>{goal.name}</strong>
                        <p>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(goal.amount)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="ghost-icon-button"
                          style={{ color: 'var(--accent-primary)', padding: '0.4rem', border: '1px solid rgba(88, 166, 255, 0.2)', borderRadius: '8px' }}
                          onClick={() => handleEditGoalInit(goal)}
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="danger-action"
                          style={{ padding: '0.4rem 0.6rem' }}
                          onClick={() => handleDeleteGoal(goal.id)}
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
    </section>
  );
};

export default SettingsPanel;
