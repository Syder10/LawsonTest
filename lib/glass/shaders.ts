/**
 * All shader math works in GL pixel space: origin bottom-left, y up.
 * The CPU converts CSS y (down) to GL y (up) before uploading uniforms, and the
 * scene canvas is uploaded with UNPACK_FLIP_Y_WEBGL so its texels line up with
 * gl_FragCoord. One convention, converted once.
 *
 * Ported from the reference intro at ~/Desktop/wabi-intro. THE MATH IS UNCHANGED —
 * the superellipse profile, the spectral loop, the specular terms and the caustic
 * are the reference's. The one edit is that the bare-droplet base colour became a
 * uniform (`uDroplet`) instead of a hardcoded cream, so droplets follow the theme;
 * a warm off-white droplet on a dark emerald page read as a smudge.
 */

export const QUAD_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aQuad;
out vec2 vUv;
void main() {
  vUv = aQuad * 0.5 + 0.5;
  gl_Position = vec4(aQuad, 0.0, 1.0);
}`

export const BLIT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
out vec4 fragColor;
void main() { fragColor = vec4(texture(uSrc, vUv).rgb, 1.0); }`

/* ------------------------------------------------------------------ *
 * The lens.
 *
 * A superellipse height field h(d) = (1 - d^n)^(1/n) over the puck.
 *   n = 2   -> hemisphere
 *   n = 9   -> flat top, near-vertical bevel at the rim
 * Refraction offset is proportional to the slope of that height field, so the
 * flat middle magnifies gently and the bevel shears hard. Where the slope
 * exceeds the distance to the rim the image folds back on itself, which is what
 * produces the mirrored double-image you see in real thick glass.
 *
 * Dispersion is a spectral loop: each tap samples at a slightly different
 * refraction magnitude and is weighted by a cosine RGB basis. Because the
 * weights are normalised, flat areas stay neutral and only edges fringe.
 * ------------------------------------------------------------------ */
export const LENS_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform vec2  uRes;        // drawing buffer size, px
uniform vec3  uPuck;       // center.x, center.y (GL px), radius px
uniform float uFlat;       // 0 = soft dome, 1 = flat-topped puck
uniform float uThickness;  // refraction strength, px
uniform float uDisperse;   // spectral spread, 0..1
uniform float uCaustic;    // blue bloom at the trailing rim
uniform float uPresence;   // global fade of the whole lens
uniform float uTime;

const float TAU = 6.28318530718;
const int   TAPS = 14;

vec3 spectrum(float t) {
  vec3 c = 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, -0.3333333, -0.6666667)));
  return c * c;
}

void lensProfile(float d, float n, out float h, out float slope) {
  float dn   = pow(d, n);
  float base = max(1.0 - dn, 1e-5);
  h     = pow(base, 1.0 / n);
  slope = pow(d, n - 1.0) * pow(base, 1.0 / n - 1.0);
}

void main() {
  vec2 p    = vUv * uRes;
  vec3 base = texture(uScene, vUv).rgb;
  vec3 col  = base;

  float R   = max(uPuck.z, 1.0);
  vec2  rel = p - uPuck.xy;
  float len = length(rel);
  float d   = len / R;

  // Contact shadow: the puck sits above the surface, light from up-left, so the
  // occlusion pools slightly down-right of the silhouette.
  float sd     = length(p - (uPuck.xy + vec2(3.0, -8.0))) / R;
  float shadow = 1.0 - smoothstep(0.92, 1.42, sd);

  if (d < 1.0 && uPresence > 0.001) {
    vec2  dir = len > 1e-4 ? rel / len : vec2(0.0, 1.0);
    float n   = mix(2.8, 9.0, uFlat);
    float h, slope;
    lensProfile(d, n, h, slope);
    slope = min(slope, 9.0);

    vec2 offset = (dir * slope * uThickness) / uRes;

    vec3 acc = vec3(0.0), wsum = vec3(0.0);
    for (int i = 0; i < TAPS; i++) {
      float t = (float(i) + 0.5) / float(TAPS);
      float k = mix(1.0 - uDisperse, 1.0 + uDisperse, t);
      vec3  w = spectrum(t);
      acc  += texture(uScene, clamp(vUv - offset * k, 0.0, 1.0)).rgb * w;
      wsum += w;
    }
    vec3 glass = acc / max(wsum, vec3(1e-4));

    // Glass gathers a little light and drinks a little saturation.
    glass = mix(glass, vec3(dot(glass, vec3(0.299, 0.587, 0.114))), 0.05) * 1.025;

    vec3  nrm  = normalize(vec3(dir * slope * 0.35, 1.0));
    float key  = pow(max(dot(nrm, normalize(vec3(-0.50,  0.85, 0.62))), 0.0), 34.0);
    float fill = pow(max(dot(nrm, normalize(vec3( 0.35, -0.90, 0.45))), 0.0), 72.0);
    float fres = pow(1.0 - nrm.z, 2.5);

    glass += vec3(1.0) * (key * 0.55 + fill * 0.34 + fres * 0.10);

    // Caustic: light pooling in the lower bevel, hue drifting across the arc.
    float ring  = smoothstep(0.52, 0.95, d) * (1.0 - smoothstep(0.955, 1.0, d));
    float lower = smoothstep(-0.20, 0.85, -dir.y);
    float hue   = 0.5 + 0.5 * sin(dir.x * 2.4 + uTime * 0.7);
    vec3  cc    = mix(vec3(0.10, 0.36, 1.0), vec3(0.16, 0.86, 0.95), hue);
    glass += cc * ring * lower * uCaustic * 1.7;

    float aa     = clamp(1.6 / R, 0.0005, 0.2);
    float inside = 1.0 - smoothstep(1.0 - aa, 1.0, d);
    col = mix(col, glass, inside * uPresence);
    shadow *= 1.0 - inside;
  }

  col *= 1.0 - shadow * 0.11 * uPresence;
  fragColor = vec4(col, 1.0);
}`

/* ------------------------------------------------------------------ *
 * Effervescing bubbles: instanced quads, one per bubble, drawn into the scene
 * buffer *before* the lens pass so the puck refracts them too.
 * ------------------------------------------------------------------ */
export const BUBBLE_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aBubble;  // x, y (GL px), radius px, motif index
layout(location = 2) in vec3 aMeta;    // alpha, seed, motifStrength

uniform vec2 uRes;

out vec2  vLocal;
out float vMotif;
out float vAlpha;
out float vSeed;
out float vMotifMix;

const float PAD = 1.22;

void main() {
  vLocal    = aQuad * PAD;
  vMotif    = aBubble.w;
  vAlpha    = aMeta.x;
  vSeed     = aMeta.y;
  vMotifMix = aMeta.z;
  vec2 px   = aBubble.xy + aQuad * aBubble.z * PAD;
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
}`

