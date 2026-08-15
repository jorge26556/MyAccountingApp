import React, { useEffect, useState } from 'react';
import { HandCoins, Save, X } from 'lucide-react';
import type { Account, TipoDeuda } from '../types';
import type { EstadoDeuda } from '../lib/deudas';
import { cuentasActivas } from '../lib/accounts';
import { toDateString, today } from '../lib/dates';
import { formatCurrency } from '../lib/format';
import { errorMessage, useToast } from '../lib/toast';

export interface NuevaDeudaInput {
  persona: string;
  tipo: TipoDeuda;
  descripcion: string;
  importe: number;
  fecha: Date;
  account_id: string | null;
}

export interface AbonoInput {
  estado: EstadoDeuda;
  importe: number;
  fecha: Date;
  account_id: string | null;
}

interface DeudaModalProps {
  accounts: Account[];
  /** Si viene, el modal registra un abono a esa deuda en vez de crear una. */
  abonarA?: EstadoDeuda;
  onClose: () => void;
  onCrear: (input: NuevaDeudaInput) => Promise<void>;
  onAbonar: (input: AbonoInput) => Promise<void>;
}

/**
 * Registrar una deuda o un abono.
 *
 * Va aparte del formulario de movimientos a proposito. Ese se acaba de
 * rediseñar para que el caso de todos los dias —anotar un gasto— sean dos
 * toques; meterle un quinto modo que se usa una vez al mes desharia justo eso.
 * Las deudas se gestionan desde su propio panel, que es donde uno las mira.
 */
const DeudaModal: React.FC<DeudaModalProps> = ({
  accounts,
  abonarA,
  onClose,
  onCrear,
  onAbonar,
}) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const disponibles = cuentasActivas(accounts);
  const esAbono = Boolean(abonarA);
  const meDeben = abonarA ? abonarA.deuda.tipo === 'me_deben' : true;

  const [form, setForm] = useState({
    persona: '',
    tipo: 'me_deben' as TipoDeuda,
    descripcion: '',
    // En un abono se propone lo que falta, que es el caso mas comun: se paga
    // completo. Igual es editable para los abonos parciales.
    importe: abonarA ? String(Math.max(0, abonarA.pendiente)) : '',
    fecha: toDateString(today()),
    account_id: disponibles[0]?.id ?? '',
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, loading]);

  const importeNumerico = Number(form.importe);
  const importeValido = Number.isFinite(importeNumerico) && importeNumerico > 0;
  const puedeGuardar = importeValido && !loading && (esAbono || Boolean(form.persona.trim()));

  const excedeLoPendiente = Boolean(
    abonarA && importeValido && importeNumerico > abonarA.pendiente
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!puedeGuardar) return;

    const [year, month, day] = form.fecha.split('-').map(Number);
    const fecha = new Date(year, month - 1, day);

    setLoading(true);
    try {
      if (abonarA) {
        await onAbonar({
          estado: abonarA,
          importe: Math.abs(importeNumerico),
          fecha,
          account_id: form.account_id || null,
        });
      } else {
        await onCrear({
          persona: form.persona,
          tipo: form.tipo,
          descripcion: form.descripcion,
          importe: Math.abs(importeNumerico),
          fecha,
          account_id: form.account_id || null,
        });
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo guardar'));
    } finally {
      setLoading(false);
    }
  };

  const titulo = esAbono
    ? meDeben
      ? `Abono de ${abonarA!.deuda.persona}`
      : `Pago a ${abonarA!.deuda.persona}`
    : 'Nueva deuda';

  return (
    <div
      style={overlayStyle}
      onMouseDown={event => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={titulo} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-primary)', fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
            <HandCoins size={18} />
            {titulo}
          </h3>
          <button onClick={onClose} aria-label="Cerrar" style={closeBtnStyle}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {!esAbono && (
            <>
              <div className="modal-modes">
                {([
                  { id: 'me_deben' as TipoDeuda, label: 'Le presté', color: 'var(--success)' },
                  { id: 'debo' as TipoDeuda, label: 'Me prestaron', color: 'var(--warning)' },
                ]).map(({ id, label, color }) => {
                  const active = form.tipo === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => set('tipo', id)}
                      className="modal-mode"
                      style={{
                        borderColor: active ? color : 'var(--border-color)',
                        backgroundColor: active ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
                        color: active ? color : 'var(--text-secondary)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="deuda-persona">Persona</label>
                <input
                  id="deuda-persona"
                  type="text"
                  placeholder="Ej: Juan, mamá, Andrea..."
                  value={form.persona}
                  onChange={event => set('persona', event.target.value)}
                  required
                  autoFocus
                  style={inputStyle}
                />
              </div>
            </>
          )}

          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="deuda-importe">Monto (COP)</label>
            <input
              id="deuda-importe"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="0"
              value={form.importe}
              onChange={event => set('importe', event.target.value)}
              required
              autoFocus={esAbono}
              className="modal-importe"
            />
            <span style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: importeValido ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {importeValido ? formatCurrency(importeNumerico) : 'Escribe un monto mayor que cero'}
            </span>
          </div>

          {/* No se bloquea: un abono de mas puede ser real (intereses, un
              redondeo hacia arriba). Solo se avisa para que no sea un descuido. */}
          {excedeLoPendiente && (
            <p style={{ fontSize: '0.82rem', color: 'var(--warning)', margin: '-0.5rem 0 0' }}>
              Es más que los {formatCurrency(abonarA!.pendiente)} que faltaban. La deuda quedará
              saldada.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="deuda-fecha">Fecha</label>
              <input
                id="deuda-fecha"
                type="date"
                value={form.fecha}
                onChange={event => set('fecha', event.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="deuda-cuenta">Cuenta</label>
              <select
                id="deuda-cuenta"
                value={form.account_id}
                onChange={event => set('account_id', event.target.value)}
                style={inputStyle}
              >
                {disponibles.map(cuenta => (
                  <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {!esAbono && (
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="deuda-desc">Nota (opcional)</label>
              <input
                id="deuda-desc"
                type="text"
                placeholder="Ej: para el arreglo del carro"
                value={form.descripcion}
                onChange={event => set('descripcion', event.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            {meDeben
              ? 'Sale de la cuenta que elijas, pero no cuenta como gasto: la plata sigue siendo tuya.'
              : 'Entra a la cuenta que elijas, pero no cuenta como ingreso: es plata que tienes que devolver.'}
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
            {loading ? 'Guardando...' : esAbono ? 'Registrar' : 'Crear deuda'}
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

export default DeudaModal;
