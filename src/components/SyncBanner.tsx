import React from 'react';
import { CloudOff, History, RefreshCw } from 'lucide-react';

interface SyncBannerProps {
  enLinea: boolean;
  porSincronizar: number;
  /** Los datos en pantalla salieron de la copia local, no del servidor. */
  desdeCache: boolean;
  onReintentar: () => void;
}

/**
 * El estado de la conexion, solo cuando hay algo que decir.
 *
 * Un indicador permanente de "conectado" es ruido: lo normal es tener señal.
 * Esto aparece unicamente cuando algo se desvia de lo normal —estas sin
 * conexion, hay movimientos esperando subir, o lo que ves salio de la copia
 * local— y desaparece solo.
 *
 * Que quede claro que un numero puede estar desactualizado importa mas de lo
 * que parece: tomar una decision de plata con un saldo viejo creyendolo actual
 * es peor que no poder verlo.
 */
const SyncBanner: React.FC<SyncBannerProps> = ({
  enLinea,
  porSincronizar,
  desdeCache,
  onReintentar,
}) => {
  if (enLinea && porSincronizar === 0 && !desdeCache) return null;

  const pendientes =
    porSincronizar === 1
      ? '1 movimiento sin subir'
      : `${porSincronizar} movimientos sin subir`;

  return (
    <div className={`sync-banner ${enLinea ? '' : 'is-offline'}`}>
      <span className="sync-banner__icon">
        {enLinea ? <RefreshCw size={16} /> : <CloudOff size={16} />}
      </span>

      <span className="sync-banner__text">
        {!enLinea && (
          <>
            <strong>Sin conexión.</strong> Puedes seguir registrando; se guarda en el teléfono y
            se sube solo al recuperar la señal.
          </>
        )}
        {enLinea && porSincronizar > 0 && (
          <>
            <strong>{pendientes}.</strong> Se están sincronizando.
          </>
        )}
        {enLinea && porSincronizar === 0 && desdeCache && (
          <>
            <History size={13} /> Mostrando la última copia guardada: puede estar desactualizada.
          </>
        )}
      </span>

      {enLinea && (
        <button type="button" className="sync-banner__action" onClick={onReintentar}>
          Actualizar
        </button>
      )}
    </div>
  );
};

export default SyncBanner;
