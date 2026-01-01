<<<<<<< HEAD
=======
import { waitUntil } from 'async-wait-until';
>>>>>>> 72061122c68de1dd79d5df4b9edb19cf459ab600
import App from './App.vue';
import './global.css';

$(async () => {
  await waitGlobalInitialized('Mvu');
<<<<<<< HEAD
=======
  await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'));
>>>>>>> 72061122c68de1dd79d5df4b9edb19cf459ab600
  createApp(App).use(createPinia()).mount('#app');
});
