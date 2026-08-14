import { useCallback, useSyncExternalStore } from 'react';

/**
 * Suscripcion a una media query.
 *
 * Se usa `useSyncExternalStore` en vez de useState + useEffect porque el valor
 * correcto se conoce en el primer render: con useEffect la app pintaria una vez
 * con el layout de escritorio antes de corregirse, y en el celular eso se ve
 * como un parpadeo del menu.
 *
 * Dos detalles que costaron un bug real (el layout no cambiaba al redimensionar,
 * solo al recargar):
 *
 *  - `subscribe` va en useCallback. Si su identidad cambia en cada render,
 *    React desmonta y rearma la suscripcion continuamente y se pierden eventos.
 *  - Se escucha ademas `resize`. El evento `change` de MediaQueryList no siempre
 *    llega en navegadores embebidos y al rotar el telefono; React descarta el
 *    re-render si el booleano no cambio, asi que el evento extra no cuesta nada.
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (callback: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', callback);
      window.addEventListener('resize', callback);
      return () => {
        list.removeEventListener('change', callback);
        window.removeEventListener('resize', callback);
      };
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false // sin DOM (tests): se asume escritorio
  );
};

/** Punto de corte unico para toda la app; coincide con el de mobile.css. */
export const MOBILE_QUERY = '(max-width: 820px)';

export const useIsMobile = (): boolean => useMediaQuery(MOBILE_QUERY);
