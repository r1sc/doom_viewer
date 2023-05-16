import typescript from "@rollup/plugin-typescript";

export default {
    input: 'src/main.ts',
    output: {
      file: 'www/dist/bundle.js',
      format: 'iife',
      sourcemap: true
    },
    plugins: [
        typescript()
    ]
  };