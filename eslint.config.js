import {defineConfig} from 'eslint/config';
import gnome from 'eslint-config-gnome';
import tseslint from 'typescript-eslint';

// Rules gnome-shell-extensions adds on top of the GNOME recommended set.
const shellExtensionRules = {
    camelcase: ['error', {properties: 'never'}],
    'consistent-return': 'error',
    'eqeqeq': ['error', 'smart'],
    'key-spacing': ['error', {mode: 'minimum', beforeColon: false, afterColon: true}],
    'max-len': ['error', {code: 200, ignoreUrls: true}],
    'prefer-arrow-callback': 'error',
    'prefer-const': ['error', {destructuring: 'all'}],
};

const gjsGlobals = {
    global: 'readonly',
};

export default defineConfig([
    {
        ignores: ['node_modules/**', 'build/**', 'venv/**', 'dist/**/*.d.ts'],
    },
    {
        files: ['dist/**/*.js'],
        extends: [gnome.configs.recommended],
        languageOptions: {ecmaVersion: 'latest', sourceType: 'module', globals: gjsGlobals},
        rules: shellExtensionRules,
    },
    {
        files: ['src/**/*.ts'],
        extends: [gnome.configs.recommended, tseslint.configs.recommended],
        languageOptions: {ecmaVersion: 'latest', sourceType: 'module', globals: gjsGlobals},
        rules: {
            ...shellExtensionRules,
            // TypeScript-aware replacements for core rules that misread type syntax.
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
            'no-shadow': 'off',
            '@typescript-eslint/no-shadow': 'error',
            // A value import that is only used as a type would survive in the emitted JS unused.
            '@typescript-eslint/consistent-type-imports': ['error', {fixStyle: 'inline-type-imports'}],
            'no-extra-parens': 'off',
            'no-undef': 'off',
            'no-use-before-define': 'off',
        },
    },
    {
        // GJS smoke scripts run with `gjs -m`; they never ship.
        files: ['tools/**/*.js'],
        extends: [gnome.configs.recommended],
        languageOptions: {ecmaVersion: 'latest', sourceType: 'module', globals: gjsGlobals},
        rules: {
            ...shellExtensionRules,
            'no-await-in-loop': 'off',
        },
    },
    {
        files: ['tools/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'],
        extends: [gnome.configs.recommended],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {process: 'readonly', console: 'readonly', URL: 'readonly'},
        },
        rules: {
            ...shellExtensionRules,
            'no-await-in-loop': 'off',
        },
    },
]);
