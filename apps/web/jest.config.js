const nextJest = require('next/jest');

// next/jest wires up the SWC transform, CSS/image stubs, path aliases from
// tsconfig, and .env loading, so component tests run the same way the app does.
const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // `.next/standalone` contains a copy of package.json, which collides with
  // the real one in jest's haste map. Exclude the whole build directory from
  // module resolution, not just from test discovery.
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
});
