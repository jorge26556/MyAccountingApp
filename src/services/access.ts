import { supabase } from '../lib/supabase';

/**
 * Aprobacion de usuarios.
 *
 * Depende de la migracion `supabase/008_aprobacion_usuarios.sql`. Igual que el
 * resto de migraciones, si la tabla no existe todavia la app no se cae ni deja
 * a nadie fuera: se comporta como antes, con todos aprobados. Eso es lo que
 * permite que Vercel despliegue el codigo antes de que el SQL este corrido sin
 * dejar la app inaccesible en el intervalo.
 */

export interface Acceso {
  aprobado: boolean;
  esAdmin: boolean;
}

export interface UsuarioAdmin {
  userId: string;
  alias: string;
  email: string | null;
  aprobado: boolean;
  esAdmin: boolean;
  creadoEn: string;
}

const esTablaInexistente = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  Boolean(error?.message?.includes('does not exist'));

const requireUserId = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  return session.user.id;
};

/**
 * El veredicto se cachea porque la app funciona sin conexion. Sin esto, abrir
 * la app sin señal sacaria a un usuario legitimo a la pantalla de "pendiente de
 * aprobacion" —justo lo contrario de para lo que existe el modo offline—.
 *
 * Solo se cachea el SI. Un "pendiente" no se guarda: si guardaramos el no, el
 * usuario recien aprobado seguiria viendo la pantalla de espera hasta que la
 * cache caducara.
 */
const claveCache = (userId: string) => `mycontabilidad.acceso.${userId}`;

const leerCache = (userId: string): Acceso | null => {
  try {
    const crudo = localStorage.getItem(claveCache(userId));
    if (!crudo) return null;
    const valor = JSON.parse(crudo) as Acceso;
    return valor.aprobado ? valor : null;
  } catch {
    return null;
  }
};

const guardarCache = (userId: string, acceso: Acceso) => {
  try {
    if (acceso.aprobado) {
      localStorage.setItem(claveCache(userId), JSON.stringify(acceso));
    } else {
      localStorage.removeItem(claveCache(userId));
    }
  } catch {
    // Modo privado o almacenamiento lleno: el acceso se resolvera online.
  }
};

/**
 * Al cerrar sesion no se sabe de quien era la sesion que se cierra, asi que se
 * limpian todas las cacheadas. Son un booleano por usuario: no hay nada que
 * conservar.
 */
export const olvidarAccesos = () => {
  try {
    const claves = Object.keys(localStorage).filter(clave =>
      clave.startsWith('mycontabilidad.acceso.')
    );
    claves.forEach(clave => localStorage.removeItem(clave));
  } catch {
    // Nada que limpiar.
  }
};

export const fetchAccess = async (): Promise<Acceso> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('user_access')
    .select('aprobado, es_admin')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (esTablaInexistente(error)) return { aprobado: true, esAdmin: false };

    const cacheado = leerCache(userId);
    if (cacheado) return cacheado;

    console.error('Error fetching access:', error);
    throw new Error('No se pudo comprobar el estado de tu cuenta');
  }

  // Sin fila = usuario creado antes de la migracion o desde el panel de
  // Supabase, que no dispara el trigger de la misma forma. Se trata como
  // pendiente: es el lado seguro.
  const acceso: Acceso = {
    aprobado: Boolean(data?.aprobado),
    esAdmin: Boolean(data?.es_admin),
  };

  guardarCache(userId, acceso);
  return acceso;
};

/**
 * Solo devuelve algo para un admin: la RLS filtra al resto.
 *
 * Son dos consultas y no un `select` anidado a proposito. PostgREST solo sabe
 * cruzar tablas si hay una llave foranea que las una, y aqui las dos apuntan a
 * `auth.users` sin tocarse entre si: pedirle el join devolveria PGRST200.
 */
export const fetchUsuarios = async (): Promise<UsuarioAdmin[]> => {
  const [accesos, perfiles] = await Promise.all([
    supabase
      .from('user_access')
      .select('user_id, aprobado, es_admin, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, id_user, email'),
  ]);

  if (accesos.error) {
    if (esTablaInexistente(accesos.error)) return [];
    console.error('Error fetching usuarios:', accesos.error);
    throw new Error('No se pudo cargar la lista de usuarios');
  }

  const porId = new Map(
    (perfiles.data ?? []).map(item => [item.id, item])
  );

  return (accesos.data ?? []).map(row => {
    const perfil = porId.get(row.user_id);
    return {
      userId: row.user_id,
      alias: perfil?.id_user ?? '(sin alias)',
      email: perfil?.email ?? null,
      aprobado: Boolean(row.aprobado),
      esAdmin: Boolean(row.es_admin),
      creadoEn: row.created_at,
    };
  });
};

export const setAprobado = async (userId: string, aprobado: boolean): Promise<void> => {
  const adminId = await requireUserId();

  if (userId === adminId) throw new Error('No puedes cambiar tu propio acceso');

  const { error } = await supabase
    .from('user_access')
    .update({
      aprobado,
      aprobado_por: aprobado ? adminId : null,
      aprobado_en: aprobado ? new Date().toISOString() : null,
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating access:', error);
    throw new Error(aprobado ? 'No se pudo aprobar al usuario' : 'No se pudo revocar el acceso');
  }
};
