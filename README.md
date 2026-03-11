# MyAccountingApp

Aplicacion personal de contabilidad construida con React, TypeScript, Vite y Supabase.

## Funcionalidades

- registro e inicio de sesion por correo
- dashboard con KPIs y charts de ingresos y gastos
- creacion y edicion de transacciones
- categorias configurables por usuario
- aislamiento de datos por usuario con Supabase RLS
- despliegue personal en Vercel

## Desarrollo

```bash
npm install
npm run dev
```

## Variables de entorno

Crea un archivo `.env.local` con:

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

## SQL de soporte

Los scripts de Supabase estan en:

- `supabase/categories.sql`
- `supabase/security_policies.sql`
