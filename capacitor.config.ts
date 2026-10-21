import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.vercel.magic_converter_seven.twa',
  appName: 'Converter',
  webDir: 'dist',
  backgroundColor: '#07070A',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#07070A',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
