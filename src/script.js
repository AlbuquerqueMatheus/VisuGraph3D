import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import gsap from 'gsap';
import GUI from 'lil-gui';

import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Função utilitária para carregar texturas de forma assíncrona// Função utilitária para carregar texturas de forma assíncrona
const loadTextureAsync = (url) => {
    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader(loadingManager);
        loader.load(url, resolve, undefined, () => {
            console.error(`Falha ao carregar textura: ${url}`);
            resolve(null); // Resolve com null para evitar erros
        });
    });
};


// Gerenciamento de Carregamento de Textura
const loadingManager = new THREE.LoadingManager();
loadingManager.onStart = () => console.log('loading started');
loadingManager.onLoad = () => console.log('loading finished');
loadingManager.onProgress = () => console.log('loading progressing');
loadingManager.onError = () => console.log('loading error');

// Debug
const gui = new GUI({ width: 300, title: 'Debug', closeFolders: true });
gui.hide();
window.addEventListener('keydown', (event) => {
    if (event.key === 'd') gui._hidden ? gui.show() : gui.hide();
});

// Base - Canvas, Cena e Luzes
const canvas = document.querySelector('canvas.webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Material e Geometria
const material = new THREE.MeshStandardMaterial({
    // side: THREE.DoubleSide,
    roughness: 0.5,
    metalness: 0.5,
    transparent: true,
    opacity: 1,
});
let geometry = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
const mesh = new THREE.Mesh(geometry, material);
mesh.castShadow = true;
mesh.receiveShadow = true;
let currentObject = mesh; // Inicialmente é o cubo
scene.add(mesh);

let originalVertices = geometry.attributes.position.array.slice();

// Plano reutilizável
const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0x808080 })
);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -1;
plane.receiveShadow = true;
scene.add(plane);

