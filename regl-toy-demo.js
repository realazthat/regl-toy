
const nunjucks = require('nunjucks');
const $ = require('jquery-browserify');
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float'],
  optionalExtensions: ['EXT_disjoint_timer_query'],
  profile: true
});

const regltoy = require('./regl-toy.js');

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

  $('#search-query').on('change', function () {
    // indicate that we are searching by fading out the results
    $('#search-results').fadeTo(100, 50);

    let query = encodeURIComponent($('#search-query').val());
    let apikey = 'rt8tw8';

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

        let promises = Results.map(function (shaderID) {
          return $.ajax(`https://www.shadertoy.com/api/v1/shaders/${shaderID}?key=${apikey}`);
        });

        // get the data for each of all the shaders
        Promise.all(promises)
          .then(function (values) {
            // fade the results table back in.
            $('#search-results').fadeTo(100, 100);

            // remove all the old results.
            $('#search-results tr:gt(0)').remove();

            for (let shader of values) {
              shader.Shader.info.date = new Date(shader.Shader.info.date).toDateString();
              let inputs = shader.Shader.renderpass.reduce((lhs, rhs) => lhs + rhs.inputs.length, 0);
              shader.Shader.inputs = inputs;

              console.log(shader);
              let $tr = $(nunjucks.renderString(resultTemplate, shader)).appendTo($('#search-results > tbody'));

              $tr.find('.shader-id').on('click', function () {
                console.log('loadShaderResources');
                console.log(shader);
                loadShaderResources({shader})
                  .then(function ({shader}) {
                    console.log('loaded');
                    console.log('shader:', shader);
                    loaded.shader = shader;
                  })
                  .catch(function (err) {
                    console.error('An error occured: ' + err);
                    $('#notification-area').text('An error occured: ' + err);
                  });
              });
            }
          });
      })
      .fail(function (err) {
        console.error('An error occured: ' + err);
        $('#notification-area').text('An error occured: ' + err);
      });
  });
});
