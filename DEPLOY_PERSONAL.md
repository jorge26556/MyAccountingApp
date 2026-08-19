# Operación y despliegue

## Despliegue

Vercel está conectado al repositorio: cada push a `main` construye y publica.
No hay pasos manuales.

- Proyecto Vercel: `skill-deploy-goevus63eu`
- URL: https://skill-deploy-goevus63eu.vercel.app
- Proyecto Supabase: `MyContabilidadApp` (`hfwvanvrbbreefhnwxzy`, us-east-2)

Variables de entorno en Vercel (Project Settings → Environment Variables):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Los valores están en `.env.local`, que no se versiona.

## Antes de cada push

```bash
npm run check
```

Corre lint, tests y build. Si algo falla, el despliegue también fallaría.

## Estado de las migraciones

| Archivo | Contiene | Estado |
|---|---|---|
| `supabase/schema.sql` | Tablas base, RLS, trigger de perfiles, constraints e índices | Aplicada |
| `supabase/002_presupuestos_recurrentes_cuenta.sql` | `budgets`, `recurring_transactions` y `delete_own_account()` | Aplicada |
| `supabase/003_cuentas_saldos.sql` | `accounts`, `transactions.account_id`, `transfer_group` y el backfill | Aplicada |
| `supabase/004_cuotas.sql` | `compra_id`, `cuota_numero` y `cuota_total` en `transactions` | Aplicada |
| `supabase/005_deudas.sql` | `debts` y `transactions.debt_id` | Aplicada |
| `supabase/006_recibos.sql` | Bucket `recibos` y `transactions.recibo_path` | Aplicada |
| `supabase/007_renombrar_categoria.sql` | RPC `rename_category` | **Pendiente** |
| `supabase/008_aprobacion_usuarios.sql` | `user_access`, `es_admin()`, `esta_aprobado()` y cierre de las políticas | **Pendiente** |

Para reconstruir la base desde cero, córrelas en ese orden.

### Cómo detecta la app cada migración

Todas están aplicadas, pero la detección sigue viva: es lo que permite
desplegar el código antes que la migración sin romper nada. Cada una se
comprueba distinto, y la razón importa:

- **004** se deduce de los datos que la app ya descarga: si las filas traen la
  clave `compra_id`, la migración corrió. Cero peticiones extra. Preguntar por
  la columna con un `select` costaba un 400 en la consola en cada carga, y un
  error rojo permanente que no significa nada es lo que hace que se dejen de
  mirar los que sí significan algo.
- **005** por el error `42P01` de tabla inexistente, igual que 002 y 003.
- **006** con `getBucket`. Ninguna otra comprobación desde el cliente sirve:
  `list()` sobre un bucket ausente devuelve **lista vacía sin error**, y
  `createSignedUrl` responde `"Object not found"` tanto si falta el objeto como
  si falta el bucket entero. Y `getBucket` solo funciona gracias a la política
  `recibos_bucket_visible` — sin ella devuelve 404 aunque el bucket exista,
  porque RLS oculta la fila de `storage.buckets`.

Si alguna función no aparece, esto dice por qué:

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'transactions'
   and column_name in ('compra_id', 'cuota_numero', 'cuota_total', 'debt_id', 'recibo_path');

select id, public from storage.buckets where id = 'recibos';

-- Sin esta política el botón de adjuntar no sale nunca:
select policyname from pg_policies
 where schemaname = 'storage' and tablename = 'buckets'
   and policyname = 'recibos_bucket_visible';
