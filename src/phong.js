import * as THREE from 'three';
document.getElementById('btn-phong').addEventListener('click', () => {
    document.getElementById('canvas-container').style.display = 'none';
    document.getElementById('color-system-container').style.display = 'none';
    document.getElementById('curvas-container').style.display = 'none';
    document.getElementById('phong-container').style.display = 'flex';

    initPhongScene(); // Inicializa a cena com Phong.
});

// Obter sliders e spans correspondentes
const ambientSlider = document.getElementById('ambient-light');
const diffuseSlider = document.getElementById('diffuse-light');
const specularLightSlider = document.getElementById('specular-light'); // Corrigido Ls
const ambientMaterialSlider = document.getElementById('ambient-material');
const diffuseMaterialSlider = document.getElementById('diffuse-material');
const specularMaterialSlider = document.getElementById('specular-material');
const shininessSlider = document.getElementById('shininess');
const geometrySelector = document.getElementById('geometry-selector');

function initPhongScene() {
    const container = document.getElementById('phong-canvas');
    container.innerHTML = ''; // Limpa qualquer conteúdo anterior.

    const width = container.offsetWidth || 600;
    const height = container.offsetHeight || 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    const baseColor = new THREE.Color(0x5555ff);

    const material = new THREE.MeshPhongMaterial({
        color: baseColor,
        shininess: 10,
        specular: new THREE.Color(0xaaaaaa)
    });

    let geometry = new THREE.SphereGeometry(1, 32, 32);
    let mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    camera.position.z = 5;

    window.addEventListener('resize', () => {
        const width = container.offsetWidth;
        const height = container.offsetHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });

    function updateMaterial() {
        material.shininess = parseFloat(shininessSlider.value);
        const ka = parseFloat(ambientMaterialSlider.value);
        const kd = parseFloat(diffuseMaterialSlider.value);
        const ks = parseFloat(specularMaterialSlider.value);
        const ls = parseFloat(specularLightSlider.value); // Pegando valor correto de Ls

        // Atualiza a reflectância do material
        material.specular.setRGB(ks, ks, ks);

        // Ajusta as intensidades das luzes
        ambientLight.intensity = parseFloat(ambientSlider.value) * ka;
        pointLight.intensity = parseFloat(diffuseSlider.value) * kd;

        // Aqui corrigimos a luz especular para que Ls afete a iluminação
        pointLight.intensity += ls * ks;

        // Atualiza os diagramas (matemático e visual)
        drawPhongDiagram(ka, kd, ks, ambientLight.intensity, pointLight.intensity, ls, material.shininess);
        drawPhongVisualDiagram(ka, kd, ks, ambientLight.intensity, pointLight.intensity, ls, material.shininess);
    }

    function drawPhongDiagram(ka, kd, ks, Ia, Id, Is, shininess) {
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

    function drawPhongVisualDiagram(ka, kd, ks, Ia, Id, Is, shininess) {
        const canvas = document.getElementById('phong-diagram-canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Fundo
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Desenho das contribuições
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

        // Exibir valores
        ctx.fillStyle = 'black';
        ctx.fillText(`Ka: ${ka.toFixed(2)}`, baseX, baseY - 60);
        ctx.fillText(`Kd: ${kd.toFixed(2)}`, baseX + 70, baseY - 60);
        ctx.fillText(`Ks: ${ks.toFixed(2)}`, baseX + 140, baseY - 60);
    }

    // Adicionar eventos para os sliders
    ambientSlider.addEventListener('input', updateMaterial);
    diffuseSlider.addEventListener('input', updateMaterial);
    specularLightSlider.addEventListener('input', updateMaterial); // Correção do evento
    ambientMaterialSlider.addEventListener('input', updateMaterial);
    diffuseMaterialSlider.addEventListener('input', updateMaterial);
    specularMaterialSlider.addEventListener('input', updateMaterial);
    shininessSlider.addEventListener('input', updateMaterial);

    geometrySelector.addEventListener('change', () => {
        const selectedGeometry = geometrySelector.value;
        scene.remove(mesh);
        geometry = selectedGeometry === 'sphere'
            ? new THREE.SphereGeometry(1, 32, 32)
            : new THREE.TorusGeometry(1, 0.4, 16, 100);
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
    });

    function animate() {
        requestAnimationFrame(animate);
        mesh.rotation.y += 0.01;
        renderer.render(scene, camera);
    }
    animate();
}
