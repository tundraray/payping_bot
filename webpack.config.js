const path = require('node:path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (options) => {
  return {
    ...options,
    plugins: [
      ...options.plugins,
      new CopyPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, 'libs/telegram/src/locales'),
            to: path.resolve(__dirname, 'dist/locales'),
          },
        ],
      }),
    ],
  };
};
