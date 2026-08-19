import type { ConfigContext, ExpoConfig } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'plazafit',
  slug: 'plazafit',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'plazafit',
  userInterfaceStyle: 'light',

  ios: {
    icon: './assets/expo.icon',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'PlazaFit necesita tu ubicación para validar que estás cerca de la plaza al registrar una visita.',
    },
  },

  android: {
    package: 'com.plazafit.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
  },

  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#16a34a',
        android: {
          image: './assets/images/plazafit-logo.png',
          imageWidth: 76,
        },
      },
    ],
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    ],
    'expo-location',
    [
      'expo-camera',
      {
        cameraPermission: 'PlazaFit necesita acceso a la cámara para escanear códigos QR de máquinas.',
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    eas: {
      projectId: 'af2430ac-e18b-432f-b391-11567acfae40',
    },
  },
})