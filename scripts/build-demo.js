
var builder = require('./build-a-demo.js');

const BUILDDIR = './www/regl-toy-demo/';
const MAINJSFILE = 'regl-toy-demo.js';
// const MAINHTMLFILE = undefined;
// const TITLE = undefined;

builder.buildADemo({
  BUILDDIR, MAINJSFILE,
  assets: [
    'regl-toy-demo.html',
    'regl-toy-demo.css'
  ]
});
