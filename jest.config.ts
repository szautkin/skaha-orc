import type { Config } from 'jest';

const config: Config = {
  projects: [
    {
      displayName: 'shared',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: 'packages/shared',
      moduleNameMapper: {
        '^@skaha-orc/shared$': '<rootDir>/src/index.ts',
        '^@skaha-orc/shared/(.*)$': '<rootDir>/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
    {
      displayName: 'backend',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: 'packages/backend',
      setupFiles: ['<rootDir>/test/setup.ts'],
      moduleNameMapper: {
        '^@skaha-orc/shared$': '<rootDir>/../shared/src/index.ts',
        '^@skaha-orc/shared/(.*)$': '<rootDir>/../shared/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
    {
      displayName: 'frontend',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      rootDir: 'packages/frontend',
      moduleNameMapper: {
        '^@skaha-orc/shared$': '<rootDir>/../shared/src/index.ts',
        '^@skaha-orc/shared/(.*)$': '<rootDir>/../shared/src/$1',
        '^@/(.*)$': '<rootDir>/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'packages/frontend/tsconfig.json' }],
      },
    },
  ],
};

export default config;
