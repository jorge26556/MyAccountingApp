import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, KeyRound, User } from 'lucide-react';
import {
  changePassword,
  deleteOwnAccount,
  fetchProfile,
  updateAlias,
  type Profile,
} from '../../services/extras';
import { errorMessage, useToast } from '../../lib/toast';

/**
 * Seccion que no existia: no habia forma de cambiar la contrasena estando
 * dentro de la app, ni de darse de baja.
 */
const AccountSection: React.FC<{ email: string }> = ({ email }) => {
  const toast = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [alias, setAlias] = useState('');
  const [guardandoAlias, setGuardandoAlias] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [cambiando, setCambiando] = useState(false);

  const [textoBaja, setTextoBaja] = useState('');
  const [mostrarBaja, setMostrarBaja] = useState(false);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    fetchProfile().then(data => {
      setProfile(data);
      setAlias(data?.id_user ?? '');
    });
  }, []);

  const handleAlias = async (event: React.FormEvent) => {
    event.preventDefault();
    setGuardandoAlias(true);
    try {
      await updateAlias(alias);
      setProfile(prev => (prev ? { ...prev, id_user: alias.trim() } : prev));
      toast.success('Nombre de usuario actualizado');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo actualizar el nombre'));
    } finally {
      setGuardandoAlias(false);
    }
  };

  const handlePassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password !== confirmacion) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    setCambiando(true);
    try {
      await changePassword(password);
      setPassword('');
      setConfirmacion('');
      toast.success('Contraseña actualizada');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo cambiar la contraseña'));
    } finally {
      setCambiando(false);
    }
  };

  const handleBaja = async () => {
    setBorrando(true);
    try {
      await deleteOwnAccount();
      // deleteOwnAccount cierra la sesion; App reacciona y vuelve al login.
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar la cuenta'));
      setBorrando(false);
    }
  };

  const aliasCambio = alias.trim() !== (profile?.id_user ?? '') && alias.trim().length > 0;

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Perfil</h3>
          <p>Tu identidad dentro de la aplicación.</p>
        </header>

        <div className="settings-field">
          <span className="settings-field__label">Correo</span>
          <span className="settings-field__value">{email}</span>
          <span className="settings-field__hint">
            El correo es tu identificador de acceso y no se puede cambiar desde aquí.
          </span>
        </div>

        <form onSubmit={handleAlias} className="settings-field">
          <label className="settings-field__label" htmlFor="account-alias">
            Nombre de usuario
          </label>
          <div className="settings-inline">
            <input
              id="account-alias"
              type="text"
              className="input-style"
              value={alias}
              onChange={event => setAlias(event.target.value)}
              placeholder="Tu alias"
            />
            <button type="submit" className="primary-action" disabled={!aliasCambio || guardandoAlias}>
              <Check size={16} />
              {guardandoAlias ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-block">
        <header className="settings-block__head">
          <h3>
            <KeyRound size={16} /> Contraseña
          </h3>
          <p>Cámbiala cuando quieras. Mínimo 8 caracteres.</p>
        </header>

        <form onSubmit={handlePassword} className="settings-field">
          <label className="settings-field__label" htmlFor="account-password">
            Nueva contraseña
          </label>
          <input
            id="account-password"
            type="password"
            className="input-style"
            autoComplete="new-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            minLength={8}
          />

          <label className="settings-field__label" htmlFor="account-password-2" style={{ marginTop: '0.75rem' }}>
            Confírmala
          </label>
          <div className="settings-inline">
            <input
              id="account-password-2"
              type="password"
              className="input-style"
              autoComplete="new-password"
              value={confirmacion}
              onChange={event => setConfirmacion(event.target.value)}
              minLength={8}
            />
            <button
              type="submit"
              className="primary-action"
              disabled={cambiando || password.length < 8 || !confirmacion}
            >
              {cambiando ? 'Guardando...' : 'Cambiar'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-block settings-block--danger">
        <header className="settings-block__head">
          <h3>
            <AlertTriangle size={16} /> Eliminar cuenta
          </h3>
          <p>
            Borra tu usuario y <strong>todos</strong> tus movimientos, categorías, metas,
            presupuestos y recurrentes. No se puede deshacer.
          </p>
        </header>

        {!mostrarBaja ? (
          <button type="button" className="danger-action" onClick={() => setMostrarBaja(true)}>
            <User size={15} />
            Quiero eliminar mi cuenta
          </button>
        ) : (
          <div className="settings-field">
            <p className="settings-field__hint">
              Antes de borrar, considera exportar un respaldo desde la sección Datos.
            </p>
            <label className="settings-field__label" htmlFor="account-delete-confirm">
              Escribe <code>ELIMINAR</code> para confirmar
            </label>
            <div className="settings-inline">
              <input
                id="account-delete-confirm"
                type="text"
                className="input-style"
                value={textoBaja}
                onChange={event => setTextoBaja(event.target.value)}
                placeholder="ELIMINAR"
                autoComplete="off"
              />
              <button
                type="button"
                className="danger-action"
                disabled={textoBaja !== 'ELIMINAR' || borrando}
                onClick={handleBaja}
              >
                {borrando ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
            <button
              type="button"
              className="settings-link"
              onClick={() => {
                setMostrarBaja(false);
                setTextoBaja('');
              }}
            >
              Cancelar
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default AccountSection;
