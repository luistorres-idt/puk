import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';

const sourceFiles = ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'];
const workspaceRoot = process.cwd();
const apiRoot = resolve(workspaceRoot, 'apps/api');
const webRoot = resolve(workspaceRoot, 'apps/web');
const appsRoot = resolve(workspaceRoot, 'apps');
const packagesRoot = resolve(workspaceRoot, 'packages');

function isWithin(candidatePath, directoryPath) {
  const relativePath = relative(directoryPath, candidatePath);
  return (
    relativePath === '' ||
    (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
}

function resolveImportPath(filename, importSource) {
  if (importSource.startsWith('.')) {
    return resolve(dirname(filename), importSource);
  }

  if (importSource.startsWith('@/')) {
    return resolve(webRoot, 'src', importSource.slice(2));
  }

  if (importSource.startsWith('@api/')) {
    return resolve(apiRoot, 'src', importSource.slice(5));
  }

  return undefined;
}

function findModulePath(filePath, applicationRoot) {
  const modulesRoot = resolve(applicationRoot, 'src/modules');

  if (!isWithin(filePath, modulesRoot)) {
    return undefined;
  }

  const [moduleName, ...privateSegments] = relative(modulesRoot, filePath).split(sep);
  return { moduleName, privateSegments };
}

const moduleBoundariesPlugin = {
  rules: {
    enforce: {
      create(context) {
        return {
          ImportDeclaration(node) {
            const filename = context.filename;
            const targetPath = resolveImportPath(filename, node.source.value);

            if (targetPath === undefined) {
              return;
            }

            const crossesApplications =
              (isWithin(filename, apiRoot) && isWithin(targetPath, webRoot)) ||
              (isWithin(filename, webRoot) && isWithin(targetPath, apiRoot));
            const packageImportsApplication =
              isWithin(filename, packagesRoot) && isWithin(targetPath, appsRoot);

            if (crossesApplications || packageImportsApplication) {
              context.report({
                message: 'Import crosses an application or package boundary.',
                node,
              });
              return;
            }

            const applicationRoot = isWithin(filename, apiRoot)
              ? apiRoot
              : isWithin(filename, webRoot)
                ? webRoot
                : undefined;

            if (applicationRoot === undefined) {
              return;
            }

            const sourceModule = findModulePath(filename, applicationRoot);
            const targetModule = findModulePath(targetPath, applicationRoot);

            if (
              targetModule !== undefined &&
              (sourceModule === undefined || sourceModule.moduleName !== targetModule.moduleName) &&
              targetModule.privateSegments.length > 0 &&
              !targetModule.privateSegments[0].startsWith('index.')
            ) {
              context.report({
                message: 'Import another module through its public index.ts.',
                node,
              });
            }
          },
        };
      },
      meta: {
        schema: [],
        type: 'problem',
      },
    },
  },
};

export default typescriptEslint.config(
  {
    ignores: [
      '**/coverage/**',
      '**/cdk.out/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/src/generated/**',
      '**/test-results/**',
    ],
  },
  eslint.configs.recommended,
  ...typescriptEslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: sourceFiles,
    plugins: {
      local: moduleBoundariesPlugin,
    },
    rules: {
      'local/enforce': 'error',
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/*/*'],
              message: 'Import a frontend module through its public index.ts.',
            },
            {
              group: ['@api/modules/*/*'],
              message: 'Import an API module through its public index.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '*.config.{js,mjs,ts}',
      'apps/api/**/*.ts',
      'infra/**/*.{js,mjs,ts}',
      'packages/**/*.{js,ts}',
      'scripts/**/*.{js,mjs}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['infra/scripts/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,vue}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.vue'],
        parser: typescriptEslint.parser,
      },
    },
  },
  eslintConfigPrettier,
);
