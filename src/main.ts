import { createApp } from 'vue';
import TaoUI from '@1337exp/taoui';
import '@1337exp/taoui/styles.css';
import '@1337exp/taoux/taoui.css'; // bridge: TaoUX variables follow the TaoUI theme / мост: переменные TaoUX следуют теме TaoUI
import '@1337exp/taoux/canvas.css';
import '@1337exp/taoux/links.css';
import '@1337exp/taoux/curveeditor.css';
import '@/styles/app.css';
import App from './App.vue';
import { initLocale } from './i18n';

initLocale();

createApp(App).use(TaoUI).mount('#app');