export const BUBBLE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2  vLocal;
in float vMotif;
in float vAlpha;
in float vSeed;
in float vMotifMix;

uniform sampler2D uAtlas;
uniform float uAtlasCols;
uniform float uTime;
uniform vec3  uDroplet;   // base colour of a bare droplet (theme-driven)

out vec4 fragColor;

const float TAU  = 6.28318530718;
const int   TAPS = 8;

vec3 spectrum(float t) {
  vec3 c = 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, -0.3333333, -0.6666667)));
  return c * c;
}

vec2 atlasUv(vec2 local, float index) {
  float cols = uAtlasCols;
  float col  = mod(index, cols);
  float row  = floor(index / cols);
  // local is GL-space (y up); the atlas rows run y-down, so flip y here.
  vec2  cell = (clamp(vec2(local.x, -local.y) * 0.5 + 0.5, 0.0, 1.0) + vec2(col, row)) / cols;
  return cell;
}

void main() {
  float d = length(vLocal);
  if (d > 1.16) discard;

  float z   = sqrt(max(1.0 - min(d * d, 1.0), 0.0));
  vec2  dir = d > 1e-4 ? vLocal / d : vec2(0.0, 1.0);
  vec3  nrm = vec3(vLocal, z);

  // Sphere refraction: compress the interior toward the rim so the motif reads
  // magnified in the middle and smeared into a ring at the edge.
  float bend = 1.0 - 0.55 * (1.0 - z);
  vec2  iuv  = vLocal * bend * 1.35;

  float disp = 0.10 + 0.16 * (1.0 - z);
  vec3 acc = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float t = (float(i) + 0.5) / float(TAPS);
    float k = mix(1.0 - disp, 1.0 + disp, t);
    vec3  w = spectrum(t);
    acc  += texture(uAtlas, atlasUv(iuv * k, vMotif)).rgb * w;
    wsum += w;
  }
  vec3 inner = acc / max(wsum, vec3(1e-4));

  // Thin-film iridescence over the whole sphere, strongest where it curves away.
  float film = 0.5 + 0.5 * sin(vSeed * 9.1 + (1.0 - z) * 7.4 + uTime * 0.5 + dir.x * 2.0);
  vec3  sheen = mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.55, 0.85), film);
  float fres  = pow(1.0 - z, 3.0);

  vec3 col = mix(uDroplet, inner, vMotifMix);
  col = mix(col, col * 0.55 + sheen * 0.75, fres * 0.85);

  // Specular: a tight highlight up-left, a broad bounce low-right.
  float key  = pow(max(dot(normalize(nrm), normalize(vec3(-0.45, 0.80, 0.42))), 0.0), 26.0);
  float bnc  = pow(max(dot(normalize(nrm), normalize(vec3( 0.40, -0.75, 0.52))), 0.0), 14.0);
  col += vec3(1.0) * key * 0.95 + vec3(1.0, 0.96, 0.92) * bnc * 0.22;

  // Bright refractive rim, then a one-pixel-ish alpha falloff.
  col += vec3(1.0) * smoothstep(0.80, 0.99, d) * (1.0 - smoothstep(0.99, 1.06, d)) * 0.35;

  float alpha = (1.0 - smoothstep(0.97, 1.05, d)) * vAlpha;
  fragColor = vec4(col * alpha, alpha);
}`





