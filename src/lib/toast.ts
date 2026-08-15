import { createContext, useContext } from 'react';

/**
 * El contexto y sus helpers viven aparte del componente <ToastProvider> porque
 * un archivo que exporta componentes y ademas hooks/constantes rompe el fast
 * refresh de Vite: cualquier edicion recarga el modulo entero y se pierde el
 * estado de la pantalla.
 */

/**
 * Un boton dentro del aviso. Existe sobre todo para "Deshacer": un borrado
 * accidental no tenia vuelta atras, y confirmar cada borrado con un dialogo
 * estorba en el caso normal, que es acertar.
 */
export interface ToastAccion {
  label: string;
  onClick: () => void;
}

export interface ToastApi {
  success: (message: string, accion?: ToastAccion) => void;
  error: (message: string, accion?: ToastAccion) => void;
  info: (message: string, accion?: ToastAccion) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export const useToast = (): ToastApi => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return context;
};

/** Extrae un mensaje legible de un `unknown` de catch. */
export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;
