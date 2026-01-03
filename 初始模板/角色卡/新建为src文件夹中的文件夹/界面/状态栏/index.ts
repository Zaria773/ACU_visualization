<<<<<<< HEAD
=======
import { waitUntil } from 'async-wait-until';
>>>>>>> 8a490405107f2fc458a2d9e2d1ad4101cf9dbb6f
import App from './App.vue';
import './global.css';

$(async () => {
  await waitGlobalInitialized('Mvu');
<<<<<<< HEAD
=======
  await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'));
>>>>>>> 8a490405107f2fc458a2d9e2d1ad4101cf9dbb6f
  createApp(App).use(createPinia()).mount('#app');
});
