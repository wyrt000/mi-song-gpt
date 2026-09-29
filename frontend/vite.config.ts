import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) =>
            tag.startsWith('flutter-') ||
            tag.startsWith('webf-') ||
            tag.startsWith('songloft-'),
        },
      },
    }),
    {
      name: 'songloft-html-transform',
      apply: 'build',
      transformIndexHtml(html) {
        let output = html.replace(/"\.\//g, '"static/');
        output = output.replace(/\s+crossorigin(?==|\s|>)/g, '');
        const script = output.match(
          /<script\b[^>]*\bsrc="static\/js\/app\.js"[^>]*><\/script>/,
        );
        if (!script) {
          throw new Error('没有生成 builder 要求的 static/js/app.js 引用');
        }
        output = output.replace(script[0], '');
        return output
          .replace(/[ \t]+$/gm, '')
          .replace('</body>', `${script[0]}\n  </body>`);
      },
    },
  ],
  build: {
    outDir: '../static',
    emptyOutDir: true,
    cssTarget: 'chrome61',
    // 把两个图标字体（4.1KB + 10.5KB）内联成 base64 data URI 打进 CSS。
    // WebF 的 @font-face 是布局期懒加载：字体走网络就一定比首屏排版晚到，而它
    // 只重排「第一个请求者」，其余图标会永久停在 fallback 字形（方块 / emoji，
    // songloft-org/songloft-plugin-miot#81）。内联省掉两次跨公网 HTTPS 往返，
    // 把窗口从秒级压到一两帧；剩下的窗口由 ui/iconFont.ts 的探针兜住。
    // 改这个值前先确认不会顺手把别的资源也内联了（src/assets 下目前只有这两个字体）。
    assetsInlineLimit: 16 * 1024,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'js/app.js',
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css')
            ? 'css/style.css'
            : 'assets/[name].[ext]',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:58091',
        changeOrigin: true,
      },
    },
  },
});
