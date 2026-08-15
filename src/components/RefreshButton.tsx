import React from 'react';
import { RefreshCw } from 'lucide-react';

interface RefreshButtonProps {
  onClick: () => void;
  refrescando: boolean;
  /** Hora de la ultima lectura correcta del servidor. */
  ultimaActualizacion: Date | null;
  /** Sin señal no hay nada nuevo que traer. */
  enLinea: boolean;
}

const horaCorta = (fecha: Date) =>
  fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

/**
 * Vuelve a leer todo del servidor sin recargar la pagina.
 *
 * Hace falta porque la app no consulta en cada render: guarda una copia local y
 * va parcheando el estado en memoria tras cada operacion. Eso la hace rapida,
 * pero significa que si registras un gasto desde el celular, la pestana abierta
 * en el computador no se entera. Hasta ahora la unica salida era F5, que ademas
 * vuelve a descargar la app entera.
 *
 * A diferencia de la carga inicial, NO vacia la pantalla mientras trabaja: los
 * numeros se quedan puestos y solo gira el icono. Perder la vista de los datos
 * para acabar mostrando los mismos datos se sentiria como un parpadeo gratuito.
 *
 * La hora al lado no es decoracion: sin ella el boton no responde "¿esto que
 * veo es de ahora o de hace media hora?", que es justo la duda que lo motiva.
 */
const RefreshButton: React.FC<RefreshButtonProps> = ({
  onClick,
  refrescando,
  ultimaActualizacion,
  enLinea,
}) => (
  <div className="view-actions">
    {ultimaActualizacion && (
      <span className="view-actions__stamp">Actualizado {horaCorta(ultimaActualizacion)}</span>
    )}

    <button
      type="button"
      className={`refresh-action ${refrescando ? 'is-loading' : ''}`}
      onClick={onClick}
      disabled={refrescando || !enLinea}
      title={enLinea ? 'Volver a leer tus datos del servidor' : 'Sin conexión'}
      aria-label="Actualizar datos"
    >
      <RefreshCw size={15} aria-hidden="true" />
      <span>{refrescando ? 'Actualizando…' : 'Actualizar'}</span>
    </button>
  </div>
);

export default RefreshButton;
