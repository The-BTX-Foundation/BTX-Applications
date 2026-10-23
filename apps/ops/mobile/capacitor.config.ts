import type { CapacitorConfig } from '@capacitor/cli';

// The BTX Ops Hub iPhone app is the live Ops Hub inside a native shell: web updates reach the phone with no new App
// Store review. The shell adds a Face ID lock, an offline page and push notifications (see ../../../docs/ops-iphone-app).
const config: CapacitorConfig = {
  appId: 'org.thebtxfoundation.opshub',
  appName: 'BTX Ops Hub',
  webDir: 'native-shell',
  server: {
    url: 'https://ops.thebtxfoundation.org',
    errorPath: 'offline.html',
    cleartext: false,
    // App Review signs in with a review email that hands off to a sample-data copy of the Ops Hub (PR C).
    allowNavigation: ['demo-ops.thebtxfoundation.org'],
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#f4f5f2ff',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
