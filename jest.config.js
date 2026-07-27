module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    // Ignore everything in node_modules EXCEPT these packages (we want to transform them)
    'node_modules/(?!((jest-)?react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry|@noble|native-base|lucide|react-native-svg))',
    'node_modules/react-native-reanimated/plugin/',
    'node_modules/@react-native/babel-preset/',
  ],
};
