import React, { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Pantalla que aparece cuando el usuario llega desde el enlace de recuperacion.
 * Supabase entrega una sesion temporal y emite el evento PASSWORD_RECOVERY;
 * App.tsx la muestra en lugar del dashboard hasta que se defina la contrasena.
 */
const ResetPassword: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    if (password !== confirm) {
      setError('Las contrasenas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contrasena');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <KeyRound size={26} color="var(--accent-primary)" />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Define tu nueva contrasena</h2>
        </div>

        {error && (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '12px',
              marginBottom: '1.25rem',
              fontSize: '0.9rem',
              backgroundColor: 'rgba(248, 81, 73, 0.1)',
              color: 'var(--danger)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Lock size={16} style={iconStyle} />
            <input
              type="password"
              placeholder="Nueva contrasena"
              autoComplete="new-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={16} style={iconStyle} />
            <input
              type="password"
              placeholder="Confirma la contrasena"
              autoComplete="new-password"
              value={confirm}
              onChange={event => setConfirm(event.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <button type="submit" disabled={loading} className="primary-action" style={{ justifyContent: 'center', padding: '0.9rem' }}>
            {loading ? 'Guardando...' : 'Guardar contrasena'}
          </button>
        </form>
      </div>
    </div>
  );
};

const wrapperStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  padding: '2.25rem',
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius)',
  boxShadow: 'var(--shadow-md)',
};

const iconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '16px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--text-muted)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.9rem 1rem 0.9rem 3rem',
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  outline: 'none',
};

export default ResetPassword;
