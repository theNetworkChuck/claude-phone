// ESLint flat config for ES5-style CommonJS JavaScript
module.exports = [
  {
    ignores: [
      'node_modules/**',
      'voice-app/node_modules/**',
      'claude-api-server/node_modules/**',
      'voice-app/audio/**',
      '*.md',
      '**/INTEGRATION-EXAMPLE.js'  // Example snippets, not complete code
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly'  // Node 18+ global fetch
      }
    },
    rules: {
      // Errors - things that will cause bugs
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',

      // Warnings - code quality
      'no-console': 'off',  // Console is fine for this project
      'prefer-const': 'warn',
      'no-var': 'off',  // ES5 style uses var
      'eqeqeq': ['warn', 'smart'],

      // Style - keep it readable (lenient for existing codebase)
      'semi': ['warn', 'always'],
      'quotes': 'off',  // Mixed quote styles in existing code
      'indent': 'off',  // Existing code uses various indentation
      'comma-dangle': 'off'  // Existing code uses trailing commas
    }
  }
];
