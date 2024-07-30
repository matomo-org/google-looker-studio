/**
 * Matomo - free/libre analytics platform
 *
 * @link https://matomo.org
 * @license http://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';
import dotenvModule from 'rollup-plugin-dotenv';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const dotenv = dotenvModule.default;

// removes export statements since they are not recognized by apps script, but rollup always puts them in for esm output
const removeExports = () => {
  return {
    name: 'remove-exports',
    renderChunk(code) {
      return code.replace(/export [^;]+?;/g, '');
    },
  };
};

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
    name: 'MatomoLookerStudio',
  },
  plugins: [
    {
      transform(code, id) {
        // the commonjs rollup plugin does not handle export statements in strings well
        if (/\/mathjs\//.test(id)) {
          code = code.replace('export const path = "expression.transform"', '');
        }
        code = code.replace(/\/\*\*.*?\*\//gms, ''); // strip comments since they can have stray imports/exports
        return code;
      },
    },
    commonjs(),
    nodeResolve(),
    typescript(),
    dotenv(),
    copy({
      targets: [
        { src: 'src/appsscript.json', dest: 'dist' },
      ],
    }),
    removeExports(),
  ],
};
