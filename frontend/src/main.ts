import { createApp } from 'vue';
import App from './App.vue';
import { installListCoverVisibilityRecovery } from './covers';
import { installIconFontWatch } from './ui/iconFont';
import './style.css';

if (!window.SongloftPlugin && !import.meta.env.DEV) {
  throw new Error('SongloftPlugin 宿主脚本未注入');
}

// 必须在 mount 之前：探针要抢到 WebF 字体懒加载的「第一个请求者」位置，
// 那是唯一会在字体到货后被重排的节点。详见 ui/iconFont.ts。
installIconFontWatch();
installListCoverVisibilityRecovery();

createApp(App).mount('#app');
