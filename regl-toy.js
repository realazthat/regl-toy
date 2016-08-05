
const url = require('url');
const quad = require('glsl-quad');

function minFilter ({sampler}) {
  if (sampler.filter === 'mipmap') {
    return 'mipmap';
  }
  throw new Error(`Unknown input.filter: ${sampler.filter}`);
}

function wrap ({sampler}) {
  if (sampler.wrap === 'repeat') {
    return 'repeat';
  }
  if (sampler.wrap === 'clamp') {
    return 'clamp';
  }
  if (sampler.wrap === 'mirror') {
    return 'mirror';
  }
  throw new Error(`Unknown sampler.wrap: ${sampler.wrap}`);
}

function makeManifest ({regl, shader}) {
  let manifest = {};

  let key = 0;

  for (let renderpass of shader.Shader.renderpass) {
    for (let input of renderpass.inputs) {
      input.key = key++;
      let sampler = input.sampler;

      if (input.ctype === 'musicstream') {
        continue;
      }

      if (input.ctype === 'texture') {
        let src = url.resolve('https://www.shadertoy.com/', input.src);
        manifest[input.key] = {
          type: 'image',
          src: src,
          parser: (data) => regl.texture({
            data: data,
            mag: 'linear',
            min: minFilter({sampler}),
            flipY: input.sampler.vflip,
            wrap: wrap({sampler})
          })
        };
      } else {
        throw new Error(`Unknown input.ctype: ${input.ctype}`);
      }
    }
  }
  return manifest;
}

function attachResources ({shader, resources}) {
  for (let renderpass of shader.Shader.renderpass) {
    for (let input of renderpass.inputs) {
      if (input.ctype === 'texture') {
        let texture = resources[input.key];
        input.texture = texture;
      } else {
        throw new Error(`Unknown input.ctype: ${input.ctype}`);
      }
    }
  }
}

function frag ({shader, passIndex}) {
  let renderpass = shader.Shader.renderpass[passIndex];

  return `
    precision highp float;

    uniform vec3 iResolution;
    uniform vec4 iMouse;
    uniform vec4 iDate;
    uniform float iGlobalTime;

    ${renderpass.code}

    varying vec2 v_uv;

    void main(){
      mainImage(gl_FragColor, v_uv);
    }
  `;
}

module.exports = {
  makeManifest, attachResources, minFilter, wrap,
  verts: quad.verts,
  uvs: quad.uvs,
  indices: quad.indices,
  shader: {
    vert: ({shader, passIndex}) => quad.shader.vert,
    frag: frag
  }
};
