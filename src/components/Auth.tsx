import React, { useState } from 'react';
import { ArrowLeft, Calendar, Eye, EyeOff, KeyRound, Lock, Mail, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'register' | 'forgot';

const MIN_PASSWORD_LENGTH = 8;

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    idUser: '',
    birthday: '',
  });
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setMessage(null);
    setFormData(prev => ({ ...prev, password: '' }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(formData.email.trim(), {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw error;

        // Mensaje deliberadamente neutro: confirmar si un correo existe o no
        // permitiria enumerar cuentas registradas.
        setMessage({
          type: 'success',
          text: 'Si ese correo tiene una cuenta, te enviamos un enlace para restablecer la contrasena. Revisa tambien la carpeta de spam.',
        });
        return;
      }

      if (mode === 'register') {
        if (formData.password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
        }
        if (!formData.idUser.trim()) {
          throw new Error('El nombre de usuario es obligatorio');
        }

        // El perfil lo crea el trigger `on_auth_user_created` en la base de
        // datos a partir de estos metadatos. Antes se hacia con un RPC llamado
        // desde el cliente que ademas auto-confirmaba correos: si ese RPC
        // fallaba quedaba un usuario sin perfil, y era invocable por cualquiera.
        const { error } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            data: {
              id_user: formData.idUser.trim(),
              birthday: formData.birthday || null,
            },
          },
        });

        if (error) throw error;

        setMessage({
          type: 'success',
          text: 'Cuenta creada. Ya puedes iniciar sesion.',
        });
        switchMode('login');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password,
      });
      if (error) throw error;
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Ocurrio un error inesperado',
      });
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Mode, string> = {
    login: 'Inicia sesion',
    register: 'Crea tu cuenta',
    forgot: 'Recupera tu acceso',
  };

  const subtitles: Record<Mode, string> = {
    login: 'Accede con tu correo y tu contrasena para ver solo tu informacion.',
    register: 'Cada usuario tiene sus propias transacciones, categorias y metas.',
    forgot: 'Te enviamos un enlace al correo para que definas una contrasena nueva.',
  };

  const submitLabels: Record<Mode, string> = {
    login: 'Entrar',
    register: 'Crear cuenta',
    forgot: 'Enviar enlace',
  };

  return (
    <div style={containerStyle}>
      <div
        style={{
          ...sphereStyle,
          top: '-10%',
          left: '20%',
          background: 'linear-gradient(135deg, #58a6ff, #f97316)',
          width: '300px',
          height: '300px',
        }}
      />
      <div
        style={{
          ...sphereStyle,
          bottom: '5%',
          right: '10%',
          background: 'rgba(255, 255, 255, 0.05)',
          width: '200px',
          height: '200px',
        }}
      />

      <div style={cardStyle}>
        <div style={{ marginBottom: '2rem' }}>
          <p style={eyebrowStyle}>Finanzas personales</p>
          <h2 style={titleStyle}>{titles[mode]}</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.6rem' }}>{subtitles[mode]}</p>
        </div>

        {message && (
          <div
            style={{
              padding: '1rem',
              borderRadius: '12px',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              backgroundColor:
                message.type === 'error' ? 'rgba(248, 81, 73, 0.1)' : 'rgba(63, 185, 80, 0.1)',
              color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={inputContainerStyle}>
            <Mail size={16} style={iconStyle} />
            <input
              name="email"
              type="email"
              placeholder="Correo electronico"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
              required
              style={inputStyle}
            />
          </div>

          {mode === 'register' && (
            <>
              <div style={inputContainerStyle}>
                <User size={16} style={iconStyle} />
                <input
                  name="idUser"
                  type="text"
                  placeholder="Nombre de usuario o alias"
                  autoComplete="username"
                  value={formData.idUser}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={inputContainerStyle}>
                <Calendar size={16} style={iconStyle} />
                <input
                  name="birthday"
                  type="date"
                  value={formData.birthday}
                  onChange={handleChange}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>
            </>
          )}

          {mode !== 'forgot' && (
            <div style={inputContainerStyle}>
              <Lock size={16} style={iconStyle} />
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Contrasena"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={mode === 'register' ? MIN_PASSWORD_LENGTH : undefined}
                value={formData.password}
                onChange={handleChange}
                required
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                style={{
                  ...iconStyle,
                  left: 'auto',
                  right: '16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}

          {mode === 'register' && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '-0.35rem' }}>
              Minimo {MIN_PASSWORD_LENGTH} caracteres.
            </p>
          )}

          <button type="submit" disabled={loading} style={mainBtnStyle}>
            {loading ? 'Procesando...' : submitLabels[mode]}
          </button>
        </form>

        {mode === 'login' && (
          <button onClick={() => switchMode('forgot')} style={{ ...textBtnStyle, marginTop: '1rem' }}>
            <KeyRound size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
            Olvide mi contrasena
          </button>
        )}

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.95rem' }}>
          {mode === 'forgot' ? (
            <button onClick={() => switchMode('login')} style={textBtnStyle}>
              <ArrowLeft size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
              Volver a iniciar sesion
            </button>
          ) : (
            <>
              <span style={{ color: 'var(--text-secondary)' }}>
                {mode === 'register' ? 'Ya tienes cuenta?' : 'Aun no tienes cuenta?'}
              </span>
              <button
                onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
                style={textBtnStyle}
              >
                {mode === 'register' ? 'Iniciar sesion' : 'Crear cuenta'}
              </button>
            </>
          )}
        </div>
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
  position: 'relative',
  overflow: 'hidden',
  color: 'var(--text-primary)',
  padding: '1.5rem',
};

const sphereStyle: React.CSSProperties = {
  position: 'absolute',
  borderRadius: '50%',
  filter: 'blur(80px)',
  zIndex: 0,
  opacity: 0.6,
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '460px',
  padding: '2.5rem',
  backgroundColor: 'rgba(22, 27, 34, 0.55)',
  backdropFilter: 'blur(20px)',
  borderRadius: '32px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  zIndex: 1,
  boxShadow: 'var(--shadow-md)',
};

const eyebrowStyle: React.CSSProperties = {
  color: 'var(--accent-primary)',
  fontSize: '0.85rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2.25rem',
  fontWeight: 800,
  marginTop: '0.35rem',
  letterSpacing: '-0.04em',
};

const inputContainerStyle: React.CSSProperties = { position: 'relative', width: '100%' };

const iconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '16px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'rgba(255, 255, 255, 0.35)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '1rem 1rem 1rem 3rem',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
  color: 'var(--text-primary)',
  fontSize: '1rem',
  outline: 'none',
};

const mainBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '1rem',
  marginTop: '0.5rem',
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
  marginLeft: '8px',
  cursor: 'pointer',
  fontSize: '0.95rem',
};

export default Auth;
