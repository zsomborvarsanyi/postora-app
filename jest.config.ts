import type { Config } from 'jest';

// This repo does not use Nx (no nx.json, no project.json files, no `nx`
// dependency) even though this file used to call `@nx/jest`'s
// getJestProjects() - a leftover from the upstream template that no longer
// resolves. Plain multi-package config instead, matching the @gitroom/*
// path aliases declared in tsconfig.base.json.
const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/apps/**/*.spec.ts',
    '<rootDir>/libraries/**/*.spec.ts',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    // isolatedModules: ts-jest transpiles file-by-file instead of building
    // one TypeScript "Program" over tsconfig.base.json's implicit include
    // (every .ts file in the whole monorepo) - without it, running even one
    // spec file exhausts the default Node heap.
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.base.json', isolatedModules: true },
    ],
  },
  moduleNameMapper: {
    '^@gitroom/backend/(.*)$': '<rootDir>/apps/backend/src/$1',
    '^@gitroom/frontend/(.*)$': '<rootDir>/apps/frontend/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
    '^@gitroom/nestjs-libraries/(.*)$': '<rootDir>/libraries/nestjs-libraries/src/$1',
    '^@gitroom/react/(.*)$': '<rootDir>/libraries/react-shared-libraries/src/$1',
    '^@gitroom/plugins/(.*)$': '<rootDir>/libraries/plugins/src/$1',
    '^@gitroom/orchestrator/(.*)$': '<rootDir>/apps/orchestrator/src/$1',
    '^@gitroom/extension/(.*)$': '<rootDir>/apps/extension/src/$1',
  },
};

export default config;
