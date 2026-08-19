import React, { useState } from 'react';
import { Check, RefreshCw, ShieldOff } from 'lucide-react';
import type { UsuarioAdmin } from '../../services/access';
import { errorMessage, useToast } from '../../lib/toast';

interface UsersSectionProps {
  usuarios: UsuarioAdmin[];
  miUserId: string;
  onSetAprobado: (userId: string, aprobado: boolean) => Promise<void>;
  onReload: () => Promise<void>;
}

const fechaCorta = (iso: string) => {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime())
    ? ''
    : fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Panel de aprobacion. Solo lo ve un administrador —la seccion ni siquiera se
 * lista para el resto—, pero quien manda de verdad es la RLS: sin `es_admin()`
 * estas consultas no devuelven nada aunque alguien monte el componente a mano.
 */
const UsersSection: React.FC<UsersSectionProps> = ({
  usuarios,
  miUserId,
  onSetAprobado,
  onReload,
}) => {
  const toast = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recargando, setRecargando] = useState(false);

  const pendientes = usuarios.filter(item => !item.aprobado);
  const aprobados = usuarios.filter(item => item.aprobado);

  const cambiar = async (usuario: UsuarioAdmin, aprobado: boolean) => {
    setOcupado(usuario.userId);
    try {
      await onSetAprobado(usuario.userId, aprobado);
      toast.success(aprobado ? `${usuario.alias} ya puede entrar` : `Acceso revocado a ${usuario.alias}`);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo cambiar el acceso'));
    } finally {
      setOcupado(null);
    }
  };

  const recargar = async () => {
    setRecargando(true);
    try {
      await onReload();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo actualizar la lista'));
    } finally {
      setRecargando(false);
    }
  };

  const fila = (usuario: UsuarioAdmin) => {
    const esYo = usuario.userId === miUserId;

    return (
      <div key={usuario.userId} className={`settings-row ${usuario.aprobado ? '' : 'is-paused'}`}>
        <div>
          <strong>{usuario.alias}{esYo && ' (tú)'}</strong>
          <p>
            {usuario.email ?? 'sin correo'}
            {usuario.creadoEn && ` · se registró el ${fechaCorta(usuario.creadoEn)}`}
            {usuario.esAdmin && ' · administrador'}
          </p>
        </div>

        {/* Un admin no puede quitarse el acceso a si mismo: si fuera el unico,
            nadie podria devolverselo y habria que arreglarlo por SQL. La base
            lo bloquea tambien, esto solo evita el intento. */}
        {!esYo && (
          <div className="settings-row__actions">
            {usuario.aprobado ? (
              <button
                type="button"
                className="danger-action"
                onClick={() => cambiar(usuario, false)}
                disabled={ocupado === usuario.userId}
                title="Revocar el acceso"
              >
                <ShieldOff size={15} />
                {ocupado === usuario.userId ? '...' : 'Revocar'}
              </button>
            ) : (
              <button
                type="button"
                className="primary-action"
                onClick={() => cambiar(usuario, true)}
                disabled={ocupado === usuario.userId}
              >
                <Check size={15} />
                {ocupado === usuario.userId ? 'Aprobando...' : 'Aprobar'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Pendientes de aprobación</h3>
          <p>
            {pendientes.length === 0
              ? 'Nadie esperando. Quien se registre aparecerá aquí y no podrá usar la app hasta que lo apruebes.'
              : `${pendientes.length} ${pendientes.length === 1 ? 'persona espera' : 'personas esperan'} tu visto bueno.`}
          </p>
        </header>

        {pendientes.length > 0 && <div className="settings-rows">{pendientes.map(fila)}</div>}

        <div className="settings-inline" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="secondary-action"
            onClick={recargar}
            disabled={recargando}
          >
            <RefreshCw size={15} />
            {recargando ? 'Actualizando...' : 'Actualizar lista'}
          </button>
        </div>
      </section>

      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Con acceso</h3>
          <p>{aprobados.length} {aprobados.length === 1 ? 'cuenta activa' : 'cuentas activas'}.</p>
        </header>

        <div className="settings-rows">{aprobados.map(fila)}</div>

        <p className="settings-field__hint">
          Revocar el acceso no borra nada: sus datos siguen ahí y vuelven a estar disponibles si
          lo apruebas de nuevo. Para eliminar una cuenta de verdad hay que hacerlo desde el panel
          de Supabase.
        </p>
      </section>
    </div>
  );
};

export default UsersSection;
