import React, { useState } from 'react';
import { Check, Edit2, Plus, Trash2, X } from 'lucide-react';
import type { Category } from '../../types';
import { countTransactionsByCategory } from '../../services/api';
import { errorMessage, useToast } from '../../lib/toast';

interface CategoriesSectionProps {
  categories: Category[];
  loading: boolean;
  onAdd: (name: string) => Promise<void>;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onDelete: (name: string, reassignTo?: string) => Promise<void>;
}

interface PendingDelete {
  name: string;
  affected: number;
  reassignTo: string;
}

const CategoriesSection: React.FC<CategoriesSectionProps> = ({
  categories,
  loading,
  onAdd,
  onRename,
  onDelete,
}) => {
  const toast = useToast();
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onAdd(newCategory);
      toast.success(`Categoría "${newCategory.trim()}" creada`);
      setNewCategory('');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo crear la categoría'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (category: Category) => {
    setPendingDelete(null);
    setEditingId(category.id);
    setEditName(category.name);
  };

  /**
   * El nombre viaja como texto en movimientos, presupuestos y recurrentes, asi
   * que renombrar los toca todos. De eso se encarga el RPC; aqui solo importa
   * no cerrar el formulario si falla —el error tipico es un nombre repetido, y
   * cerrarlo obligaria a reescribirlo entero.
   */
  const handleSaveEdit = async (anterior: string) => {
    setSaving(true);
    try {
      await onRename(anterior, editName);
      toast.success(`Categoría renombrada a "${editName.trim()}"`);
      setEditingId(null);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo renombrar la categoría'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Borrar una categoria dejaba transacciones apuntando a un nombre que ya no
   * existia. Primero se cuenta cuantas quedarian huerfanas y se ofrece
   * reasignarlas.
   */
  const startDelete = async (name: string) => {
    try {
      const affected = await countTransactionsByCategory(name);
      const destino = categories.find(item => item.name !== name)?.name ?? '';
      setEditingId(null);
      setPendingDelete({ name, affected, reassignTo: affected > 0 ? destino : '' });
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo verificar la categoría'));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;

    setSaving(true);
    try {
      const reasignar = pendingDelete.affected > 0 && pendingDelete.reassignTo;
      await onDelete(pendingDelete.name, reasignar ? pendingDelete.reassignTo : undefined);
      toast.success(
        reasignar
          ? `Categoría eliminada y ${pendingDelete.affected} movimientos movidos a "${pendingDelete.reassignTo}"`
          : 'Categoría eliminada'
      );
      setPendingDelete(null);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar la categoría'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Nueva categoría</h3>
          <p>Se reflejan de inmediato en el formulario de movimientos.</p>
        </header>

        <form onSubmit={handleAdd} className="settings-field">
          <label className="settings-field__label" htmlFor="category-name">Nombre</label>
          <div className="settings-inline">
            <input
              id="category-name"
              type="text"
              className="input-style"
              placeholder="Ej: Salud, Educación..."
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
      </section>

      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Tus categorías</h3>
          <p>{categories.length} activas.</p>
        </header>

        <div className="settings-rows">
          {categories.map(category => (
            <div key={category.id} className="settings-row">
              {editingId === category.id ? (
                <div className="settings-field" style={{ width: '100%' }}>
                  <input
                    type="text"
                    className="input-style"
                    value={editName}
                    onChange={event => setEditName(event.target.value)}
                    placeholder="Nombre"
                    aria-label="Nombre de la categoría"
                    disabled={saving}
                  />

                  <p className="settings-field__hint">
                    El nombre nuevo se aplica también a los movimientos ya registrados, al
                    presupuesto y a los recurrentes que la usen.
                  </p>

                  <div className="settings-inline" style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => handleSaveEdit(category.name)}
                      disabled={saving || !editName.trim() || editName.trim() === category.name}
                    >
                      <Check size={14} />
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      className="settings-link"
                      onClick={() => setEditingId(null)}
                      disabled={saving}
                    >
                      <X size={14} /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{category.name}</strong>
                  </div>
                  <div className="settings-row__actions">
                    <button
                      type="button"
                      className="ghost-icon-button settings-row__icon"
                      onClick={() => startEdit(category)}
                      disabled={loading || saving}
                      title="Renombrar"
                      aria-label={`Renombrar ${category.name}`}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      className="danger-action"
                      onClick={() => startDelete(category.name)}
                      disabled={loading || saving || categories.length <= 1}
                      title={categories.length <= 1 ? 'Debe quedar al menos una categoría' : 'Eliminar'}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {pendingDelete && (
        <section className="settings-block settings-block--danger">
          <header className="settings-block__head">
            <h3>Eliminar "{pendingDelete.name}"</h3>
            <p>
              {pendingDelete.affected > 0
                ? `${pendingDelete.affected} movimiento(s) usan esta categoría. Si no los reasignas, quedarán apuntando a una categoría que ya no existe.`
                : 'Ningún movimiento usa esta categoría. Se puede eliminar sin efectos.'}
            </p>
          </header>

          {pendingDelete.affected > 0 && (
            <div className="settings-field">
              <label className="settings-field__label" htmlFor="reassign-to">
                Mover esos movimientos a
              </label>
              <select
                id="reassign-to"
                className="input-style"
                value={pendingDelete.reassignTo}
                onChange={event => setPendingDelete({ ...pendingDelete, reassignTo: event.target.value })}
              >
                <option value="">No reasignar (dejarlos huérfanos)</option>
                {categories
                  .filter(item => item.name !== pendingDelete.name)
                  .map(item => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
              </select>
            </div>
          )}

          <div className="settings-inline" style={{ marginTop: '1rem' }}>
            <button type="button" className="danger-action" onClick={confirmDelete} disabled={saving}>
              <Trash2 size={15} />
              {saving ? 'Eliminando...' : 'Confirmar'}
            </button>
            <button type="button" className="settings-link" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default CategoriesSection;
