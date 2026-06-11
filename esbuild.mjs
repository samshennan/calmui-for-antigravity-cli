import * as esbuild from 'esbuild';

const isDev = process.argv.includes('--dev');

const sharedOpts = {
  bundle: true,
  sourcemap: isDev,
  minify: !isDev,
};

await Promise.all([
  esbuild.build({
    ...sharedOpts,
    entryPoints: ['src/extension.ts'],
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    // 'vscode' is always external. node-pty (added in Phase 0.5) must also be
    // marked external here and shipped unbundled — it is a native module.
    external: ['vscode', 'node-pty', '@homebridge/node-pty-prebuilt-multiarch'],
    outfile: 'dist/extension.js',
  }),
  esbuild.build({
    ...sharedOpts,
    entryPoints: ['src/webview/index.tsx'],
    platform: 'browser',
    format: 'esm',
    jsx: 'automatic',
    outfile: 'dist/webview.js',
  }),
]);
