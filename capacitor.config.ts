import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.be9fc7fdc6b04998a36303e6a66496f3',
  appName: 'HeartSync',
  webDir: 'dist',
  server: {
    url: 'https://be9fc7fd-c6b0-4998-a363-03e6a66496f3.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    CapacitorHealthkit: {
      // iOS Info.plist usage descriptions are configured natively
    },
  },
};

export default config;
