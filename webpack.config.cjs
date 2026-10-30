const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/module.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'module.js',
    library: { type: 'amd' },
    clean: true,
    publicPath: 'auto',
  },
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  module: {
    rules: [{ test: /\.tsx?$/, use: { loader: 'ts-loader', options: { compilerOptions: { noEmit: false } } }, exclude: /node_modules/ }],
  },
  externals: [
    ({ request }, callback) => {
      if (request === 'react' || request === 'react-dom' || request === '@grafana/data' || request === '@grafana/ui') {
        callback(null, 'amd ' + request);
        return;
      }
      callback();
    },
  ],
  plugins: [new CopyPlugin({ patterns: [{ from: 'src/plugin.json', to: 'plugin.json' }, { from: 'src/img', to: 'img' }] })],
};
