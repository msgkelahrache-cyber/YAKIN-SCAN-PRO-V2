import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Charge les variables d'environnement
  const env = loadEnv(mode, process.cwd(), '');
  // Sécurité: Récupère la clé depuis loadEnv OU process.env (cas Vercel parfois)
  const apiKey = env.API_KEY || process.env.API_KEY;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'VIN SCAN PRO Maroc',
          short_name: 'VIN SCAN',
          description: 'Application de scan et d\'expertise automobile pour le Maroc',
          theme_color: '#4f46e5',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    define: {
      // Injection robuste de la clé API
      'process.env.API_KEY': JSON.stringify(apiKey),
      // Polyfill simple pour éviter 'process is not defined' si d'autres lib l'utilisent
      'process.env': {}
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1000, // Augmente la limite d'avertissement à 1000kb (1MB)
      rollupOptions: {
        output: {
          manualChunks: {
            // Sépare les grosses librairies dans des fichiers distincts pour optimiser le chargement
            'vendor-react': ['react', 'react-dom'],
            'vendor-ui': ['lucide-react', 'recharts'],
            'vendor-ai': ['@google/generative-ai']
          }
        }
      }
    }
  };
});