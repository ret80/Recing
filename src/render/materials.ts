import { Color, Program, type OGLRenderingContext } from 'ogl';

const litVertex = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat3 normalMatrix;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewNormal;
void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewNormal = normalize(normalMatrix * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const litFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;
uniform float uEmissive;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewNormal;
void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, normalize(uSunDir)), 0.0);
  float wrap = max(dot(n, normalize(uSunDir)) * 0.5 + 0.5, 0.0);
  float light = uAmbient.r + diffuse * 0.75 + wrap * 0.18;
  vec3 base = uColor * (1.0 - uEmissive) + uColor * uEmissive;
  vec3 color = base * light;
  float viewDot = max(dot(n, normalize(-vWorldPos + vec3(0.0))), 0.0);
  color += vec3(0.05) * viewDot;
  vec4 cameraPos = vec4(0.0);
  // туман по расстоянию до камеры, аппроксимация через глубину
  float fogFactor = smoothstep(uFogNear, uFogFar, length(vWorldPos));
  color = mix(color, uFogColor, fogFactor * 0.65);
  gl_FragColor = vec4(color, uOpacity);
}
`;

export type LitOptions = {
  emissive?: number;
  opacity?: number;
  fogNear?: number;
  fogFar?: number;
};

export type LightUniforms = {
  sunDir: Float32Array;
  sunColor: Float32Array;
  ambient: Float32Array;
  fogColor: Float32Array;
  fogNear: number;
  fogFar: number;
};

/** Палитра освещения. */
export const DEFAULT_LIGHTING: LightUniforms = {
  sunDir: new Float32Array([0.45, 0.8, 0.35]),
  sunColor: new Float32Array([1.0, 0.93, 0.82]),
  ambient: new Float32Array([0.38, 0.36, 0.34]),
  fogColor: new Float32Array([0.72, 0.58, 0.42]),
  fogNear: 90,
  fogFar: 380,
};

export class MaterialCache {
  private gl: OGLRenderingContext;
  private cache = new Map<string, Program>();
  private lighting: LightUniforms;

  constructor(gl: OGLRenderingContext, lighting: LightUniforms = DEFAULT_LIGHTING) {
    this.gl = gl;
    this.lighting = lighting;
  }

  setLighting(lighting: LightUniforms): void {
    this.lighting = lighting;
    for (const program of this.cache.values()) {
      program.uniforms.uSunDir.value = lighting.sunDir;
      program.uniforms.uSunColor.value = lighting.sunColor;
      program.uniforms.uAmbient.value = lighting.ambient;
      program.uniforms.uFogColor.value = lighting.fogColor;
      program.uniforms.uFogNear.value = lighting.fogNear;
      program.uniforms.uFogFar.value = lighting.fogFar;
    }
  }

  lit(color: number, options: LitOptions = {}): Program {
    const key = `${color}:${options.emissive ?? 0}:${options.opacity ?? 1}:${options.fogNear ?? ''}:${options.fogFar ?? ''}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const c = new Color(color);
    const program = new Program(this.gl, {
      vertex: litVertex,
      fragment: litFragment,
      transparent: (options.opacity ?? 1) < 1,
      depthWrite: (options.opacity ?? 1) >= 0.99,
      cullFace: false,
      uniforms: {
        uColor: { value: new Float32Array([c.r, c.g, c.b]) },
        uSunDir: { value: this.lighting.sunDir },
        uSunColor: { value: this.lighting.sunColor },
        uAmbient: { value: this.lighting.ambient },
        uFogColor: { value: this.lighting.fogColor },
        uFogNear: { value: options.fogNear ?? this.lighting.fogNear },
        uFogFar: { value: options.fogFar ?? this.lighting.fogFar },
        uOpacity: { value: options.opacity ?? 1 },
        uEmissive: { value: options.emissive ?? 0 },
      },
    });
    this.cache.set(key, program);
    return program;
  }
}

export function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}
