import { defineConfig } from 'tsdown';

export default defineConfig({
  exports: true,
  outDir: 'dist',
  format: 'esm',
  target: 'es2020',
  sourcemap: true,
  clean: true,
  dts: true,
  entry: 'src/index.ts',
  platform: 'browser',
  minify: true,
});
