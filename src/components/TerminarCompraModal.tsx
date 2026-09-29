import React, { useEffect, useState } from 'react';
import { Save, ShoppingCart, X } from 'lucide-react';
import type { Account, ShoppingList } from '../types';
import type { ResumenLista } from '../lib/listas';
import type { EstadoPresupuesto } from '../lib/analytics';
import { cuentasActivas } from '../lib/accounts';
import { toDateString, today } from '../lib/dates';
import { formatCurrency } from '../lib/format';
import { errorMessage, useToast } from '../lib/toast';

export interface TerminarCompraInput {
  lista: ShoppingList;
  total: number;
  fecha: Date;
  account_id: string | null;
  descripcion: string;
  /** Lo que no se tacho pasa a una lista nueva con el mismo nombre. */
  pasarPendientes: boolean;
}

interface TerminarCompraModalProps {
  lista: ShoppingList;
  resumen: ResumenLista;
  accounts: Account[];
  presupuesto?: EstadoPresupuesto;
  onClose: () => void;
  onConfirmar: (input: TerminarCompraInput) => Promise<void>;
}

/**
 * El cierre de la compra: el valor del recibo se registra como UN gasto en la
 * categoria de la lista.
 *
 * Se propone la suma de lo tachado si los ítems tenian precio, pero casi nunca
 * cuadra con el recibo —cambian los precios, se agrega algo que no estaba—,
 * asi que el campo queda editable y es lo primero que se enfoca.
 */
const TerminarCompraModal: React.FC<TerminarCompraModalProps> = ({
  lista,
  resumen,
  accounts,
  presupuesto,
  onClose,
  onConfirmar,
}) => {
  const toast = useToast();
  const disponibles = cuentasActivas(accounts);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    total: resumen.estimadoComprados > 0 ? String(resumen.estimadoComprados) : '',
    fecha: toDateString(today()),
    account_id: disponibles[0]?.id ?? '',
    descripcion: lista.nombre,
    pasarPendientes: resumen.pendientes > 0,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, loading]);

  const total = Number(form.total);
  const totalValido = Number.isFinite(total) && total > 0;
  const puedeGuardar = totalValido && !loading;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!puedeGuardar) return;

    const [year, month, day] = form.fecha.split('-').map(Number);
    setLoading(true);
    try {
      await onConfirmar({
        lista,
        total: Math.abs(total),
        fecha: new Date(year, month - 1, day),
        account_id: form.account_id || null,
        descripcion: form.descripcion.trim() || lista.nombre,
        pasarPendientes: form.pasarPendientes && resumen.pendientes > 0,
      });
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo registrar la compra'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={overlayStyle}
      onMouseDown={event => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Terminar compra" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-primary)', fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
            <ShoppingCart size={18} />
            Terminar compra
          </h3>
          <button onClick={onClose} aria-label="Cerrar" style={closeBtnStyle}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="compra-total">Valor final (COP)</label>
            <input
              id="compra-total"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="Lo que dice el recibo"
              value={form.total}
              onChange={event => setForm(prev => ({ ...prev, total: event.target.value }))}
              required
              autoFocus
              className="modal-importe"
            />
            <span style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: totalValido ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {totalValido
                ? formatCurrency(total)
                : resumen.estimado > 0
                  ? `Estimado de la lista: ${formatCurrency(resumen.estimado)}`
                  : 'Escribe lo que pagaste'}
            </span>
          </div>

          {presupuesto && totalValido && (
            <p style={{ fontSize: '0.82rem', margin: '-0.5rem 0 0', color: presupuesto.gastado + total > presupuesto.presupuesto ? 'var(--warning)' : 'var(--text-secondary)' }}>
              Con esto, {lista.categoria} queda en {formatCurrency(presupuesto.gastado + total)} de{' '}
              {formatCurrency(presupuesto.presupuesto)} este mes.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="compra-fecha">Fecha</label>
              <input
                id="compra-fecha"
                type="date"
                value={form.fecha}
                onChange={event => setForm(prev => ({ ...prev, fecha: event.target.value }))}
                required
                style={inputStyle}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="compra-cuenta">Cuenta</label>
              <select
                id="compra-cuenta"
                value={form.account_id}
                onChange={event => setForm(prev => ({ ...prev, account_id: event.target.value }))}
                style={inputStyle}
              >
                {disponibles.map(cuenta => (
                  <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="compra-desc">Descripción</label>
            <input
              id="compra-desc"
              type="text"
              value={form.descripcion}
              onChange={event => setForm(prev => ({ ...prev, descripcion: event.target.value }))}
              style={inputStyle}
            />
          </div>

          {resumen.pendientes > 0 && (
            <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.86rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.pasarPendientes}
                onChange={event => setForm(prev => ({ ...prev, pasarPendientes: event.target.checked }))}
                style={{ marginTop: '0.2rem' }}
              />
              <span>
                Pasar {resumen.pendientes === 1 ? 'el ítem' : `los ${resumen.pendientes} ítems`} sin
                comprar a una lista nueva
              </span>
            </label>
          )}

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Se registra como un gasto de <strong>{lista.categoria}</strong> y aparece en Movimientos
            como cualquier otro.
          </p>

          <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }} />

          <button
            type="submit"
            disabled={!puedeGuardar}
            style={{
              padding: '0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(90deg, #58a6ff, #3fb950)',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: puedeGuardar ? 'pointer' : 'not-allowed',
              opacity: puedeGuardar ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <Save size={17} />
            {loading ? 'Guardando...' : 'Registrar gasto'}
          </button>
        </form>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
  overflowY: 'auto',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius)',
  padding: '2rem',
  boxShadow: 'var(--shadow-md)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  margin: 'auto',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  padding: '4px',
  borderRadius: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  outline: 'none',
  colorScheme: 'dark',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: '0.4rem',
};

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

export default TerminarCompraModal;
