import { ATLAS_COLS } from "./motifs"
import { FLOATS_PER_BUBBLE, MAX_BUBBLES } from "./bubbles"
import { BLIT_FRAG, BUBBLE_FRAG, BUBBLE_VERT, LENS_FRAG, QUAD_VERT } from "./shaders"

export type LensState = {
  /** Center in CSS px, y measured downward. */
  x: number
  y: number
  radius: number
  flat: number
  thickness: number
  disperse: number
  caustic: number
  presence: number
  time: number
}

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
const STRIDE = FLOATS_PER_BUBBLE * 4

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)
  if (!sh) throw new Error("createShader failed")
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`shader compile failed: ${log}`)
  }
  return sh
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()
  if (!p) throw new Error("createProgram failed")
  const v = compile(gl, gl.VERTEX_SHADER, vs)
  const f = compile(gl, gl.FRAGMENT_SHADER, fs)
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p)
    gl.deleteProgram(p)
    throw new Error(`program link failed: ${log}`)
  }
  return p
}

function uniforms(gl: WebGL2RenderingContext, p: WebGLProgram, names: string[]) {
  const out: Record<string, WebGLUniformLocation | null> = {}
  for (const n of names) out[n] = gl.getUniformLocation(p, n)
  return out
}

/**
 * Three passes per frame:
 *   1. blit the 2D scene canvas into an offscreen buffer
 *   2. composite the bubbles into that same buffer
 *   3. draw the buffer to the screen through the lens
 *
 * Order matters: because the bubbles land in the buffer *before* the lens pass, the
 * puck refracts them along with the type and the logo, which is what you'd get
 * from a single layer effect over the whole view.
 *
 * Ported from the reference intro. The one structural change: the motif atlas is
 * INJECTED rather than built here, so a theme flip can hand over a repainted atlas
 * (`setAtlas`) without tearing down the GL context.
 */
export class GlassRenderer {
  private gl: WebGL2RenderingContext
  private quadBuf: WebGLBuffer
  private instanceBuf: WebGLBuffer

  private blitProg: WebGLProgram
  private lensProg: WebGLProgram
  private bubbleProg: WebGLProgram

  private blitU: Record<string, WebGLUniformLocation | null>
  private lensU: Record<string, WebGLUniformLocation | null>
  private bubbleU: Record<string, WebGLUniformLocation | null>

  private fullVao: WebGLVertexArrayObject
  private bubbleVao: WebGLVertexArrayObject

  private sceneTex: WebGLTexture
  private fboTex: WebGLTexture
  private fbo: WebGLFramebuffer
  private atlasTex: WebGLTexture

  private widthPx = 1
  private heightPx = 1
  private dpr = 1
  private disposed = false

