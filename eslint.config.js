const js = require("@eslint/js");

module.exports = [
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-empty": "warn"
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        Buffer:"readonly",structuredClone:"readonly",fetch:"readonly",AbortController:"readonly",AbortSignal:"readonly",Request:"readonly",setImmediate:"readonly",clearImmediate:"readonly",
        process: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        global: "writable",
        URL: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        Notification: "readonly"
      }
    }
  }
];
