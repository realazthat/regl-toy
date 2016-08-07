
const nunjucks = require('nunjucks');
const querystring = require('querystring');
const $ = require('jquery-browserify');
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float'],
  optionalExtensions: ['EXT_disjoint_timer_query'],
  profile: true
});

const regltoy = require('./regl-toy.js');

let apikey = 'rt8tw8';

function createFbo ({regl, width, height}) {
  return regl.framebuffer({
    color: regl.texture({
      width: width,
      height: height,
      stencil: false,
      format: 'rgba',
      type: 'uint8',
      depth: false,
      wrap: 'clamp',
      mag: 'nearest',
      min: 'nearest'
    }),
    width: width,
    height: height,
    depth: false,
    stencil: false,
    depthStencil: false,
    depthTexture: false,
    colorType: 'uint8',
    colorFormat: 'rgba'
  });
}

let resultTemplate = `
  <tr>
    <td>{{Shader.info.date}}</td>
    <td>{{Shader.inputs}}</td>
    <td><button class="shader-id">{{Shader.info.id}}</button></td>
    <td>{{Shader.info.name}}</td>
    <td>{{Shader.info.description}}</td>
    <td>{{Shader.info.tags | join(', ')}}</td>
    <td>{{Shader.info.likes}}</td>
    <td>{{Shader.info.viewed}}</td>
  </tr>
`;

function loadShaderResources ({regl, shader}) {
  return new Promise(function (resolve, reject) {
    let manifest = regltoy.makeManifest({regl, shader});
    if (Object.keys(manifest).length === 0) {
      return resolve({shader});
    }
    console.log('manifest:', manifest);

    resl({
      manifest,
      onDone: function (resources) {
        regltoy.attachResources({shader, resources});

        return resolve({shader});
      },
      onError: function (err) {
        return reject(err);
      }
    });
  });
}

