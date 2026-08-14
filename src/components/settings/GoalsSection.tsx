import React, { useState } from 'react';
import { Check, Edit2, Plus, Trash2, X } from 'lucide-react';
import type { SavingsGoal } from '../../types';
import { formatCurrency } from '../../lib/format';
import { errorMessage, useToast } from '../../lib/toast';

interface GoalsSectionProps {
  goals: SavingsGoal[];
  onAdd: (name: string, amount: number) => Promise<void>;
  onUpdate: (id: string, name: string, amount: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const GoalsSection: React.FC<GoalsSectionProps> = ({ goals, onAdd, onUpdate, onDelete }) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await onAdd(name, Number(amount));
      toast.success(`Meta "${name.trim()}" creada`);
      setName('');
      setAmount('');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo crear la meta'));
    }
  };

  const handleSave = async (id: string) => {
    try {
      await onUpdate(id, editName, Number(editAmount));
      toast.success('Meta actualizada');
      setEditingId(null);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo actualizar la meta'));
    }
  };

  const handleDelete = async (goal: SavingsGoal) => {
    try {
      await onDelete(goal.id);
      toast.success(`Meta "${goal.name}" eliminada`);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar la meta'));
    }
  };

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Nueva meta</h3>
          <p>El dashboard compara tu balance del periodo contra cada meta.</p>
        </header>

        <form onSubmit={handleAdd} className="settings-field">
          <label className="settings-field__label" htmlFor="goal-name">Nombre</label>
          <input
            id="goal-name"
            type="text"
            className="input-style"
            placeholder="Ej: Ahorro vacaciones"
            value={name}
            onChange={event => setName(event.target.value)}
          />

          <label className="settings-field__label" htmlFor="goal-amount" style={{ marginTop: '0.75rem' }}>
            Monto objetivo (COP)
          </label>
          <div className="settings-inline">
            <input
              id="goal-amount"
              type="number"
              min="1"
              className="input-style"
              placeholder="Ej: 500000"
              value={amount}
              onChange={event => setAmount(event.target.value)}
            />
            <button type="submit" className="primary-action" disabled={!name.trim() || Number(amount) <= 0}>
              <Plus size={16} /> Agregar
            </button>
          </div>
        </form>
      </section>

      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Tus metas</h3>
          <p>{goals.length === 0 ? 'No tienes metas activas.' : `${goals.length} activas.`}</p>
        </header>

        <div className="settings-rows">
          {goals.map(goal => (
            <div key={goal.id} className="settings-row">
              {editingId === goal.id ? (
                <div className="settings-field" style={{ width: '100%' }}>
                  <input
                    type="text"
                    className="input-style"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Nombre"
                  />
                  <input
                    type="number"
                    min="1"
                    className="input-style"
                    style={{ marginTop: '0.5rem' }}
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    placeholder="Monto"
                  />
                  <div className="settings-inline" style={{ marginTop: '0.5rem' }}>
                    <button type="button" className="primary-action" onClick={() => handleSave(goal.id)}>
                      <Check size={14} /> Guardar
                    </button>
                    <button type="button" className="settings-link" onClick={() => setEditingId(null)}>
                      <X size={14} /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{goal.name}</strong>
                    <p>{formatCurrency(goal.amount)}</p>
                  </div>
                  <div className="settings-row__actions">
                    <button
                      type="button"
                      className="ghost-icon-button settings-row__icon"
                      onClick={() => {
                        setEditingId(goal.id);
                        setEditName(goal.name);
                        setEditAmount(String(goal.amount));
                      }}
                      aria-label={`Editar ${goal.name}`}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button type="button" className="danger-action" onClick={() => handleDelete(goal)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GoalsSection;
