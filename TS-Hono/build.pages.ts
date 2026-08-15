import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function buildForPages() {
  const outDir = 'dist-pages';
  const functionsDir = 'functions';
  const publicDir = 'public';

  console.log('Building for Cloudflare Pages...');

  // 清空旧产物，避免残留已删除的静态文件
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }

  if (existsSync(publicDir)) {
    copyDirRecursive(publicDir, outDir);
  }

  const functionsOutDir = join(outDir, 'functions');
  mkdirSync(functionsOutDir, { recursive: true });

  const apiOutDir = join(functionsOutDir, 'api');
  mkdirSync(apiOutDir, { recursive: true });

  await esbuild.build({
    entryPoints: [`${functionsDir}/api/[[catchall]].ts`],
    outfile: join(apiOutDir, '[[catchall]].js'),
    bundle: true,
    minify: true,
    sourcemap: false,
    target: ['es2022'],
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd', 'browser'],
    external: ['node:buffer', 'node:crypto'],
    loader: { '.ts': 'ts' },
    absWorkingDir: __dirname,
  });

  console.log('Pages build complete!');

  const routesConfig = {
    version: 1,
    // 仅让 /api/* 走 Functions；未匹配的请求由 Pages 静态资产服务直接处理，不会 404
    include: ['/api/*', '/api'],
    exclude: []
  };
  // _routes.json 必须放在构建输出目录的根（dist-pages/），而不是 dist-pages/functions/
  writeFileSync(join(outDir, '_routes.json'), JSON.stringify(routesConfig, null, 2));
}

function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

buildForPages().catch((e) => {
  console.error(e);
  process.exit(1);
});
