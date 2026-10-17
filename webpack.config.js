const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { readEnvFile, buildVariable } = require('./scripts/buildEnv');

const envFile = readEnvFile(path.join(__dirname, '.env'));

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: './src/renderer/index.tsx',
  target: 'electron-renderer',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(woff|woff2|ttf|eot)$/,
        type: 'asset/inline', // Embed fonts as data URLs (base64)
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'renderer.js',
    path: path.resolve(__dirname, 'dist/renderer'),
  },
  plugins: [
    // CARTO basemap key, from the environment at build time (GitHub secret in CI), else .env
    new webpack.DefinePlugin({
      __CARTO_API_KEY__: JSON.stringify(buildVariable('CARTO_API_KEY', process.env, envFile)),
    }),
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
    }),
  ],
};