$(document).ready(function () {
  // {shader id => shadertoy json object}
  let knownShaders = {};
  let loaded = {};

  let [width, height] = [256, 256];

  // TODO: make regl.onDone go here.
  let fbo = createFbo({regl, width, height});

  regl.frame(function ({time}) {
    regl.clear({
      color: [0, 0, 0, 0],
      depth: 1
    });

    if (loaded.shader === undefined || loaded.shader === null) {
      return;
    }

    let shader = loaded.shader;

    let lastPassIndex = shader.Shader.renderpass.length - 1;
    for (let passIndex = 0; passIndex < shader.Shader.renderpass.length; ++passIndex) {
      let renderpass = shader.Shader.renderpass[passIndex];

      if (!renderpass.draw) {
        console.log(`compiling renderpass ${passIndex}`);

        renderpass.draw = regl({
          vert: regltoy.shader.vert({shader, passIndex}),
          frag: regltoy.shader.frag({shader, passIndex}),
          attributes: {
            a_position: regltoy.verts,
            a_uv: regltoy.uvs
          },
          elements: regltoy.indices,
          uniforms: {
            iResolution: regl.prop('iResolution'),
            iMouse: regl.prop('iMouse'),
            iGlobalTime: regl.prop('iGlobalTime'),
            iDate: regl.prop('iDate'),
            u_clip_y: 1,
            framebuffer: regl.prop('fbo')
          }
        });
      }
      // let iResolution = [width,height, /* pixel aspect ratio */ 1.0];
      // let iMouse = [width / 2, height / 2];

      let iResolution = [1.0, 1.0, /* pixel aspect ratio */ 1.0];
      let iMouse = [1 / 2, 1 / 2, 1 / 2, 1 / 2];
      let iGlobalTime = time;

      let d = new Date();
      let iDate = [d.year, d.month, d.day, d.hour * 60 * 60 + d.minute * 60 + d.second];

      console.log(`drawing renderpass ${passIndex}`);
      renderpass.draw({ iResolution, iMouse, iGlobalTime, iDate,
                        fbo: passIndex === lastPassIndex ? null : fbo});
    }
  });

  $(window).on('hashchange', function () {
    if (window.location.hash.length === 0) {
      $('#search-results tr:gt(0)').remove();
      loaded.shader = null;
      return;
    }
    let paramsstr = window.location.hash.slice(1);

    let params = querystring.parse(paramsstr);

    if (params.q !== undefined) {
      commenceSearch({params});
    } else {
      displayShader({shaderID: paramsstr})
        .catch(function (err) {
          console.error('An error occured: ' + err);
          $('#notification-area').text('An error occured: ' + err);
        });
    }
  });

  $('#search-query').on('change', function () {
    // indicate that we are searching by fading out the results
    $('#search-results').fadeTo(100, 0.5);

    window.location.hash = '#q=' + encodeURIComponent($('#search-query').val());
  });

  function commenceSearch ({params}) {
    let query = encodeURIComponent(params.q);

    let page = 0;
    let perpage = 20;
    $.ajax(`https://www.shadertoy.com/api/v1/shaders/query/${query}?key=${apikey}`)
      .done(function (data) {
        console.log('data:', data);

        if (data.Shaders === 0) {
          data.Results = [];
        }

        // let pages = Math.ceil(data.Results.length / perpage);
        let Results = data.Results.slice(page * perpage, page * perpage + perpage);

        loadShaders({shaderIDs: Results})
          .then(function (shaders) {
            // fade the results table back in.
            $('#search-results').fadeTo(100, 1);

            // remove all the old results.
            $('#search-results tr:gt(0)').remove();

            for (let shader of shaders) {
              console.log(shader);
              let $tr = $(nunjucks.renderString(resultTemplate, shader)).appendTo($('#search-results > tbody'));

              $tr.find('.shader-id').on('click', function () {
                window.location.hash = '#' + encodeURIComponent(shader.Shader.info.id);
              });
            }
          })
          .catch(function (err) {
            console.error('An error occured: ' + err);
            $('#notification-area').text('An error occured: ' + err);
          });
      })
      .fail(function (err) {
        console.error('An error occured: ' + err);
        $('#notification-area').text('An error occured: ' + err);
      });
  }

  function loadShaders ({shaderIDs}) {
    return new Promise(function (resolve, reject) {
      let promises = shaderIDs.map(function (shaderID) {
        return $.ajax(`https://www.shadertoy.com/api/v1/shaders/${shaderID}?key=${apikey}`);
      });

      // get the data for each of all the shaders
      Promise.all(promises)
        .then(function (values) {
          let shaders = [];

          for (let shader of values) {
            shader.Shader.info.date = new Date(shader.Shader.info.date).toDateString();
            let inputs = shader.Shader.renderpass.reduce((lhs, rhs) => lhs + rhs.inputs.length, 0);
            shader.Shader.inputs = inputs;

            knownShaders[shader.Shader.info.id] = shader;
            shaders.push(shader);
          }
          return resolve(shaders);
        }) // Promise.all();
        .catch(function (err) {
          return reject(err);
        });
    }); // new Promise()
  }

  function displayShader ({shaderID}) {
    return new Promise(function (resolve, reject) {
      if (shaderID === null) {
        loaded.shader = null;
        return resolve();
      }

      if (knownShaders[shaderID] !== undefined) {
        let shader = knownShaders[shaderID];

        loadShaderResources({shader})
          .then(function ({shader}) {
            loaded.shader = shader;
            return resolve();
          })
          .catch(function (err) {
            return reject(err);
          });
      }

      loadShaders({shaderIDs: [shaderID]})
        .then(function ([shader]) {
          return loadShaderResources({shader})
            .then(function ({shader}) {
              loaded.shader = shader;
              return resolve();
            });
        })
        .catch(function (err) {
          return reject(err);
        });
    });
  }

  $(window).trigger('hashchange');
});
