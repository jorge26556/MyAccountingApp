import React, { useState } from 'react';
import { LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PendingApprovalProps {
  email?: string | null;
  /** Vuelve a preguntar a la base si ya lo aprobaron. */
  onRetry: () => Promise<void>;
}

/**
 * Lo que ve quien se registra hasta que un administrador le da paso.
 *
 * No es solo una cortesia visual: RLS ya le bloquea todas las tablas, asi que
 * sin esta pantalla lo que veria es la app cargando y una retahila de errores
 * de permisos que no explican nada.
 */
const PendingApproval: React.FC<PendingApprovalProps> = ({ email, onRetry }) => {
  const [comprobando, setComprobando] = useState(false);

  const comprobar = async () => {
    setComprobando(true);
    try {
      await onRetry();
    } finally {
      setComprobando(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={iconWrapStyle}>
          <ShieldCheck size={26} />
        </div>

        <h2 style={titleStyle}>Tu cuenta está pendiente de aprobación</h2>

        <p style={textStyle}>
          Ya quedó registrada{email ? <> con <strong>{email}</strong></> : null}. Para entrar
          hace falta que el administrador la autorice; es lo que impide que cualquiera con el
          enlace se cree una cuenta.
        </p>

        <p style={{ ...textStyle, marginTop: '0.75rem' }}>
          Cuando te avisen de que ya está, pulsa aquí para volver a comprobarlo.
        </p>

        <button type="button" onClick={comprobar} disabled={comprobando} style={mainBtnStyle}>
          <RefreshCw size={16} style={{ verticalAlign: '-3px', marginRight: '8px' }} />
          {comprobando ? 'Comprobando...' : 'Ya me aprobaron'}
        </button>

        <button type="button" onClick={() => supabase.auth.signOut()} style={textBtnStyle}>
          <LogOut size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-primary)',
  padding: '1.5rem',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '460px',
  padding: '2.5rem',
  backgroundColor: 'rgba(22, 27, 34, 0.55)',
  backdropFilter: 'blur(20px)',
  borderRadius: '32px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: 'var(--shadow-md)',
  textAlign: 'center',
};

const iconWrapStyle: React.CSSProperties = {
  width: '56px',
  height: '56px',
  margin: '0 auto 1.25rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '18px',
  background: 'rgba(88, 166, 255, 0.12)',
  color: 'var(--accent-primary)',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 800,
  letterSpacing: '-0.03em',
};

const textStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  marginTop: '0.9rem',
  fontSize: '0.95rem',
  lineHeight: 1.5,
};

const mainBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '1rem',
  marginTop: '1.75rem',
  background: 'var(--accent-gradient)',
  border: 'none',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 10px 20px -5px rgba(88, 166, 255, 0.3)',
};

const textBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent-primary)',
  fontWeight: 700,
  marginTop: '1.25rem',
  cursor: 'pointer',
  fontSize: '0.95rem',
};

export default PendingApproval;