```

### Renombrar una categoría

El nombre de una categoría no es una llave foránea: viaja como **texto** en
`transactions.categoria`, `budgets.categoria` y `recurring_transactions.categoria`.
Por eso renombrar pasa por el RPC `rename_category` de la 007 y no por cuatro
`UPDATE` sueltos desde el cliente: si se corta la señal a la mitad quedarían
movimientos con el nombre nuevo y presupuestos con el viejo, y nada lo
señalaría. Dentro del RPC es una sola transacción.

Después de renombrar, ninguna de estas tres debe devolver el nombre viejo:

```sql
select categoria, count(*) from public.transactions group by categoria;
select categoria from public.budgets;
select categoria from public.recurring_transactions;
```

`Transferencia` y `Préstamo` están vetados como destino: no son categorías del
usuario sino las etiquetas con las que la app marca las dos patas de una
transferencia y los movimientos de una deuda, y el resto del código las
descuenta de ingresos y gastos.

### Cuadrar una compra a cuotas

La suma de las cuotas siempre es exactamente el total: la última absorbe el
sobrante del redondeo (1.000.000 en 3 → 333.333 + 333.333 + **333.334**).

```sql
select compra_id, count(*) as cuotas, sum(importe) as total
  from public.transactions where compra_id is not null group by compra_id;
```

### Sobre la 003

Crea una cuenta `Principal` por usuario y le asigna todos los movimientos
existentes, así que los saldos cuadran desde el primer arranque. Después de
correrla, esta consulta debe dar cero:

```sql
select count(*) from public.transactions where account_id is null;
```

La columna `canal` sigue en la base pero la app ya no la usa: 233 de 236 filas
tenían el valor por defecto `'Directo'`, o sea que no distinguía nada. Las
cuentas la reemplazan. No se borró para no perder el poco dato real que guarda.

Después de cualquier migración nueva, regenera los tipos:

```bash
npm run types:supabase
```

## Quién puede entrar

Desde la migración 008 el registro sigue abierto, pero **una cuenta nueva nace
pendiente y no puede leer ni escribir nada** hasta que un administrador la
apruebe en **Configuración → Usuarios**. Antes de eso cualquiera que abriera la
URL entraba al instante: RLS le impedía ver datos ajenos, pero no el alta ni el
consumo de la cuota del proyecto.

El estado vive en `public.user_access`, **no** en una columna de `profiles`. La
razón: RLS es a nivel de fila, y `profiles_update_own` deja a cada usuario
actualizar su propia fila entera. Con `aprobado` ahí, cualquiera podría
auto-aprobarse con un `PATCH` al REST usando la anon key, que va pública dentro
del bundle.

El filtro lo aplican las propias políticas: las de las siete tablas de datos y
las del bucket `recibos` llevan `and public.esta_aprobado()`. La pantalla de
espera de la app es la explicación, no la barrera —si alguien la salta con
curl, se encuentra la misma puerta cerrada—.

Quedan fuera a propósito `profiles` y `user_access`: sin ellas la pantalla de
espera no podría ni decirte quién eres ni dejarte cerrar sesión.

```sql
-- Quién puede entrar y quién manda:
select p.email, p.id_user, ua.aprobado, ua.es_admin, ua.created_at
  from public.user_access ua
  join public.profiles p on p.id = ua.user_id
 order by ua.created_at desc;
```

Un administrador no puede quitarse a sí mismo el acceso ni el rol: lo bloquea
el trigger `user_access_guard_trigger`. Si fuera el único, nadie podría
devolvérselo y habría que arreglarlo por SQL desde el panel.

Para **eliminar** una cuenta de verdad (no solo revocarla) sigue siendo
**Authentication → Users** en el panel de Supabase.

## Ajustes pendientes en el panel de Supabase

Estos no se pueden hacer por SQL ni por migración; hay que entrar al panel.

### 1. Cerrar el registro público (ya no hace falta)

**Authentication → Sign In / Providers → Email → "Allow new users to sign up"**

Se recomendaba apagarlo cuando no había ningún filtro. Con la aprobación manual
de la 008 puede quedarse encendido: el registro está abierto pero no sirve de
nada sin el visto bueno. Apagarlo sigue siendo una opción si prefieres crear tú
cada usuario desde **Authentication → Users → Add user**; en ese caso recuerda
aprobarlo después, porque un usuario creado desde el panel también nace
pendiente.

### 2. Activar protección de contraseñas filtradas

**Authentication → Policies → "Leaked password protection": on**

Contrasta la contraseña contra HaveIBeenPwned al registrarse o cambiarla.
El linter de seguridad de Supabase lo reporta mientras esté apagado.

### 3. Confirmación de correo

Sigue **desactivada**: `signUp` devuelve sesión de inmediato y el usuario cae
directo en la pantalla de "pendiente de aprobación". Puede quedarse así: la
aprobación manual cubre el filtro de entrada, y el SMTP por defecto de Supabase
tiene límites de envío bajos.

Lo que la confirmación añadiría es distinto: comprobar que el correo es
realmente de quien se registra. Si algún día la activas:

**Authentication → Sign In / Providers → Email → "Confirm email": on**

Y entonces hay que revisar `src/components/Auth.tsx`, que hoy da por hecho que
tras `signUp` ya hay sesión.

### 4. URLs de redirección

Para que el enlace de recuperación de contraseña funcione en producción:

**Authentication → URL Configuration → Redirect URLs**, agregar la URL del
despliegue de Vercel.

## Revisión periódica de seguridad

```sql
-- Todas deben tener rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public';

