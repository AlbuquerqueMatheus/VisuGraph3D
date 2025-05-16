// phong.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

class PhongApp {
  constructor() {
    this._initScene();
    this._initLights();
    this._initMaterial();
    this._initGeometry();
    this._initHelpers();
    this._initUI();
    this.animate();
  }

  // Scene with WebGL and CSS2D renderers
  _initScene() {
    // agora usamos o container 'phong-viewer'
    this.container = document.getElementById('phong-viewer');
    this.container.innerHTML = '';
    this.width = this.container.offsetWidth || 600;
    this.height = this.container.offsetHeight || 400;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
    this.camera.position.set(0, 2, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.width, this.height);
    this.container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.width, this.height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  }

  // Ambient and point lights
  _initLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);

    this.pointLight = new THREE.PointLight(0xffffff, 1);
    this.pointLight.position.set(5, 2, 0);
    this.scene.add(this.pointLight);
  }

  // MeshPhongMaterial
  _initMaterial() {
    this.material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(0x5555ff),
      shininess: 10,
      specular: new THREE.Color(0xaaaaaa)
    });
  }

  // Geometry and mesh
  _initGeometry() {
    this.geometry = new THREE.SphereGeometry(1, 32, 32);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  // ArrowHelpers and labels for n̂, î̂, v̂
  _initHelpers() {
    const P = this.mesh.position;

    // Normal
    const nDir = new THREE.Vector3(0, 1, 0);
    this.nArrow = new THREE.ArrowHelper(nDir, P, 1.5, 0x00ff00, 0.2, 0.1);
    this.scene.add(this.nArrow);
    this.nLabel = this._makeLabel('n̂', nDir.clone().setLength(1.7).add(P));
    this.scene.add(this.nLabel);

    // Light direction
    const lDir = this.pointLight.position.clone().sub(P).normalize();
    this.lArrow = new THREE.ArrowHelper(lDir, P, 2, 0xff0000, 0.2, 0.1);
    this.scene.add(this.lArrow);
    this.lLabel = this._makeLabel('î̂', lDir.clone().setLength(2.2).add(P));
    this.scene.add(this.lLabel);

    // View direction
    const vDir = this.camera.position.clone().sub(P).normalize();
    this.vArrow = new THREE.ArrowHelper(vDir, P, 2, 0x0000ff, 0.2, 0.1);
    this.scene.add(this.vArrow);
    this.vLabel = this._makeLabel('v̂', vDir.clone().setLength(2.2).add(P));
    this.scene.add(this.vLabel);

    // TransformControls for dragging light
    this.transformControls = new TransformControls(this.camera, this.labelRenderer.domElement);
    this.transformControls.attach(this.pointLight);
    this.scene.add(this.transformControls);
    this.transformControls.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
    });
  }

  // Create CSS2D label
  _makeLabel(text, position) {
    const div = document.createElement('div');
    div.className = 'label';
    div.textContent = text;
    div.style.color = '#fff';
    div.style.fontSize = '20px';
    div.style.fontWeight = 'bold';
    const label = new CSS2DObject(div);
    label.position.copy(position);
    return label;
  }

  // UI sliders and geometry selector
  _initUI() {
    this.geometrySelector = document.getElementById('geometry-selector');
    const ids = [
      'ambient-light','diffuse-light','specular-light',
      'ambient-material','diffuse-material','specular-material',
      'shininess'
    ];
    ids.forEach(id => {
      document.getElementById(id)
              .addEventListener('input', () => this._refresh());
    });
    this.geometrySelector.addEventListener('change', () => this._handleGeometryChange());
    window.addEventListener('resize', () => this._onWindowResize());
    this._refresh();
  }

  // Update material, lights, arrows, labels, formula
  _refresh() {
    const La = parseFloat(document.getElementById('ambient-light').value);
    const Ld = parseFloat(document.getElementById('diffuse-light').value);
    const Ls = parseFloat(document.getElementById('specular-light').value);
    const Ka = parseFloat(document.getElementById('ambient-material').value);
    const Kd = parseFloat(document.getElementById('diffuse-material').value);
    const Ks = parseFloat(document.getElementById('specular-material').value);
    const shininess = parseFloat(document.getElementById('shininess').value);

    this.material.shininess = shininess;
    this.material.specular.setScalar(Ks);
    this.ambientLight.intensity = La * Ka * 2;
    this.pointLight.intensity = (Ld * Kd + Ls * Ks) * 2;

    const P = this.mesh.position;

    // update arrows + labels
    const nDir = new THREE.Vector3(0,1,0);
    this.nArrow.setDirection(nDir);
    this.nArrow.position.copy(P);
    this.nLabel.position.copy(nDir.clone().setLength(1.7).add(P));

    const lDir = this.pointLight.position.clone().sub(P).normalize();
    this.lArrow.setDirection(lDir);
    this.lArrow.position.copy(P);
    this.lLabel.position.copy(lDir.clone().setLength(2.2).add(P));

    const vDir = this.camera.position.clone().sub(P).normalize();
    this.vArrow.setDirection(vDir);
    this.vArrow.position.copy(P);
    this.vLabel.position.copy(vDir.clone().setLength(2.2).add(P));

    this._drawPhongDiagram(La, Ka, Ld, Kd, Ls, Ks, shininess);
    this._updateLabels({ La, Ld, Ls, Ka, Kd, Ks, shininess });
  }

  // Text formula canvas
  _drawPhongDiagram(La, Ka, Ld, Kd, Ls, Ks, n) {
    const cvs = document.getElementById('phong-formula-canvas');
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.font = '14px Courier New';
    ctx.fillStyle = '#fff';
    ctx.fillText('I = La·Ka + Ld·Kd + Ls·Ks', 10, 25);
    ctx.fillText(`La=${La.toFixed(2)}, Ka=${Ka.toFixed(2)}`, 10, 55);
    ctx.fillText(`Ld=${Ld.toFixed(2)}, Kd=${Kd.toFixed(2)}`, 10, 85);
    ctx.fillText(`Ls=${Ls.toFixed(2)}, Ks=${Ks.toFixed(2)}, n=${n}`, 10, 115);
  }

  // Update numeric labels
  _updateLabels(v) {
    document.getElementById('ambient-intensity-value').innerText = v.La;
    document.getElementById('diffuse-intensity-value').innerText = v.Ld;
    document.getElementById('specular-intensity-value').innerText = v.Ls;
    document.getElementById('ka-value').innerText = v.Ka;
    document.getElementById('kd-value').innerText = v.Kd;
    document.getElementById('ks-value').innerText = v.Ks;
    document.getElementById('shininess-value').innerText = v.shininess;
  }

  // Change geometry type
  _handleGeometryChange() {
    this.scene.remove(this.mesh);
    const type = this.geometrySelector.value;
    this.geometry = (type === 'sphere')
      ? new THREE.SphereGeometry(1, 32, 32)
      : new THREE.TorusGeometry(1, 0.4, 16, 100);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  // Handle window resize
  _onWindowResize() {
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    this.renderer.setSize(this.width, this.height);
    this.labelRenderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  // Animation loop
  animate() {
    requestAnimationFrame(() => this.animate());
    if (!this.transformControls.dragging) {
      const t = Date.now() * 0.001;
      const r = 5;
      this.pointLight.position.set(Math.cos(t) * r, 2, Math.sin(t) * r);
    }
    this.controls.update();
    this._refresh();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}

// Bind to button and section
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-phong');
  btn.addEventListener('click', () => {
    // oculta todas as seções .section
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    // exibe a seção de Phong
    document.getElementById('phong-section').classList.remove('hidden');
    // inicializa o app
    new PhongApp();
  });
});
