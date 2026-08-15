import { supabase } from '../lib/supabase';

/**
 * Foto del recibo. Depende de `supabase/006_recibos.sql`.
 *
 * El bucket es privado: una foto de recibo lleva nombres, montos y a veces
 * direcciones. Se lee con URLs firmadas de vida corta, y en la base se guarda
 * solo la RUTA del archivo — guardar la URL firmada dejaria enlaces muertos a
 * los pocos minutos.
 */

const BUCKET = 'recibos';

/** Una hora: suficiente para abrir y mirar, poco para que sirva de enlace. */
const SEGUNDOS_DE_FIRMA = 3600;

const MAX_BYTES = 5 * 1024 * 1024;

const TIPOS_ACEPTADOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];

export const ACCEPT_RECIBOS = TIPOS_ACEPTADOS.join(',');

export const MENSAJE_MIGRACION_RECIBOS =
  'Los recibos necesitan la migración 006. Ejecuta supabase/006_recibos.sql en el SQL Editor de Supabase.';

const requireUserId = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  return session.user.id;
};

/**
 * Si el bucket existe, para no ofrecer un boton que solo puede fallar.
 *
 * Se usa `getBucket` porque es la unica que distingue los dos casos:
 *
 *  - `list()` sobre un bucket que no existe devuelve una lista VACIA sin error
 *    ninguno, identica a la de un bucket recien creado.
 *  - `createSignedUrl` responde "Object not found" tanto si falta el objeto
 *    como si falta el bucket entero.
 *
 * Y `getBucket` solo sirve gracias a la politica `recibos_bucket_visible` de
 * la migracion 006: `storage.buckets` tiene RLS, y sin permiso de lectura
 * devuelve 404 "Bucket not found" aunque el bucket exista.
 *
 * Solo un "not found" lo da por ausente. Cualquier otro error se trata como
 * disponible a proposito: es preferible dejar el boton y que la subida falle
 * con un mensaje claro, a esconder la funcion por un error de red pasajero.
 */
export const recibosDisponibles = async (): Promise<boolean> => {
  const { error } = await supabase.storage.getBucket(BUCKET);
  if (!error) return true;

  return !/not found|does not exist/i.test(error.message ?? '');
};

/** Extension a partir del nombre original, para no perderla en la ruta. */
const extensionDe = (nombre: string): string => {
  const punto = nombre.lastIndexOf('.');
  if (punto === -1 || punto === nombre.length - 1) return 'jpg';
  return nombre.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
};

/**
 * Sube el archivo y devuelve su ruta.
 *
 * La ruta empieza SIEMPRE por el uid del usuario: no es una convencion de
 * nombres, es lo que comprueba la politica de Storage. Un archivo fuera de esa
 * carpeta lo rechaza Postgres, no el cliente.
 */
export const subirRecibo = async (transactionId: string, archivo: File): Promise<string> => {
  const userId = await requireUserId();

  if (archivo.size > MAX_BYTES) {
    throw new Error('El archivo supera los 5 MB. Toma la foto con menos calidad o recórtala.');
  }
  if (archivo.type && !TIPOS_ACEPTADOS.includes(archivo.type)) {
    throw new Error('Solo se aceptan imágenes (JPG, PNG, WebP, HEIC) o PDF.');
  }

  const ruta = `${userId}/${transactionId}.${extensionDe(archivo.name)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    // Volver a adjuntar reemplaza el anterior en vez de dejar huerfanos que
    // nadie va a mirar y que siguen ocupando cuota.
    upsert: true,
    contentType: archivo.type || undefined,
  });

  if (error) {
    if (/not found|bucket/i.test(error.message ?? '')) {
      throw new Error(MENSAJE_MIGRACION_RECIBOS);
    }
    console.error('Error subiendo el recibo:', error);
    throw new Error('No se pudo subir el recibo');
  }

  return ruta;
};

/** URL temporal para mirar el archivo. Null si ya no existe. */
export const urlDeRecibo = async (ruta: string): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(ruta, SEGUNDOS_DE_FIRMA);

  if (error) {
    console.error('Error firmando la URL del recibo:', error);
    return null;
  }

  return data?.signedUrl ?? null;
};

export const borrarRecibo = async (ruta: string): Promise<void> => {
  const { error } = await supabase.storage.from(BUCKET).remove([ruta]);

  if (error) {
    console.error('Error borrando el recibo:', error);
    throw new Error('No se pudo eliminar el recibo');
  }
};
