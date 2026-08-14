import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Category } from '../../types';
import { countTransactionsByCategory } from '../../services/api';
import { errorMessage, useToast } from '../../lib/toast';

interface CategoriesSectionProps {
  categories: Category[];
  loading: boolean;
  onAdd: (name: string) => Promise<void>;
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
  onDelete,
}) => {
  const toast = useToast();
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

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

  /**
   * Borrar una categoria dejaba transacciones apuntando a un nombre que ya no
   * existia. Primero se cuenta cuantas quedarian huerfanas y se ofrece
   * reasignarlas.
   */
  const startDelete = async (name: string) => {
    try {
      const affected = await countTransactionsByCategory(name);
      const destino = categories.find(item => item.name !== name)?.name ?? '';
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
              <div>
                <strong>{category.name}</strong>
              </div>
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
