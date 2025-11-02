module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  transform: {},
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
};
