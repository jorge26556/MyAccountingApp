import React, { useMemo, useState } from 'react';
import { X, Save, PlusCircle, MinusCircle } from 'lucide-react';
import type { Transaction, TransactionType, PaymentStatus } from '../types';

interface TransactionModalProps {
  categories: string[];
  onClose: () => void;
  onSave: (transaction: Omit<Transaction, 'id' | 'user_id'>) => Promise<void>;
  editingTransaction?: Transaction;
}

const CANALES = ['Directo', 'Transferencia', 'Tarjeta', 'Efectivo', 'Nequi', 'Daviplata', 'Otro'];

const TOKEN = {
  bgOverlay: 'rgba(0, 0, 0, 0.75)',
  bgCard: '#161b22',
  bgInput: '#0d1117',
  border: '#30363d',
  textPrimary: '#f0f6fc',
  textSecondary: '#8b949e',
  success: '#3fb950',
  danger: '#f85149',
  radius: '10px',
  radiusSm: '8px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  backgroundColor: TOKEN.bgInput,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: TOKEN.radiusSm,
  color: TOKEN.textPrimary,
  fontSize: '0.9rem',
  outline: 'none',
  transition: 'border-color 0.15s ease',
  colorScheme: 'dark',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: '600',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: TOKEN.textSecondary,
  marginBottom: '0.4rem',
};

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

const toDateString = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const TransactionModal: React.FC<TransactionModalProps> = ({ categories, onClose, onSave, editingTransaction }) => {
  const isEditMode = Boolean(editingTransaction);
  const selectableCategories = useMemo(() => {
    const currentCategory = editingTransaction?.categoria?.trim();
    const merged = currentCategory && !categories.includes(currentCategory)
      ? [currentCategory, ...categories]
      : categories;

    return merged.filter(Boolean);
  }, [categories, editingTransaction?.categoria]);

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fecha: editingTransaction ? toDateString(editingTransaction.fecha) : new Date().toISOString().split('T')[0],
    tipo: (editingTransaction?.tipo ?? 'Gasto') as TransactionType,
    categoria: editingTransaction?.categoria ?? selectableCategories[0] ?? '',
    importe: editingTransaction ? String(Math.abs(editingTransaction.importe)) : '',
    estado_pago: (editingTransaction?.estado_pago ?? 'Pagado') as PaymentStatus,
    descripcion: editingTransaction?.descripcion ?? '',
    canal: editingTransaction?.canal ?? 'Directo',
  });

  const set = (key: string, value: string) => setFormData(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const [year, month, day] = formData.fecha.split('-').map(Number);
      await onSave({
        ...formData,
        fecha: new Date(year, month - 1, day),
        importe: Number(formData.importe),
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error al guardar la transaccion');
    } finally {
      setLoading(false);
    }
  };

  const isIngreso = formData.tipo === 'Ingreso';
  const noCategoriesAvailable = selectableCategories.length === 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: TOKEN.bgOverlay,
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: TOKEN.bgCard,
          border: `1px solid ${TOKEN.border}`,
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: TOKEN.textPrimary, fontSize: '1.15rem', fontWeight: '700', margin: 0 }}>
              {isEditMode ? 'Editar transaccion' : 'Anadir transaccion'}
            </h3>
            {isEditMode && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: TOKEN.textSecondary }}>
                ID {editingTransaction?.id.slice(0, 8)}...
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: TOKEN.textSecondary,
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {(['Ingreso', 'Gasto'] as TransactionType[]).map(tipo => {
              const active = formData.tipo === tipo;
              const color = tipo === 'Ingreso' ? TOKEN.success : TOKEN.danger;
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => set('tipo', tipo)}
                  style={{
                    padding: '0.7rem',
                    borderRadius: TOKEN.radiusSm,
                    border: `1.5px solid ${active ? color : TOKEN.border}`,
                    backgroundColor: active ? `${color}18` : 'transparent',
                    color: active ? color : TOKEN.textSecondary,
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.45rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tipo === 'Ingreso' ? <PlusCircle size={16} /> : <MinusCircle size={16} />}
                  {tipo}
                </button>
              );
            })}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Fecha</label>
            <input type="date" value={formData.fecha} onChange={e => set('fecha', e.target.value)} required style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Categoria</label>
              <select
                value={formData.categoria}
                onChange={e => set('categoria', e.target.value)}
                required
                disabled={noCategoriesAvailable}
                style={{ ...inputStyle, opacity: noCategoriesAvailable ? 0.65 : 1 }}
              >
                {noCategoriesAvailable ? (
                  <option value="">Sin categorias disponibles</option>
                ) : (
                  selectableCategories.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Estado</label>
              <select value={formData.estado_pago} onChange={e => set('estado_pago', e.target.value)} style={inputStyle}>
                <option value="Pagado">Pagado</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Importe (COP)</label>
            <input type="number" placeholder="0" min="0" value={formData.importe} onChange={e => set('importe', e.target.value)} required style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Canal</label>
              <select value={formData.canal} onChange={e => set('canal', e.target.value)} style={inputStyle}>
                {CANALES.map(channel => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Descripcion</label>
              <input type="text" placeholder="Notas adicionales..." value={formData.descripcion} onChange={e => set('descripcion', e.target.value)} style={inputStyle} />
            </div>
          </div>

          {noCategoriesAvailable && (
            <p style={{ color: TOKEN.danger, fontSize: '0.85rem', marginTop: '-0.25rem' }}>
              Agrega al menos una categoria en configuracion para poder guardar transacciones.
            </p>
          )}

          <div style={{ height: '1px', backgroundColor: TOKEN.border }} />

          <button
            type="submit"
            disabled={loading || noCategoriesAvailable}
            style={{
              padding: '0.9rem',
              borderRadius: TOKEN.radiusSm,
              border: 'none',
              background: isIngreso
                ? 'linear-gradient(90deg, #3fb950, #388bfd)'
                : 'linear-gradient(90deg, #f85149, #bc8cff)',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: '700',
              cursor: loading || noCategoriesAvailable ? 'not-allowed' : 'pointer',
              opacity: loading || noCategoriesAvailable ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'opacity 0.15s',
              boxShadow: isIngreso
                ? '0 6px 20px rgba(63,185,80,0.25)'
                : '0 6px 20px rgba(248,81,73,0.25)',
            }}
          >
            <Save size={17} />
            {loading ? 'Guardando...' : isEditMode ? 'Guardar cambios' : 'Guardar transaccion'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TransactionModal;
