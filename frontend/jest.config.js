module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  transform: {
    "^.+\\.[tj]sx?$": "babel-jest",
  },
  moduleFileExtensions: ["js", "jsx", "json"],
  testMatch: ["<rootDir>/tests/unit/**/*.test.js"],
  moduleDirectories: ["node_modules", "src"],
};
