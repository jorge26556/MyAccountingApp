import React, { useState } from 'react';
import { FolderCog, Plus, Trash2 } from 'lucide-react';
import type { Category } from '../types';

interface SettingsPanelProps {
  categories: Category[];
  loading: boolean;
  onAddCategory: (name: string) => Promise<void>;
  onDeleteCategory: (name: string) => Promise<void>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  categories,
  loading,
  onAddCategory,
  onDeleteCategory,
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
        <div className="card settings-card">
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
    </section>
  );
};

export default SettingsPanel;
