<<<<<<< HEAD
=======
import { waitUntil } from 'async-wait-until';
>>>>>>> 514257e2a9529751513707b6ae5efcc984e49328
import App from './App.vue';
import './global.css';

$(async () => {
  await waitGlobalInitialized('Mvu');
<<<<<<< HEAD
=======
  await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'));
>>>>>>> 514257e2a9529751513707b6ae5efcc984e49328
  createApp(App).use(createPinia()).mount('#app');
});
