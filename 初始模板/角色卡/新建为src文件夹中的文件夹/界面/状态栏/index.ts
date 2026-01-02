<<<<<<< HEAD
=======
import { waitUntil } from 'async-wait-until';
>>>>>>> ce4db6a538b394ed513225b312654e5fddfe07fd
import App from './App.vue';
import './global.css';

$(async () => {
  await waitGlobalInitialized('Mvu');
<<<<<<< HEAD
=======
  await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'));
>>>>>>> ce4db6a538b394ed513225b312654e5fddfe07fd
  createApp(App).use(createPinia()).mount('#app');
});
