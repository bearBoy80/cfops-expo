module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src', '<rootDir>/app'],
  resolver: '<rootDir>/jest.resolver.js',
  setupFiles: [
    ...(require('jest-expo/jest-preset').setupFiles ?? []),
    'react-native-gesture-handler/jestSetup',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    // Ignore everything in node_modules EXCEPT these packages (we want to transform them)
    'node_modules/(?!((jest-)?react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry|native-base|lucide|react-native-svg))',
    'node_modules/react-native-reanimated/plugin/',
    'node_modules/@react-native/babel-preset/',
  ],
};
