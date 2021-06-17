const path = require('path');
module.exports = {
  entry: './src/index.js',
  mode: 'development',
  output: {
    filename: 'exif.js',
    path: path.resolve(__dirname, 'dist'),
    library: "exif",
    libraryTarget: "umd"
  },
};
