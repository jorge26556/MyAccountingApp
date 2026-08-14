import { createContext, useContext } from 'react';

/**
 * El contexto y sus helpers viven aparte del componente <ToastProvider> porque
 * un archivo que exporta componentes y ademas hooks/constantes rompe el fast
 * refresh de Vite: cualquier edicion recarga el modulo entero y se pierde el
 * estado de la pantalla.
 */

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
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
