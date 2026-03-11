# Deploy personal en Vercel

## 1. Reclamar el deployment

Abre este enlace con tu cuenta de Vercel:

- https://vercel.com/claim-deployment?code=3a98b204-a733-4dfb-9813-536474e93479

Preview actual:

- https://skill-deploy-goevus63eu-codex-agent-deploys.vercel.app

## 2. Crear o vincular el proyecto en Vercel

Cuando reclames el deployment, Vercel te dejara asociarlo a tu cuenta. Si te ofrece crear un proyecto nuevo, usa uno con un nombre como:

- my-accounting-app

## 3. Configurar variables de entorno

En Vercel, entra a:

- Project Settings
- Environment Variables

Crea estas variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Usa los valores que tienes localmente en [`.env.local`](C:/Users/dinod/Documents/Projects2026/MyAccountingApp/.env.local).

Tambien tienes el formato de ejemplo en [`.env.example`](C:/Users/dinod/Documents/Projects2026/MyAccountingApp/.env.example).

## 4. Hacer redeploy

Despues de guardar las variables:

- entra a la pestaña `Deployments`
- abre el ultimo deployment
- usa la opcion `Redeploy`

Esto hara que la app construya usando las variables correctas de Supabase.

## 5. Verificar acceso a Supabase

La app usa estas variables desde [`src/lib/supabase.ts`](C:/Users/dinod/Documents/Projects2026/MyAccountingApp/src/lib/supabase.ts).

Si algo falla al abrir la app publicada, revisa:

- que `VITE_SUPABASE_URL` este bien escrita
- que `VITE_SUPABASE_ANON_KEY` sea la publishable key correcta
- que Supabase permita acceso desde el dominio de Vercel

## 6. Tabla de categorias

Para que la configuracion de categorias quede persistida en Supabase, ejecuta este script SQL en el editor SQL de tu proyecto Supabase:

- [supabase/categories.sql](C:/Users/dinod/Documents/Projects2026/MyAccountingApp/supabase/categories.sql)

## 7. Flujo recomendado para esta etapa

Mientras la usas solo tu:

- mantela en Vercel Hobby
- usa URL preview o dominio gratuito de Vercel
- prueba crear, editar y filtrar transacciones
- valida el modulo de configuracion y los charts

## 8. Cuando quieras publicarla al publico

Mas adelante conviene hacer esto antes de venderla:

- dominio propio
- branding final
- politicas y terminos
- separacion de entornos `dev` y `prod`
- revisar limites del plan y costos
- fortalecer reglas y tablas en Supabase
