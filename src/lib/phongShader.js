// phongShader.js — shader "caixa de vidro" do visor Phong.
// Faz, por pixel, exatamente as contas de src/lib/phong.js. A saída não passa por
// conversão de espaço de cor nem tone mapping: o valor do pixel é o da fórmula.

export const phongVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    // O objeto só gira e se move (sem escala não uniforme), então mat3(modelMatrix) basta.
    vWorldNormal = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const phongFragmentShader = /* glsl */ `
  uniform vec3 uLightPosition;
  uniform vec3 uObjectColor;
  uniform vec3 uLightColor;
  uniform float uLa;
  uniform float uLd;
  uniform float uLs;
  uniform float uKa;
  uniform float uKd;
  uniform float uKs;
  uniform float uShininess;
  uniform bool uBlinn;
  uniform bool uAmbientOn;
  uniform bool uDiffuseOn;
  uniform bool uSpecularOn;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 l = normalize(uLightPosition - vWorldPosition);
    vec3 v = normalize(cameraPosition - vWorldPosition);

    float nl = dot(n, l);
    vec3 r = 2.0 * nl * n - l;
    vec3 h = normalize(l + v);
    float specBase = uBlinn ? max(dot(h, n), 0.0) : max(dot(r, v), 0.0);
    float specPow = nl > 0.0 ? pow(specBase, uShininess) : 0.0;

    float Ia = uAmbientOn ? uLa * uKa : 0.0;
    float Id = uDiffuseOn ? uLd * uKd * max(nl, 0.0) : 0.0;
    float Is = uSpecularOn ? uLs * uKs * specPow : 0.0;

    vec3 color = Ia * uObjectColor + Id * uObjectColor * uLightColor + Is * uLightColor;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;
