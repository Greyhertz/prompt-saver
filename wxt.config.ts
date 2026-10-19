import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Prompt Saver',
    description: 'Auto-saves unsent prompts in Google AI Studio',
    version: '0.1.0',
    permissions: ['storage'],
  },
});