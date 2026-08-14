# MyContabilidadApp

Aplicación personal de finanzas: registro de ingresos y gastos, categorías,
metas de ahorro y un dashboard con KPIs y gráficas.

React 19 · TypeScript · Vite 7 · Supabase (Postgres 17 + Auth + RLS) · Vercel

---

## Funcionalidades

- Registro e inicio de sesión por correo, con recuperación de contraseña
- Dashboard con KPIs y 8 gráficas, acotado a un periodo seleccionable
- Alta, edición y borrado de transacciones, con confirmación en línea
- Categorías configurables, con reasignación de transacciones al eliminar una
- Metas de ahorro múltiples, con barra de progreso contra el periodo
- Exportación e importación en CSV
- Instalable como PWA en el celular, con soporte básico sin conexión
- Aislamiento total por usuario mediante Row Level Security

## Desarrollo

```bash
npm install
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm run build` | Compilación de producción (`tsc -b && vite build`) |
| `npm run lint` | ESLint sobre todo el proyecto |
| `npm run test` | Tests unitarios (Vitest) |
| `npm run check` | lint + tests + build. Lo que debe pasar antes de un commit |
| `npm run types:supabase` | Regenera `src/lib/database.types.ts` desde el esquema real |

## Variables de entorno

Crea un archivo `.env.local` (está en `.gitignore`):

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

La `anon key` es pública por diseño y viaja dentro del bundle; lo que protege
los datos es RLS, no el secreto de esa llave.

## Base de datos

Todo el esquema —tablas, constraints, índices, trigger de perfiles y políticas
RLS— está en un solo archivo:

```
supabase/schema.sql
```

Es idempotente: se puede ejecutar en el SQL Editor de Supabase cuantas veces
haga falta. Reemplaza a los antiguos `categories.sql` y `security_policies.sql`,
que se pisaban entre sí y dejaban políticas duplicadas.

Después de cualquier cambio de esquema, regenera los tipos:

```bash
npm run types:supabase
```

### Verificación de seguridad

Estas dos consultas deberían formar parte de cualquier revisión:

```sql
-- Las cuatro tablas deben tener rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public';

-- Ninguna política debe tener qual = 'true' ni incluir el rol 'public'
select tablename, policyname, roles::text, cmd, qual
  from pg_policies where schemaname = 'public' order by tablename;
```

Y una comprobación desde fuera, sin autenticarse: todas deben devolver `[]`.

```bash
curl -s "$VITE_SUPABASE_URL/rest/v1/profiles?select=*" -H "apikey: $VITE_SUPABASE_ANON_KEY"
```

## Arquitectura

```
src/
  lib/            lógica pura, sin React — es lo que está cubierto por tests
    dates.ts        parseo y serialización de fechas en zona local
    kpis.ts         cálculo de KPIs, periodos y filtros
    csv.ts          exportación e importación
    format.ts       formateo de moneda (un solo lugar define COP/es-CO)
    supabase.ts     cliente tipado
    database.types.ts  tipos generados desde el esquema
  services/api.ts   acceso a datos; única capa que habla con Supabase
  components/       UI
```

Las fechas **siempre** pasan por `lib/dates.ts`. `transactions.fecha` es de tipo
`date` en Postgres, así que llega como `"YYYY-MM-DD"`; pasarla por `new Date()`
la interpreta como medianoche **UTC** y en Colombia (UTC-5) la corre al día
anterior.

## Despliegue

Vercel construye y publica en cada push a `main`. Las variables
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se configuran en
Project Settings → Environment Variables.

`vercel.json` define el rewrite de SPA (necesario para que las rutas
`/transacciones` y `/configuracion` funcionen al recargar) y las cabeceras de
seguridad.
