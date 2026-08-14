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

## Ajustes pendientes en el panel de Supabase

Estos no se pueden hacer por SQL ni por migración; hay que entrar al panel.

### 1. Cerrar el registro público (recomendado mientras sea de uso personal)

**Authentication → Sign In / Providers → Email → "Allow new users to sign up": off**

Hoy cualquiera que abra la URL puede crear una cuenta y consumir la cuota del
proyecto. Con esto apagado, los usuarios se crean a mano desde
**Authentication → Users → Add user**.

### 2. Activar protección de contraseñas filtradas

**Authentication → Policies → "Leaked password protection": on**

Contrasta la contraseña contra HaveIBeenPwned al registrarse o cambiarla.
El linter de seguridad de Supabase lo reporta mientras esté apagado.

### 3. Confirmación de correo

Actualmente está **desactivada**: `signUp` devuelve sesión de inmediato. Era lo
que compensaba el hack de auto-confirmación del antiguo RPC `create_user_profile`,
que ya se eliminó. Si más adelante quieres exigir verificación de correo:

**Authentication → Sign In / Providers → Email → "Confirm email": on**

Ten en cuenta que el SMTP por defecto de Supabase tiene límites bajos de envío;
para uso real conviene configurar un SMTP propio.

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
