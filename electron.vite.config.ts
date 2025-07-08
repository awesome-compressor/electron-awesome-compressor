import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import Pages from 'vite-plugin-pages'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve('src/main/'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      vue(),
      Pages(),
      AutoImport({
        imports: ['vue', 'vue-router', '@vueuse/core'],
        dts: true
      }),
      Components({
        dts: true
      }),
      Unocss({})
    ],
    build: {
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          preview: resolve('src/renderer/preview/index.html')
        }
      }
    }
  }
})
