import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, MinusCircle, PlusCircle, Save, X } from 'lucide-react';
import type { Account, PaymentStatus, Transaction, TransactionType } from '../types';
import { toDateString, today } from '../lib/dates';
import { cuentasActivas } from '../lib/accounts';
import { formatCurrency } from '../lib/format';
import { errorMessage, useToast } from '../lib/toast';

export interface TransferInput {
  origen: string;
  destino: string;
  importe: number;
  fecha: Date;
  descripcion: string;
}

interface TransactionModalProps {
  categories: string[];
  accounts: Account[];
  onClose: () => void;
  onSave: (transaction: Omit<Transaction, 'id' | 'user_id'>) => Promise<void>;
  onTransfer: (input: TransferInput) => Promise<void>;
  editingTransaction?: Transaction;
  /** Movimiento del cual copiar los datos al crear uno nuevo ("repetir"). */
  prefill?: Transaction;
}

type Modo = TransactionType | 'Transferencia';

const TransactionModal: React.FC<TransactionModalProps> = ({
  categories,
  accounts,
  onClose,
  onSave,
  onTransfer,
  editingTransaction,
  prefill,
}) => {
  const toast = useToast();
  const isEditMode = Boolean(editingTransaction);
  const dialogRef = useRef<HTMLDivElement>(null);
  const importeRef = useRef<HTMLInputElement>(null);

  // Al editar se parte del movimiento real; al repetir, de una copia con la
  // fecha de hoy (repetir el arriendo del mes pasado significa registrarlo hoy,
  // no volver a registrarlo con la fecha vieja).
  const base = editingTransaction ?? prefill;

  const disponibles = useMemo(() => cuentasActivas(accounts), [accounts]);

  const selectableCategories = useMemo(() => {
    const current = base?.categoria?.trim();
    const merged = current && !categories.includes(current) ? [current, ...categories] : categories;
    return merged.filter(Boolean);
  }, [categories, base?.categoria]);

  const [loading, setLoading] = useState(false);
  const [guardadas, setGuardadas] = useState(0);
  const [modo, setModo] = useState<Modo>((base?.tipo ?? 'Gasto') as Modo);
  const [formData, setFormData] = useState({
    fecha: toDateString(editingTransaction?.fecha ?? today()),
    categoria: base?.categoria ?? selectableCategories[0] ?? '',
    importe: base ? String(Math.abs(base.importe)) : '',
    estado_pago: (base?.estado_pago ?? 'Pagado') as PaymentStatus,
    descripcion: base?.descripcion ?? '',
    account_id: base?.account_id ?? disponibles[0]?.id ?? '',
    destino: disponibles[1]?.id ?? '',
  });

  const set = (key: keyof typeof formData, value: string) =>
    setFormData(prev => ({ ...prev, [key]: value }));

  // Cerrar con Escape es lo que espera cualquiera frente a un modal.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, loading]);

  const esTransferencia = modo === 'Transferencia';
  const importeNumerico = Number(formData.importe);
  const importeValido = Number.isFinite(importeNumerico) && importeNumerico > 0;
  const sinCategorias = selectableCategories.length === 0;
  const sinCuentas = disponibles.length === 0;
  const cuentasDistintas = formData.account_id !== formData.destino;

  const puedeGuardar =
    importeValido &&
    !loading &&
    !sinCuentas &&
    (esTransferencia
      ? disponibles.length >= 2 && Boolean(formData.destino) && cuentasDistintas
      : !sinCategorias);

  const guardar = async () => {
    const [year, month, day] = formData.fecha.split('-').map(Number);
    const fecha = new Date(year, month - 1, day);

    if (esTransferencia) {
      await onTransfer({
        origen: formData.account_id,
        destino: formData.destino,
        importe: Math.abs(importeNumerico),
        fecha,
        descripcion: formData.descripcion.trim(),
      });
      return;
    }

    await onSave({
      fecha,
      tipo: modo,
      categoria: formData.categoria,
      importe: Math.abs(importeNumerico),
      estado_pago: formData.estado_pago,
      descripcion: formData.descripcion.trim(),
      account_id: formData.account_id || null,
      transfer_group: null,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!puedeGuardar) return;

    setLoading(true);
    try {
      await guardar();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo guardar el movimiento'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Registrar varios gastos de una misma salida (mercado, gasolina, café)
   * obligaba a reabrir el modal y volver a elegir fecha y cuenta cada vez.
   * Esto conserva fecha, tipo, cuenta y estado —lo que casi siempre se repite—
   * y limpia importe, categoría y descripción.
   */
  const handleSaveAndNew = async () => {
    if (!puedeGuardar) return;

    setLoading(true);
    try {
      await guardar();
      setGuardadas(total => total + 1);
      setFormData(prev => ({ ...prev, importe: '', descripcion: '' }));
      importeRef.current?.focus();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo guardar el movimiento'));
    } finally {
      setLoading(false);
    }
  };

  const titulo = isEditMode
    ? 'Editar movimiento'
    : esTransferencia
      ? 'Nueva transferencia'
      : prefill
        ? 'Repetir movimiento'
        : 'Nuevo movimiento';

  const modos: Array<{ id: Modo; label: string; color: string; icon: React.ElementType }> = [
    { id: 'Ingreso', label: 'Ingreso', color: 'var(--success)', icon: PlusCircle },
    { id: 'Gasto', label: 'Gasto', color: 'var(--danger)', icon: MinusCircle },
    { id: 'Transferencia', label: 'Entre cuentas', color: 'var(--accent-primary)', icon: ArrowLeftRight },
  ];

  return (
    <div
      style={overlayStyle}
      onMouseDown={event => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={titulo} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
              {titulo}
            </h3>
            {guardadas > 0 && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--success)' }}>
                {guardadas} {guardadas === 1 ? 'movimiento guardado' : 'movimientos guardados'} en esta sesión
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={closeBtnStyle}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Las transferencias no se editan desde aqui: son dos filas
              enlazadas y cambiar una sola descuadraria un saldo. */}
          {!isEditMode && (
            <div className="modal-modes">
              {modos.map(({ id, label, color, icon: Icon }) => {
                const active = modo === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setModo(id)}
                    className="modal-mode"
                    style={{
                      borderColor: active ? color : 'var(--border-color)',
                      backgroundColor: active ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
                      color: active ? color : 'var(--text-secondary)',
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="tx-fecha">Fecha</label>
            <input
              id="tx-fecha"
              type="date"
              value={formData.fecha}
              onChange={event => set('fecha', event.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {esTransferencia ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="tx-origen">Desde</label>
                <select
                  id="tx-origen"
                  value={formData.account_id}
                  onChange={event => set('account_id', event.target.value)}
                  style={inputStyle}
                >
                  {disponibles.map(cuenta => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="tx-destino">Hacia</label>
                <select
                  id="tx-destino"
                  value={formData.destino}
                  onChange={event => set('destino', event.target.value)}
                  style={inputStyle}
                >
                  {disponibles.map(cuenta => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="tx-categoria">Categoría</label>
                  <select
                    id="tx-categoria"
                    value={formData.categoria}
                    onChange={event => set('categoria', event.target.value)}
                    required
                    disabled={sinCategorias}
                    style={{ ...inputStyle, opacity: sinCategorias ? 0.65 : 1 }}
                  >
                    {sinCategorias ? (
                      <option value="">Sin categorías disponibles</option>
                    ) : (
                      selectableCategories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))
                    )}
                  </select>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="tx-estado">Estado</label>
                  <select
                    id="tx-estado"
                    value={formData.estado_pago}
                    onChange={event => set('estado_pago', event.target.value)}
                    style={inputStyle}
                  >
                    <option value="Pagado">Pagado</option>
                    <option value="Pendiente">Pendiente</option>
                  </select>
                </div>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="tx-cuenta">Cuenta</label>
                <select
                  id="tx-cuenta"
                  value={formData.account_id}
                  onChange={event => set('account_id', event.target.value)}
                  disabled={sinCuentas}
                  style={{ ...inputStyle, opacity: sinCuentas ? 0.65 : 1 }}
                >
                  {sinCuentas ? (
                    <option value="">Sin cuentas disponibles</option>
                  ) : (
                    disponibles.map(cuenta => (
                      <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                    ))
                  )}
                </select>
                {formData.estado_pago === 'Pendiente' && (
                  <span style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Un pendiente no mueve el saldo todavía. Aparecerá en Próximos pagos con la
                    fecha que le pongas.
                  </span>
                )}
              </div>
            </>
          )}

          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="tx-importe">Importe (COP)</label>
            <input
              ref={importeRef}
              id="tx-importe"
              type="number"
              inputMode="numeric"
              placeholder="0"
              min="1"
              step="1"
              value={formData.importe}
              onChange={event => set('importe', event.target.value)}
              required
              autoFocus
              style={inputStyle}
            />
            {/* Confirmacion visual de la cifra: evita el cero de mas al teclear. */}
            <span style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: importeValido ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {importeValido ? formatCurrency(importeNumerico) : 'Escribe un monto mayor que cero'}
            </span>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="tx-descripcion">Descripción</label>
            <input
              id="tx-descripcion"
              type="text"
              placeholder="Notas adicionales..."
              value={formData.descripcion}
              onChange={event => set('descripcion', event.target.value)}
              style={inputStyle}
            />
          </div>

          {sinCuentas && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
              Crea al menos una cuenta en Configuración → Cuentas para poder registrar movimientos.
            </p>
          )}

          {!esTransferencia && sinCategorias && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
              Agrega al menos una categoría en Configuración para poder guardar transacciones.
            </p>
          )}

          {esTransferencia && disponibles.length < 2 && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
              Para transferir necesitas al menos dos cuentas.
            </p>
          )}

          {esTransferencia && disponibles.length >= 2 && !cuentasDistintas && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
              El origen y el destino deben ser cuentas distintas.
            </p>
          )}

          <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }} />

          <button
            type="submit"
            disabled={!puedeGuardar}
            style={{
              padding: '0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: esTransferencia
                ? 'linear-gradient(90deg, #58a6ff, #bc8cff)'
                : modo === 'Ingreso'
                  ? 'linear-gradient(90deg, #3fb950, #388bfd)'
                  : 'linear-gradient(90deg, #f85149, #f97316)',
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
            {loading ? 'Guardando...' : isEditMode ? 'Guardar cambios' : 'Guardar y cerrar'}
          </button>

          {!isEditMode && !esTransferencia && (
            <button
              type="button"
              onClick={handleSaveAndNew}
              disabled={!puedeGuardar}
              className="modal-secondary-action"
            >
              <PlusCircle size={16} />
              Guardar y añadir otra
            </button>
          )}
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
  maxWidth: '480px',
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

export default TransactionModal;
