/**
 * El contador sobre el icono de la app instalada.
 *
 * Es lo mas cerca que se puede estar de una notificacion sin montar
 * infraestructura de push: no hace falta servidor, ni claves VAPID, ni pedir
 * permiso, ni una Edge Function que despierte al usuario. El numero de pagos
 * urgentes queda a la vista en la pantalla de inicio del telefono.
 *
 * Donde no existe la API —hoy, Safari en iOS— no pasa nada: el icono se ve
 * como siempre y el aviso sigue estando dentro de la app, en Próximos pagos.
 */

/**
 * Tipo suelto, no una extension de `Navigator`: la libreria de TypeScript ya
 * declara estos metodos como obligatorios, asi que extenderla para marcarlos
 * opcionales choca. Aqui lo que importa es que en tiempo de ejecucion pueden
 * no existir.
 */
type NavigatorConBadge = {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export const soportaBadge = (): boolean =>
  typeof navigator !== 'undefined' && 'setAppBadge' in navigator;

export const actualizarBadge = (cantidad: number): void => {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as unknown as NavigatorConBadge;

  // Los fallos se ignoran: que el icono no muestre un numero no es un problema
  // que el usuario pueda resolver, y un error en consola por esto solo estorba.
  if (cantidad > 0) void nav.setAppBadge?.(cantidad).catch(() => {});
  else void nav.clearAppBadge?.().catch(() => {});
};
