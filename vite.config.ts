import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /**
         * Sin esto todo sale en un solo archivo de ~895 kB, y cualquier cambio
         * minimo en la app obliga a volver a descargar recharts entero. Al
         * separarlo, las dependencias grandes se quedan en la cache del
         * navegador entre despliegues.
         */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
