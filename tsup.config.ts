import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts'],
  target: 'esnext',
  format: ['esm', 'cjs'],
  splitting: false,
  sourcemap: false,
  dts: true,
  clean: true,
})