// Luzes
const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(0, 3, 0);
scene.add(pointLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// Função para carregar textura
// Debug Object
const debugObject = {
    subdivisions: 2,
    extrudeAmount: 0,
    color: 0xff0000,
    // textureEnabled: false,
    opacity: 1,
    renderStyle: 'normal',
    shadows: true,
    cameraPositionZ: 3,
    selectedGeometry: 'Box',
    selectedTexture: 'none'  // Adicionando a opção de seleção de textura
};
// Definindo as texturas globalmente
// Variável de texturas movida para o escopo global
const textures = {
    metal: {
        color: null,
        displacement: null,
        metalness: null,
        normal: null,
        roughness: null,
    },
    moss: {
        color: null,
        displacement: null,
        normal: null,
        roughness: null,
        ambientOcclusion: null,
    },
    wood: {
        color: null,
        displacement: null,
        normal: null,
        roughness: null,
    },
    pedra: {
        color: null,
        displacement: null,
        normal: null,
        roughness: null,
        anbientOcclusion: null,
    },
};

// Função para carregar texturas e aplicar no material
const applyTextures = () => {
    const selectedTextures = textures[debugObject.selectedTexture];

    if (selectedTextures && debugObject.selectedTexture !== 'none') {
        // Aplicar texturas ao material
        material.map = selectedTextures.color;
        material.displacementMap = selectedTextures.displacement;
        material.metalnessMap = selectedTextures.metalness;
        material.normalMap = selectedTextures.normal;
        material.roughnessMap = selectedTextures.roughness;
        material.aoMap = selectedTextures.ambientOcclusion;

        material.metalness = 0.5;
        material.roughness = 0.15;
        material.normalScale.set(2, 2);
        
        material.displacementScale = 0;  // Escala 0 quando não houver textura
    } else {
        // Se "none" for selecionado, remover texturas
        material.map = null;
        material.displacementMap = null;
        material.metalnessMap = null;
        material.normalMap = null;
        material.roughnessMap = null;
        material.aoMap = null;

        // Definir valores padrões
        material.metalness = 0.5;
        material.roughness = 0.5;
        material.displacementScale = 0;
    }

    // Atualizar o material e aplicá-lo ao objeto atual
    currentObject.traverse((child) => {
        if (child.isMesh) {
            child.material = material;
        }
    });

    material.needsUpdate = true;
};


// Função para inicializar e carregar as texturas
const initTextures = async () => {
    try {
        const loadTexturesForMaterial = async (type) => {
            if (type === 'metal') {
                const [color, displacement, metalness, normal, roughness] = await Promise.all([
                    loadTextureAsync('./texturas/metal/Metal_Color.png'),
                    loadTextureAsync('./texturas/metal/Metal_Displacement.png'),
                    loadTextureAsync('./texturas/metal/Metal_Metalness.png'),
                    loadTextureAsync('./texturas/metal/Metal_NormalGL.png'),
                    loadTextureAsync('./texturas/metal/Metal_Roughness.png'),
                ]);

                textures.metal.color = color;
                textures.metal.displacement = displacement;
                textures.metal.metalness = metalness;
                textures.metal.normal = normal;
                textures.metal.roughness = roughness;
            } else if (type === 'wood') {
                const [color, displacement, normal, roughness] = await Promise.all([
                    loadTextureAsync('./texturas/madeira/Wood_Color.png'),
                    loadTextureAsync('./texturas/madeira/Wood_Displacement.png'),
                    loadTextureAsync('./texturas/madeira/Wood_NormalGL.png'),
                    loadTextureAsync('./texturas/madeira/Wood_Roughness.png'),
                ]);

                textures.wood.color = color;
                textures.wood.displacement = displacement;
                textures.wood.normal = normal;
                textures.wood.roughness = roughness;
            } else if (type === 'pedra') {
                const [color, displacement, normal, roughness, ambientOcclusion] = await Promise.all([
                    loadTextureAsync('./texturas/pedra/pedra_Color.png'),
                    loadTextureAsync('./texturas/pedra/pedra_Displacement.png'),
                    loadTextureAsync('./texturas/pedra/pedra_NormalGL.png'),
                    loadTextureAsync('./texturas/pedra/pedra_Roughness.png'),
                    loadTextureAsync('./texturas/pedra/pedra_AO.png'),
                ]);

                textures.pedra.color = color;
                textures.pedra.displacement = displacement;
                textures.pedra.normal = normal;
                textures.pedra.roughness = roughness;
                textures.pedra.ambientOcclusion = ambientOcclusion;
               
            } else if (type === 'moss') {
                const [color, displacement, normal, ambientOcclusion, roughness] = await Promise.all([
                    loadTextureAsync('./texturas/moss/moss_Color.png'),
                    loadTextureAsync('./texturas/moss/moss_Displacement.png'),
                    loadTextureAsync('./texturas/moss/moss_NormalGL.png'),
                    loadTextureAsync('./texturas/moss/moss_Roughness.png'),
                    loadTextureAsync('./texturas/moss/moss_AO.png')
                ]);

                textures.moss.color = color;
                textures.moss.displacement = displacement;
                textures.moss.normal = normal;
                textures.moss.roughness = roughness;
                textures.moss.ambientOcclusion = ambientOcclusion;
            }

            applyTextures();
        };

        // Carregar texturas inicialmente para metal e madeira
        await Promise.all([
            loadTexturesForMaterial('metal'),
            loadTexturesForMaterial('wood'),
            loadTexturesForMaterial('pedra'),
            loadTexturesForMaterial('moss'),
        ]);
    } catch (error) {
        console.error('Erro ao carregar texturas', error);
    }
};

// Chamando a função para inicializar e carregar texturas
initTextures();


// Função spin
debugObject.spin = () => {
    gsap.to(mesh.rotation, { duration: 1, x: mesh.rotation.x + Math.PI * 2, y: mesh.rotation.y + Math.PI * 2 });
};

// Função para resetar a transformação
debugObject.resetTransform = () => {
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
};

// Função para atualizar a geometria
const updateGeometry = () => {
    mesh.geometry.dispose();
    switch (debugObject.selectedGeometry) {
        case 'Box':
            geometry = new THREE.BoxGeometry(1, 1, 1, debugObject.subdivisions, debugObject.subdivisions, debugObject.subdivisions);
            break;
        case 'UV Sphere':
            geometry = new THREE.SphereGeometry(1, debugObject.subdivisions * 10, debugObject.subdivisions * 10);
            break;
        case 'Cylinder':
            geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, debugObject.subdivisions * 10);
            break;
        case 'Cone':
            geometry = new THREE.ConeGeometry(0.5, 1, debugObject.subdivisions * 10);
            break;
        case 'Ico Sphere':
            geometry = new THREE.IcosahedronGeometry(1, debugObject.subdivisions);
            break;
        case 'Torus':
            geometry = new THREE.TorusGeometry(0.7, 0.2, debugObject.subdivisions * 10, debugObject.subdivisions * 10);
            break;
    }
    mesh.geometry = geometry;
    originalVertices = geometry.attributes.position.array.slice();
};

