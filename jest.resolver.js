/**
 * Combines the React Native jest resolver (packageFilter workaround) with the
 * react-native-worklets resolver, which must resolve its non-native (jest-safe)
 * module variants so importing reanimated does not touch native TurboModules.
 */
'use strict';

module.exports = (request, options) => {
  if (
    options.basedir.includes('react-native-worklets') ||
    request.includes('react-native-worklets')
  ) {
    options = {
      ...options,
      extensions: options.extensions?.filter((ext) => !ext.includes('native')),
    };
  }

  const originalPackageFilter = options.packageFilter;
  return options.defaultResolver(request, {
    ...options,
    packageFilter: (pkg) => {
      const filteredPkg = originalPackageFilter
        ? originalPackageFilter(pkg)
        : pkg;
      if (filteredPkg.name === 'react-native') {
        delete filteredPkg.exports;
      }
      return filteredPkg;
    },
  });
};
