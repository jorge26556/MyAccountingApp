import React, { useState } from 'react';
import { Pause, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import type { RecurringTransaction } from '../../services/extras';
import { MENSAJE_MIGRACION_PENDIENTE } from '../../services/extras';
import { formatCurrency } from '../../lib/format';
import { errorMessage, useToast } from '../../lib/toast';
import type { TransactionType } from '../../types';

const CANALES = ['Directo', 'Transferencia', 'Tarjeta', 'Efectivo', 'Nequi', 'Daviplata', 'Otro'];

interface RecurringSectionProps {
  disponible: boolean;
  recurrentes: RecurringTransaction[];
  categorias: string[];
  onCreate: (input: Omit<RecurringTransaction, 'id' | 'ultima_generacion' | 'activo'>) => Promise<void>;
  onToggle: (id: string, activo: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * Arriendo, servicios, suscripciones, salario. Son el grueso de los movimientos
 * de cualquier mes y se estaban tecleando a mano uno por uno.
 *
 * Se materializan solos al abrir la app cuando llega el dia configurado.
 */
const RecurringSection: React.FC<RecurringSectionProps> = ({
  disponible,
  recurrentes,
  categorias,
  onCreate,
  onToggle,
  onDelete,
}) => {
  const toast = useToast();
  const [form, setForm] = useState({
    tipo: 'Gasto' as TransactionType,
    categoria: '',
    importe: '',
    canal: 'Directo',
    descripcion: '',
    dia_del_mes: '1',
  });
  const [guardando, setGuardando] = useState(false);

  if (!disponible) {
    return (
      <div className="settings-sections">
        <section className="settings-block settings-block--warning">
          <header className="settings-block__head">
            <h3>Recurrentes no disponibles</h3>
            <p>{MENSAJE_MIGRACION_PENDIENTE}</p>
          </header>
        </section>
      </div>
    );
  }

  const set = (key: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const puedeGuardar = form.categoria && Number(form.importe) > 0 && !guardando;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!puedeGuardar) return;

    setGuardando(true);
    try {
      await onCreate({
        tipo: form.tipo,
        categoria: form.categoria,
        importe: Number(form.importe),
        canal: form.canal,
        descripcion: form.descripcion,
        dia_del_mes: Number(form.dia_del_mes),
      });
      toast.success('Movimiento recurrente creado');
      setForm(prev => ({ ...prev, importe: '', descripcion: '' }));
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo crear el recurrente'));
    } finally {
      setGuardando(false);
    }
  };

  const handleToggle = async (item: RecurringTransaction) => {
    try {
      await onToggle(item.id, !item.activo);
      toast.success(item.activo ? 'Recurrente pausado' : 'Recurrente reactivado');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo actualizar'));
    }
  };

  const handleDelete = async (item: RecurringTransaction) => {
    try {
      await onDelete(item.id);
      toast.success('Recurrente eliminado');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar'));
    }
  };

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Nuevo recurrente</h3>
          <p>
            Se registra solo cada mes, el día que elijas. Si el día no existe en ese mes (31 en
            febrero), se usa el último día.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="settings-field">
          <div className="settings-grid-2">
            <div>
              <label className="settings-field__label" htmlFor="rec-tipo">Tipo</label>
              <select id="rec-tipo" className="input-style" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                <option value="Gasto">Gasto</option>
                <option value="Ingreso">Ingreso</option>
              </select>
            </div>
            <div>
              <label className="settings-field__label" htmlFor="rec-dia">Día del mes</label>
              <input
                id="rec-dia"
                type="number"
                min="1"
                max="31"
                className="input-style"
                value={form.dia_del_mes}
                onChange={e => set('dia_del_mes', e.target.value)}
              />
            </div>
            <div>
              <label className="settings-field__label" htmlFor="rec-categoria">Categoría</label>
              <select id="rec-categoria" className="input-style" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                <option value="">Elige una</option>
                {categorias.map(nombre => (
                  <option key={nombre} value={nombre}>{nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="settings-field__label" htmlFor="rec-canal">Canal</label>
              <select id="rec-canal" className="input-style" value={form.canal} onChange={e => set('canal', e.target.value)}>
                {CANALES.map(canal => (
                  <option key={canal} value={canal}>{canal}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="settings-field__label" htmlFor="rec-importe" style={{ marginTop: '0.75rem' }}>
            Importe (COP)
          </label>
          <input
            id="rec-importe"
            type="number"
            min="1"
            className="input-style"
            placeholder="Ej: 1200000"
            value={form.importe}
            onChange={e => set('importe', e.target.value)}
          />

          <label className="settings-field__label" htmlFor="rec-desc" style={{ marginTop: '0.75rem' }}>
            Descripción
          </label>
          <div className="settings-inline">
            <input
              id="rec-desc"
              type="text"
              className="input-style"
              placeholder="Ej: Arriendo apartamento"
              value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
            />
            <button type="submit" className="primary-action" disabled={!puedeGuardar}>
              <Plus size={16} />
              {guardando ? 'Guardando...' : 'Agregar'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-block">
        <header className="settings-block__head">
          <h3>
            <Repeat size={16} /> Tus recurrentes
          </h3>
          <p>
            {recurrentes.length === 0
              ? 'Todavía no has creado ninguno.'
              : `${recurrentes.filter(r => r.activo).length} activos de ${recurrentes.length}.`}
          </p>
        </header>

        <div className="settings-rows">
          {recurrentes.map(item => (
            <div key={item.id} className={`settings-row ${item.activo ? '' : 'is-paused'}`}>
              <div>
                <strong>
                  {item.categoria}
                  {item.descripcion ? ` · ${item.descripcion}` : ''}
                </strong>
                <p>
                  {item.tipo === 'Gasto' ? '−' : '+'}
                  {formatCurrency(item.importe)} · día {item.dia_del_mes} · {item.canal}
                  {!item.activo && ' · pausado'}
                </p>
              </div>
              <div className="settings-row__actions">
                <button
                  type="button"
                  className="ghost-icon-button settings-row__icon"
                  onClick={() => handleToggle(item)}
                  title={item.activo ? 'Pausar' : 'Reactivar'}
                  aria-label={item.activo ? `Pausar ${item.categoria}` : `Reactivar ${item.categoria}`}
                >
                  {item.activo ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button type="button" className="danger-action" onClick={() => handleDelete(item)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default RecurringSection;