  constructor(private canvas: HTMLCanvasElement, atlas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    })
    if (!gl) throw new Error("WebGL2 is not available")
    this.gl = gl

    this.blitProg = program(gl, QUAD_VERT, BLIT_FRAG)
    this.lensProg = program(gl, QUAD_VERT, LENS_FRAG)
    this.bubbleProg = program(gl, BUBBLE_VERT, BUBBLE_FRAG)

    this.blitU = uniforms(gl, this.blitProg, ["uSrc"])
    this.lensU = uniforms(gl, this.lensProg, [
      "uScene", "uRes", "uPuck", "uFlat", "uThickness",
      "uDisperse", "uCaustic", "uPresence", "uTime",
    ])
    this.bubbleU = uniforms(gl, this.bubbleProg, ["uRes", "uAtlas", "uAtlasCols", "uTime", "uDroplet"])

    const quadBuf = gl.createBuffer()
    const instanceBuf = gl.createBuffer()
    if (!quadBuf || !instanceBuf) throw new Error("createBuffer failed")
    this.quadBuf = quadBuf
    this.instanceBuf = instanceBuf

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf)
    gl.bufferData(gl.ARRAY_BUFFER, MAX_BUBBLES * STRIDE, gl.DYNAMIC_DRAW)

    // Fullscreen VAO
    const fullVao = gl.createVertexArray()
    if (!fullVao) throw new Error("createVertexArray failed")
    this.fullVao = fullVao
    gl.bindVertexArray(this.fullVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    // Instanced bubble VAO
    const bubbleVao = gl.createVertexArray()
    if (!bubbleVao) throw new Error("createVertexArray failed")
    this.bubbleVao = bubbleVao
    gl.bindVertexArray(this.bubbleVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE, 0)
    gl.vertexAttribDivisor(1, 1)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE, 16)
    gl.vertexAttribDivisor(2, 1)
    gl.bindVertexArray(null)

    this.sceneTex = this.makeTexture()
    this.fboTex = this.makeTexture()
    this.atlasTex = this.makeTexture()

    const fbo = gl.createFramebuffer()
    if (!fbo) throw new Error("createFramebuffer failed")
    this.fbo = fbo

    this.setAtlas(atlas)

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
  }

  private makeTexture(): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()
    if (!tex) throw new Error("createTexture failed")
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  /** Uploads a motif atlas. Called again with a repainted one on a theme change. */
  setAtlas(atlas: HTMLCanvasElement) {
    if (this.disposed) return
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
  }

  resize(cssW: number, cssH: number, dpr: number) {
    const gl = this.gl
    const w = Math.max(1, Math.round(cssW * dpr))
    const h = Math.max(1, Math.round(cssH * dpr))
    if (w === this.widthPx && h === this.heightPx && dpr === this.dpr) return

    this.widthPx = w
    this.heightPx = h
    this.dpr = dpr
    this.canvas.width = w
    this.canvas.height = h

    gl.bindTexture(gl.TEXTURE_2D, this.fboTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Upload the 2D scene. Flipped on upload so texels line up with gl_FragCoord. */
  uploadScene(source: HTMLCanvasElement) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
  }

  render(
    lens: LensState,
    bubbles: Float32Array,
    bubbleCount: number,
    droplet: readonly [number, number, number],
  ) {
    if (this.disposed) return
    const gl = this.gl
    const { widthPx: w, heightPx: h, dpr } = this

    gl.viewport(0, 0, w, h)

    // Pass 1 — scene into the offscreen buffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.disable(gl.BLEND)
    gl.useProgram(this.blitProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex)
    gl.uniform1i(this.blitU.uSrc, 0)
    gl.bindVertexArray(this.fullVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // Pass 2 — bubbles on top of it, premultiplied.
    if (bubbleCount > 0) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(this.bubbleProg)
      gl.uniform2f(this.bubbleU.uRes, w, h)
      gl.uniform1f(this.bubbleU.uAtlasCols, ATLAS_COLS)
      gl.uniform1f(this.bubbleU.uTime, lens.time)
      gl.uniform3f(this.bubbleU.uDroplet, droplet[0], droplet[1], droplet[2])
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex)
      gl.uniform1i(this.bubbleU.uAtlas, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, bubbles, 0, bubbleCount * FLOATS_PER_BUBBLE)
      gl.bindVertexArray(this.bubbleVao)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bubbleCount)
      gl.disable(gl.BLEND)
    }

    // Pass 3 — to the screen, through the lens.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(this.lensProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex)
    gl.uniform1i(this.lensU.uScene, 0)
    gl.uniform2f(this.lensU.uRes, w, h)
    gl.uniform3f(this.lensU.uPuck, lens.x * dpr, h - lens.y * dpr, lens.radius * dpr)
    gl.uniform1f(this.lensU.uFlat, lens.flat)
    gl.uniform1f(this.lensU.uThickness, lens.thickness * dpr)
    gl.uniform1f(this.lensU.uDisperse, lens.disperse)
    gl.uniform1f(this.lensU.uCaustic, lens.caustic)
    gl.uniform1f(this.lensU.uPresence, lens.presence)
    gl.uniform1f(this.lensU.uTime, lens.time)
    gl.bindVertexArray(this.fullVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    gl.deleteProgram(this.blitProg)
    gl.deleteProgram(this.lensProg)
    gl.deleteProgram(this.bubbleProg)
    gl.deleteBuffer(this.quadBuf)
    gl.deleteBuffer(this.instanceBuf)
    gl.deleteVertexArray(this.fullVao)
    gl.deleteVertexArray(this.bubbleVao)
    gl.deleteTexture(this.sceneTex)
    gl.deleteTexture(this.fboTex)
    gl.deleteTexture(this.atlasTex)
    gl.deleteFramebuffer(this.fbo)
    gl.getExtension("WEBGL_lose_context")?.loseContext()
  }
}