// Interface gráfica
const cubeAppearanceFolder = gui.addFolder('Cube Appearance');
cubeAppearanceFolder.add(debugObject, 'selectedGeometry', ['Box', 'UV Sphere', 'Cylinder', 'Cone', 'Ico Sphere', 'Torus']).name('Geometry').onChange(updateGeometry);

cubeAppearanceFolder.add(debugObject, 'selectedTexture', ['none', 'metal', 'wood', 'pedra', 'moss']).name('Texture').onChange(() => {
    applyTextures();  // Atualizar textura quando a opção for alterada
});

cubeAppearanceFolder.add(debugObject, 'renderStyle', ['normal', 'wireframe', 'flat']).name('Render Style').onChange(() => {
    material.wireframe = debugObject.renderStyle === 'wireframe';
    material.flatShading = debugObject.renderStyle === 'flat';

    // Aplicar ao objeto atual
    currentObject.traverse((child) => {
        if (child.isMesh) {
            child.material = material;
        }
    });

    material.needsUpdate = true;
});


cubeAppearanceFolder.addColor(debugObject, 'color').name('Color').onChange(() => {
    material.color.set(debugObject.color);
    material.needsUpdate = true;
});

cubeAppearanceFolder.add(debugObject, 'opacity').min(0).max(1).step(0.01).name('Opacity').onChange(() => {
    material.opacity = debugObject.opacity;
    material.transparent = debugObject.opacity < 1;
    material.needsUpdate = true;
    mesh.castShadow = debugObject.opacity > 0;
});

// Luzes

const lightsFolder = gui.addFolder('Lights');
lightsFolder.add(ambientLight, 'intensity').min(0).max(2).step(0.01).name('Ambient Light Intensity');
lightsFolder.add(directionalLight, 'intensity').min(0).max(2).step(0.01).name('Directional Light Intensity');
lightsFolder.add(directionalLight.position, 'x', -10, 10, 0.1).name('Directional Light X');
lightsFolder.add(directionalLight.position, 'y', -10, 10, 0.1).name('Directional Light Y');
lightsFolder.add(directionalLight.position, 'z', -10, 10, 0.1).name('Directional Light Z');
lightsFolder.addColor({ color: 0xffffff }, 'color').name('Directional Light Color').onChange((color) => {
    directionalLight.color.set(color);
});

// Sombras
const shadowsFolder = gui.addFolder('Shadows');
shadowsFolder.add(debugObject, 'shadows').name('Enable Shadows').onChange(() => {
    mesh.castShadow = debugObject.shadows;
    plane.receiveShadow = debugObject.shadows;
});

// Câmera
const cameraFolder = gui.addFolder('Camera');
cameraFolder.add(debugObject, 'cameraPositionZ', 1, 10, 0.1).name('Camera Position Z').onChange(() => {
    camera.position.z = debugObject.cameraPositionZ;
});

// Animações
const animationsFolder = gui.addFolder('Animations');
animationsFolder.add(debugObject, 'spin').name('Spin');
animationsFolder.add(debugObject, 'resetTransform').name('Reset Transform');
animationsFolder.add(debugObject, 'subdivisions').min(1).max(5).step(1).name('Subdivisions').onChange(updateGeometry);
animationsFolder.add(debugObject, 'extrudeAmount').min(0).max(1).step(0.01).name('Extrude').onChange(() => {
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        const originalX = originalVertices[i];
        const originalY = originalVertices[i + 1];
        const originalZ = originalVertices[i + 2];

        vertices[i] = originalX + Math.sign(originalX) * debugObject.extrudeAmount;
        vertices[i + 1] = originalY + Math.sign(originalY) * debugObject.extrudeAmount;
        vertices[i + 2] = originalZ + Math.sign(originalZ) * debugObject.extrudeAmount;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
});

// Array Modifier
const arrayModifier = {
    count: 1,
    offsetX: 1,
    offsetY: 0,
    offsetZ: 0,
};

const applyArrayModifier = () => {
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const child = scene.children[i];
        if (child.isMesh && child !== mesh && child !== plane) {
            child.geometry.dispose();
            scene.remove(child);
        }
    }

    for (let i = 1; i < arrayModifier.count; i++) {
        const newMesh = mesh.clone();
        newMesh.position.set(arrayModifier.offsetX * i, arrayModifier.offsetY * i, arrayModifier.offsetZ * i);
        scene.add(newMesh);
    }
};

