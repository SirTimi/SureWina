import { registerRootComponent } from 'expo';
import App from './App';

// Entry point. Expo's default (node_modules/expo/AppEntry.js) cannot find
// App.tsx under pnpm's layout, so the app registers itself here.
registerRootComponent(App);
