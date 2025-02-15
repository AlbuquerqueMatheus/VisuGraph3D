import * as THREE from 'three';

class PhongApp {
  constructor() {
    // Seleciona o container e define as dimensões iniciais
    this.container = document.getElementById('phong-canvas');
    this.container.innerHTML = ''; // Limpa conteúdo anterior
    this.width = this.container.offsetWidth || 600;
    this.height = this.container.offsetHeight || 400;

    // Cria a cena, câmera e renderer
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(this.width, this.height);
    this.container.appendChild(this.renderer.domElement);

    // Cria as luzes
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);

    this.pointLight = new THREE.PointLight(0xffffff, 1);
    this.pointLight.position.set(5, 5, 5);
    this.scene.add(this.pointLight);

    // Cria o material com cor base e propriedades iniciais
    const baseColor = new THREE.Color(0x5555ff);
    this.material = new THREE.MeshPhongMaterial({
      color: baseColor,
      shininess: 10,
      specular: new THREE.Color(0xaaaaaa)
    });

    // Cria a geometria e o mesh iniciais (esfera)
    this.geometry = new THREE.SphereGeometry(1, 32, 32);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    this.camera.position.z = 5;

    // Seleciona os elementos do DOM (sliders e selector)
    this.ambientSlider = document.getElementById('ambient-light');
    this.diffuseSlider = document.getElementById('diffuse-light');
    this.specularLightSlider = document.getElementById('specular-light');
    this.ambientMaterialSlider = document.getElementById('ambient-material');
    this.diffuseMaterialSlider = document.getElementById('diffuse-material');
    this.specularMaterialSlider = document.getElementById('specular-material');
    this.shininessSlider = document.getElementById('shininess');
    this.geometrySelector = document.getElementById('geometry-selector');

    // Vincula métodos para preservar o contexto
    this.updateMaterial = this.updateMaterial.bind(this);
    this.handleGeometryChange = this.handleGeometryChange.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);

    // Configura os eventos dos sliders e do selector
    this.ambientSlider.addEventListener('input', this.updateMaterial);
    this.diffuseSlider.addEventListener('input', this.updateMaterial);
    this.specularLightSlider.addEventListener('input', this.updateMaterial);
    this.ambientMaterialSlider.addEventListener('input', this.updateMaterial);
    this.diffuseMaterialSlider.addEventListener('input', this.updateMaterial);
    this.specularMaterialSlider.addEventListener('input', this.updateMaterial);
    this.shininessSlider.addEventListener('input', this.updateMaterial);
    this.geometrySelector.addEventListener('change', this.handleGeometryChange);

    // Atualiza as dimensões da cena quando a janela for redimensionada
    window.addEventListener('resize', this.onWindowResize);
  }

  updateMaterial() {
    // Atualiza as propriedades do material e das luzes com base nos valores dos sliders
    this.material.shininess = parseFloat(this.shininessSlider.value);
    const ka = parseFloat(this.ambientMaterialSlider.value);
    const kd = parseFloat(this.diffuseMaterialSlider.value);
    const ks = parseFloat(this.specularMaterialSlider.value);
    const ls = parseFloat(this.specularLightSlider.value);

    // Atualiza a reflectância especular do material
    this.material.specular.setRGB(ks, ks, ks);

    // Ajusta a intensidade das luzes
    this.ambientLight.intensity = parseFloat(this.ambientSlider.value) * ka;
    this.pointLight.intensity = parseFloat(this.diffuseSlider.value) * kd;
    this.pointLight.intensity += ls * ks;

    // Atualiza os diagramas (matemático e visual)
    this.drawPhongDiagram(ka, kd, ks, this.ambientLight.intensity, this.pointLight.intensity, ls, this.material.shininess);
    this.drawPhongVisualDiagram(ka, kd, ks, this.ambientLight.intensity, this.pointLight.intensity, ls, this.material.shininess);
  }

  drawPhongDiagram(ka, kd, ks, Ia, Id, Is, shininess) {
    const canvas = document.getElementById('phong-formula-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '16px Arial';
    ctx.fillStyle = '#000';
    ctx.fillText(`I = Ia * Ka + Id * Kd + Is * Ks`, 10, 30);
    ctx.fillText(`Ia = ${Ia.toFixed(2)}, Ka = ${ka.toFixed(2)}`, 10, 60);
    ctx.fillText(`Id = ${Id.toFixed(2)}, Kd = ${kd.toFixed(2)}`, 10, 90);
    ctx.fillText(`Is = ${Is.toFixed(2)}, Ks = ${ks.toFixed(2)}, Shininess = ${shininess}`, 10, 120);
  }

  drawPhongVisualDiagram(ka, kd, ks, Ia, Id, Is, shininess) {
    const canvas = document.getElementById('phong-diagram-canvas');
    if (!canvas) return; // Caso o canvas não exista
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const baseX = 50;
    const baseY = 100;
    // Luz Ambiente
    ctx.fillStyle = 'blue';
    ctx.fillRect(baseX, baseY - Ia * ka * 50, 50, Ia * ka * 50);
    ctx.fillText(`Ambiente`, baseX, baseY + 20);
    // Luz Difusa
    ctx.fillStyle = 'green';
    ctx.fillRect(baseX + 70, baseY - Id * kd * 50, 50, Id * kd * 50);
    ctx.fillText(`Difusa`, baseX + 70, baseY + 20);
    // Luz Especular
    ctx.fillStyle = 'red';
    ctx.fillRect(baseX + 140, baseY - Is * ks * 50, 50, Is * ks * 50);
    ctx.fillText(`Especular`, baseX + 140, baseY + 20);
    // Exibe os valores
    ctx.fillStyle = 'black';
    ctx.fillText(`Ka: ${ka.toFixed(2)}`, baseX, baseY - 60);
    ctx.fillText(`Kd: ${kd.toFixed(2)}`, baseX + 70, baseY - 60);
    ctx.fillText(`Ks: ${ks.toFixed(2)}`, baseX + 140, baseY - 60);
  }

  handleGeometryChange() {
    const selectedGeometry = this.geometrySelector.value;
    this.scene.remove(this.mesh);
    // Seleciona a geometria com base na opção
    this.geometry =
      selectedGeometry === 'sphere'
        ? new THREE.SphereGeometry(1, 32, 32)
        : new THREE.TorusGeometry(1, 0.4, 16, 100);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  onWindowResize() {
    const newWidth = this.container.offsetWidth;
    const newHeight = this.container.offsetHeight;
    this.renderer.setSize(newWidth, newHeight);
    this.camera.aspect = newWidth / newHeight;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.mesh.rotation.y += 0.01;
    this.renderer.render(this.scene, this.camera);
  }
}

// Configura o botão para exibir a interface Phong e iniciar a aplicação
document.getElementById('btn-phong').addEventListener('click', () => {
  document.getElementById('canvas-container').classList.add('hidden');
  document.getElementById('color-system-container').classList.add('hidden');
  document.getElementById('curvas-container').classList.add('hidden');
  document.getElementById('phong-container').classList.remove('hidden');
  const phongApp = new PhongApp();
  phongApp.animate();
});
