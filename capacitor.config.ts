import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bookourspace.app',
  appName: 'BookOurSpace',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    Keyboard: {
      // Resize the native WebView when the keyboard opens so vh-sized dialogs
      // remain scrollable with a focused field on iOS.
      resize: 'native',
    },
  },
};

export default config;
