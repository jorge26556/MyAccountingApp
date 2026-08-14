import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Budget } from '../../services/extras';
import { MENSAJE_MIGRACION_PENDIENTE } from '../../services/extras';
import { formatCurrency } from '../../lib/format';
import { errorMessage, useToast } from '../../lib/toast';

interface BudgetsSectionProps {
  disponible: boolean;
  budgets: Budget[];
  categorias: string[];
  onSave: (categoria: string, amount: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * Un tope mensual por categoria. No se guarda un presupuesto por cada mes: el
 * mismo monto aplica todos los meses hasta que se cambie, que es como funciona
 * un presupuesto personal en la practica.
 */
const BudgetsSection: React.FC<BudgetsSectionProps> = ({
  disponible,
  budgets,
  categorias,
  onSave,
  onDelete,
}) => {
  const toast = useToast();
  const [categoria, setCategoria] = useState('');
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);

  if (!disponible) {
    return (
      <div className="settings-sections">
        <section className="settings-block settings-block--warning">
          <header className="settings-block__head">
            <h3>Presupuestos no disponibles</h3>
            <p>{MENSAJE_MIGRACION_PENDIENTE}</p>
          </header>
        </section>
      </div>
    );
  }

  const sinPresupuesto = categorias.filter(
    nombre => !budgets.some(b => b.categoria.toLowerCase() === nombre.toLowerCase())
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setGuardando(true);
    try {
      await onSave(categoria, Number(monto));
      toast.success(`Presupuesto de ${categoria} guardado`);
      setCategoria('');
      setMonto('');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo guardar el presupuesto'));
    } finally {
      setGuardando(false);
    }
  };

  const handleDelete = async (budget: Budget) => {
    try {
      await onDelete(budget.id);
      toast.success(`Presupuesto de ${budget.categoria} eliminado`);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar el presupuesto'));
    }
  };

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Nuevo presupuesto</h3>
          <p>El dashboard te avisa cuando el ritmo del mes apunta a excederlo.</p>
        </header>

        <form onSubmit={handleSubmit} className="settings-field">
          <label className="settings-field__label" htmlFor="budget-categoria">
            Categoría
          </label>
          <select
            id="budget-categoria"
            className="input-style"
            value={categoria}
            onChange={event => setCategoria(event.target.value)}
          >
            <option value="">Elige una categoría</option>
            {sinPresupuesto.map(nombre => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>

          <label className="settings-field__label" htmlFor="budget-monto" style={{ marginTop: '0.75rem' }}>
            Tope mensual (COP)
          </label>
          <div className="settings-inline">
            <input
              id="budget-monto"
              type="number"
              min="1"
              className="input-style"
              placeholder="Ej: 600000"
              value={monto}
              onChange={event => setMonto(event.target.value)}
            />
            <button
              type="submit"
              className="primary-action"
              disabled={!categoria || Number(monto) <= 0 || guardando}
            >
              <Plus size={16} />
              {guardando ? 'Guardando...' : 'Agregar'}
            </button>
          </div>

          {sinPresupuesto.length === 0 && categorias.length > 0 && (
            <span className="settings-field__hint">
              Todas tus categorías ya tienen presupuesto.
            </span>
          )}
        </form>
      </section>

      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Tus presupuestos</h3>
          <p>{budgets.length === 0 ? 'Todavía no has definido ninguno.' : `${budgets.length} definidos.`}</p>
        </header>

        <div className="settings-rows">
          {budgets.map(budget => (
            <div key={budget.id} className="settings-row">
              <div>
                <strong>{budget.categoria}</strong>
                <p>{formatCurrency(budget.amount)} al mes</p>
              </div>
              <button type="button" className="danger-action" onClick={() => handleDelete(budget)}>
                <Trash2 size={15} />
                Quitar
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default BudgetsSection;
