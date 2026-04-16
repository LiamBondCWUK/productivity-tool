const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Shared config for all test environments
const sharedConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    '!app/**/*.d.ts',
    '!app/**/layout.tsx',
    '!app/**/page.tsx',
  ],
}

// Use Jest projects to support multiple test environments
const customJestConfig = {
  projects: [
    // API routes and server-side code (Node.js environment)
    {
      ...sharedConfig,
      displayName: 'api',
      testEnvironment: 'node',
      testMatch: ['**/api/**/__tests__/**/*.[jt]s?(x)', '**/api/**/?(*.)+(spec|test).[jt]s?(x)'],
    },
    // React components (jsdom environment)
    {
      ...sharedConfig,
      displayName: 'components',
      testEnvironment: 'jsdom',
      testMatch: ['**/app/**/__tests__/**/*.[jt]sx', '**/app/**/?(*.)+(spec|test).[jt]sx', '!**/api/**/*'],
    },
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