const arrayModifierFolder = gui.addFolder('Array Modifier');
arrayModifierFolder.add(arrayModifier, 'count').min(1).max(10).step(1).name('Count').onChange(applyArrayModifier);
arrayModifierFolder.add(arrayModifier, 'offsetX').min(-2).max(2).step(0.1).name('Offset X').onChange(applyArrayModifier);
arrayModifierFolder.add(arrayModifier, 'offsetY').min(-2).max(2).step(0.1).name('Offset Y').onChange(applyArrayModifier);
arrayModifierFolder.add(arrayModifier, 'offsetZ').min(-2).max(2).step(0.1).name('Offset Z').onChange(applyArrayModifier);

// Tamanho
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
};
window.addEventListener('resize', () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Câmera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
camera.position.z = debugObject.cameraPositionZ;
scene.add(camera);

// Controles
const orbitControls = new OrbitControls(camera, canvas);
orbitControls.enableDamping = true;

// Transform Controls
const transformControls = new TransformControls(camera, canvas);
transformControls.attach(mesh);
scene.add(transformControls);
transformControls.addEventListener('dragging-changed', (event) => {
    orbitControls.enabled = !event.value;
});

// Funções para alternar os modos de transformação
const setTranslateMode = () => {
    transformControls.setMode('translate');
};

const setRotateMode = () => {
    transformControls.setMode('rotate');
};

const setScaleMode = () => {
    transformControls.setMode('scale');
};

// Adicionando as funções de controle de transformação ao lil-gui com a opção 'none'
const transformModes = { mode: 'none' }; // Inicializando com o modo 'none'
const updateTransformMode = () => {
    if (transformModes.mode === 'none') {
        transformControls.detach(); // Desativa as transformações removendo o controle
    } else {
        transformControls.attach(mesh); // Anexa o objeto ao TransformControls para manipulação
        transformControls.setMode(transformModes.mode); // Atualiza o modo do TransformControls baseado na seleção
    }
};

// Adicionando ao lil-gui uma opção de dropdown para os modos de transformação, incluindo 'none'
const transformControlsFolder = gui.addFolder('Transform Modes');
transformControlsFolder.add(transformModes, 'mode', ['none', 'translate', 'rotate', 'scale'])
    .name('Mode')
    .onChange(updateTransformMode); // Atualiza o modo quando o valor é alterado


// Renderizador
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;  // Ajuste conforme necessário
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Habilitar correção de cor no renderizador
renderer.outputEncoding = THREE.sRGBEncoding;

// Garantir que as texturas também usem sRGB encoding
if (material.map) {
    material.map.encoding = THREE.sRGBEncoding;
}
material.needsUpdate = true;

// Função de animação
const tick = () => {
    orbitControls.update();
    renderer.render(scene, camera);
    window.requestAnimationFrame(tick);
};
tick();

const fileInput = document.getElementById('file-input');
const uploadButton = document.getElementById('upload-button');

uploadButton.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    const fileType = file.name.split('.').pop().toLowerCase();

    const reader = new FileReader();
    reader.onload = function(e) {
        const contents = e.target.result;

        if (fileType === 'obj') {
            const objLoader = new OBJLoader();
            const object = objLoader.parse(contents);
            addToScene(object);
        } else if (fileType === 'glb') {
            const gltfLoader = new GLTFLoader();
            gltfLoader.parse(contents, '', function(gltf) {
                const object = gltf.scene;
                addToScene(object);
            });
        } else {
            alert('Unsupported file type');
        }
    };

    if (fileType === 'obj') {
        reader.readAsText(file); // OBJ files are text-based
    } else if (fileType === 'glb') {
        reader.readAsArrayBuffer(file); // GLB files are binary
    }
});

const addToScene = (object) => {
    // Remova o objeto anterior da cena
    scene.remove(currentObject);

    // Adiciona o novo objeto à cena
    scene.add(object);

    // Armazene o novo objeto na variável currentObject
    currentObject = object;

    // Habilita sombras e faça o bind nos transform controls
    object.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Anexar o novo objeto ao TransformControls
    transformControls.attach(object);

    // Aplicar as mesmas configurações de material e texturas ao novo objeto
    applyTextures();
    material.needsUpdate = true;
};
