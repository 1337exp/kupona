import { createApp } from 'vue';
import TaoUI, { applyTaoMode } from '@1337exp/taoui';
import '@1337exp/taoui/styles.css';
import '@/styles/app.css';
import App from './App.vue';

applyTaoMode(document.documentElement, matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

createApp(App).use(TaoUI).mount('#app');
