import React, { useState } from 'react';
import { Calendar, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
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

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isRegister) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

        if (authError) throw authError;

        if (authData.user) {
          const { error: profileError } = await supabase.rpc('create_user_profile', {
            p_id: authData.user.id,
            p_id_user: formData.idUser,
            p_birthday: formData.birthday,
            p_email: formData.email,
          });

          if (profileError) {
            throw new Error(`Error al crear perfil: ${profileError.message}`);
          }

          setMessage({
            type: 'success',
            text: 'Registro exitoso. Revisa tu correo si Supabase te pide confirmar el email antes de iniciar sesion.',
          });
          setIsRegister(false);
          setFormData(prev => ({ ...prev, password: '' }));
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) throw error;
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Ocurrio un error inesperado' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ ...sphereStyle, top: '-10%', left: '20%', background: 'linear-gradient(135deg, #ff0080, #ff8c00)', width: '300px', height: '300px' }} />
      <div style={{ ...sphereStyle, bottom: '5%', right: '10%', background: 'rgba(255, 255, 255, 0.05)', width: '200px', height: '200px' }} />

      <div style={cardStyle}>
        <div style={{ marginBottom: '2rem' }}>
          <p style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Finanzas personales
          </p>
          <h2 style={{ fontSize: '2.5rem', fontWeight: '800', marginTop: '0.35rem', letterSpacing: '-0.05em' }}>
            {isRegister ? 'Crea tu cuenta' : 'Inicia sesion'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.6rem' }}>
            {isRegister
              ? 'Cada usuario tendra sus propias transacciones, categorias y configuracion.'
              : 'Accede con tu correo y tu contrasena para ver solo tu informacion.'}
          </p>
        </div>

        {message && (
          <div
            style={{
              padding: '1rem',
              borderRadius: '12px',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              backgroundColor: message.type === 'error' ? 'rgba(248, 81, 73, 0.1)' : 'rgba(63, 185, 80, 0.1)',
              color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={inputContainerStyle}>
            <Mail size={16} style={iconStyle} />
            <input
              name="email"
              type="email"
              placeholder="Correo electronico"
              value={formData.email}
              onChange={handleChange}
              required
              style={inputStyle}
            />
          </div>

          {isRegister && (
            <div style={inputContainerStyle}>
              <User size={16} style={iconStyle} />
              <input
                name="idUser"
                type="text"
                placeholder="Nombre de usuario o alias"
                value={formData.idUser}
                onChange={handleChange}
                required
                style={inputStyle}
              />
            </div>
          )}

          {isRegister && (
            <div style={inputContainerStyle}>
              <Calendar size={16} style={iconStyle} />
              <input
                name="birthday"
                type="date"
                value={formData.birthday}
                onChange={handleChange}
                required
                style={inputStyle}
              />
            </div>
          )}

          <div style={inputContainerStyle}>
            <Lock size={16} style={iconStyle} />
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Contrasena"
              value={formData.password}
              onChange={handleChange}
              required
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ ...iconStyle, left: 'auto', right: '16px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button type="submit" disabled={loading} style={mainBtnStyle}>
            {loading ? 'Procesando...' : isRegister ? 'Crear cuenta' : 'Entrar'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.95rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {isRegister ? 'Ya tienes cuenta?' : 'Aun no tienes cuenta?'}
          </span>
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setMessage(null);
            }}
            style={textBtnStyle}
          >
            {isRegister ? 'Iniciar sesion' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  width: '100vw',
  backgroundColor: '#0a0c10',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  overflow: 'hidden',
  color: 'white',
  fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
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
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
};

const inputContainerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
};

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
  color: 'white',
  fontSize: '1rem',
  outline: 'none',
};

const mainBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '1rem',
  marginTop: '0.5rem',
  background: 'linear-gradient(90deg, #ff0080, #ff8c00)',
  border: 'none',
  borderRadius: '12px',
  color: 'white',
  fontSize: '1rem',
  fontWeight: '700',
  cursor: 'pointer',
  boxShadow: '0 10px 20px -5px rgba(255, 0, 128, 0.3)',
};

const textBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'white',
  fontWeight: '700',
  marginLeft: '8px',
  cursor: 'pointer',
  fontSize: '0.95rem',
};

export default Auth;