-- Ninguna debe tener qual = 'true' ni el rol 'public'
select tablename, policyname, roles::text, cmd, qual
  from pg_policies where schemaname = 'public' order by tablename;

-- Ninguna función SECURITY DEFINER debe ser ejecutable por anon
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_puede
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef;
```

Y la integridad de los saldos: ningún movimiento debe quedar sin cuenta, y las
transferencias deben venir siempre de a dos.

```sql
select count(*) as huerfanos from public.transactions where account_id is null;

select transfer_group, count(*) as patas
  from public.transactions
 where transfer_group is not null
 group by transfer_group having count(*) <> 2;
```

## Datos que la app guarda en el dispositivo

Desde que funciona sin conexión hay dos cosas en IndexedDB
(`mycontabilidad-offline`), separadas por usuario:

| Almacén | Qué guarda | Al cerrar sesión |
|---|---|---|
| `snapshot` | Copia de los últimos datos cargados, para abrir la app sin señal | **Se borra** |
| `cola` | Movimientos escritos sin conexión que aún no han subido | Se conserva |

La cola se conserva a propósito: son movimientos que el usuario escribió y que
no existen en ningún otro lado. Borrarlos al cerrar sesión sería perderle datos
propios. En la práctica se vacía sola, porque al cerrar sesión con señal la
sincronización ya ocurrió.

El service worker sigue con la prohibición de cachear respuestas de Supabase.
La diferencia es que el ciclo de vida de IndexedDB sí lo controla la app.

## Fotos de recibos

Van a un bucket **privado** (`recibos`). Una foto de recibo lleva nombres,
montos y a veces direcciones: un bucket público las dejaría accesibles a
cualquiera que adivine la URL, sin sesión.

Se leen con URLs firmadas de una hora que genera la app en el momento. En la
base se guarda solo la **ruta**, nunca una URL: las firmadas caducan y dejarían
enlaces muertos a los pocos minutos.

Cada archivo vive en una carpeta con el uid del dueño, y la política de Storage
lo comprueba contra `auth.uid()`. No es una convención de nombres: es la regla
que aplica Postgres.

```sql
-- Cuánto ocupan los recibos, por si el plan gratuito aprieta:
select count(*) as archivos, pg_size_pretty(sum((metadata->>'size')::bigint)) as peso
  from storage.objects where bucket_id = 'recibos';
```

El linter de Supabase marca `delete_own_account` como ejecutable por usuarios
autenticados. **Es intencional**: para darse de baja hay que poder invocarla.
La función valida `auth.uid()` y solo puede eliminar la cuenta de quien llama.

Y la comprobación de caja negra, sin sesión — las cuatro deben devolver `[]`:

```bash
for t in profiles transactions categories savings_goals; do
  curl -s "$VITE_SUPABASE_URL/rest/v1/$t?select=*&limit=1" -H "apikey: $VITE_SUPABASE_ANON_KEY"
done
```

## Si quieres compartirla con otras personas

Pendientes antes de abrirla:

- dominio propio y branding final
- separar entornos `dev` y `prod` (dos proyectos de Supabase)
- política de privacidad y términos
- opción de eliminar la cuenta desde la app
- revisar límites y costos del plan gratuito
