import { mount } from 'svelte';
import App from './App.svelte';
import { initLocalization } from './i18n';
import './styles.css';

initLocalization();

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app root element');

mount(App, { target });
