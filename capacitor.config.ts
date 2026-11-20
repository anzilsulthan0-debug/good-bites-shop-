import type {CapacitorConfig} from '@capacitor/cli';

const liveServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.goodbites.app',
  appName: 'Good Bites',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    ...(liveServerUrl ? {url: liveServerUrl, cleartext: false} : {}),
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#fbf8f1',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#b8891f',
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#fbf8f1',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#fbf8f1',
  },
};

export default config;
