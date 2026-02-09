// src/classes/TooltipSystem.js

/**
 * Sistema de Tooltips Educacionais
 * Explica cada linha de código
 */
export class TooltipSystem {
  constructor(editorManager) {
    this.editor = editorManager;
    this.tooltips = this.loadTooltipDatabase();
    this.activeTooltip = null;
  }

  /**
   * Ativa tooltips no editor
   */
  enable() {
    if (!this.editor || !this.editor.cm) {
      console.warn('Editor não disponível para tooltips');
      return;
    }

    const cm = this.editor.cm;

    // Mouseover em linhas
    cm.on('mouseover', (instance, event) => {
      const target = event.target;
      
      // Verifica se está sobre uma linha de código
      if (target.classList.contains('CodeMirror-line')) {
        const line = instance.lineAtHeight(event.clientY, 'client');
        const lineText = instance.getLine(line);
        
        if (lineText) {
          this.showTooltipForLine(lineText, event.clientX, event.clientY);
        }
      }
    });

    // Mouseout
    cm.on('mouseout', () => {
      this.hideTooltip();
    });
  }

  /**
   * Mostra tooltip para linha específica
   */
  showTooltipForLine(lineText, x, y) {
    const explanation = this.getExplanation(lineText);
    
    if (explanation) {
      this.showTooltip(explanation, x, y);
    }
  }

  /**
   * Obtém explicação para linha de código
   */
  getExplanation(lineText) {
    const trimmed = lineText.trim();

    // Busca por padrões conhecidos
    for (const [pattern, explanation] of Object.entries(this.tooltips)) {
      if (trimmed.includes(pattern)) {
        return explanation;
      }
    }

    return null;
  }

  /**
   * Mostra tooltip
   */
  showTooltip(text, x, y) {
    this.hideTooltip(); // Remove tooltip anterior

    const tooltip = document.createElement('div');
    tooltip.className = 'code-tooltip';
    tooltip.innerHTML = `
      <div class="code-tooltip-content">
        ${text}
      </div>
    `;

    tooltip.style.left = `${x + 10}px`;
    tooltip.style.top = `${y - 30}px`;

    document.body.appendChild(tooltip);
    this.activeTooltip = tooltip;
  }

  /**
   * Oculta tooltip
   */
  hideTooltip() {
    if (this.activeTooltip) {
      this.activeTooltip.remove();
      this.activeTooltip = null;
    }
  }

  /**
   * Banco de dados de explicações
   */
  loadTooltipDatabase() {
    return {
      // Three.js Básico
      'import * as THREE': '📦 Importa a biblioteca Three.js com todas as funcionalidades',
      'new THREE.Scene()': '🎬 Cria uma nova cena 3D vazia',
      'new THREE.PerspectiveCamera': '📷 Cria câmera com perspectiva (como olho humano)',
      'new THREE.WebGLRenderer': '🎨 Cria renderizador que desenha na tela usando WebGL',
      
      // Geometrias
      'BoxGeometry': '📦 Cria geometria de cubo/caixa com dimensões especificadas',
      'SphereGeometry': '⚽ Cria geometria de esfera com raio e segmentos',
      'CylinderGeometry': '🥫 Cria geometria de cilindro',
      'ConeGeometry': '🎩 Cria geometria de cone',
      'TorusGeometry': '🍩 Cria geometria de rosca/donut',
      
      // Materiais
      'MeshStandardMaterial': '✨ Material com iluminação realista (PBR)',
      'MeshBasicMaterial': '🎨 Material simples sem iluminação',
      'color:': '🎨 Define a cor do material (hexadecimal)',
      'roughness:': '🔲 Define aspereza da superfície (0=espelho, 1=fosco)',
      'metalness:': '⚡ Define quanto o material parece metal (0=não, 1=metal)',
      'wireframe:': '🕸️ Mostra apenas arestas/linhas da geometria',
      'opacity:': '👻 Define transparência (0=invisível, 1=opaco)',
      'transparent:': '💧 Ativa suporte para transparência no material',
      
      // Transform
      'position.set': '📍 Define posição (x, y, z) do objeto no espaço',
      'rotation.set': '🔄 Define rotação (x, y, z) em radianos',
      'scale.set': '📏 Define escala (x, y, z) do objeto',
      
      // Luzes
      'AmbientLight': '🌕 Luz ambiente que ilumina tudo uniformemente',
      'DirectionalLight': '☀️ Luz direcional (como sol) que cria sombras',
      'PointLight': '💡 Luz pontual que emite em todas direções',
      'castShadow': '👥 Permite que objeto/luz projete sombras',
      'receiveShadow': '🌑 Permite que objeto receba sombras de outros',
      
      // Câmera
      'camera.position': '📷 Posição da câmera no espaço 3D',
      'camera.lookAt': '👁️ Direciona câmera para olhar um ponto específico',
      'camera.fov': '🔭 Campo de visão da câmera em graus (maior = mais largura)',
      
      // Controles
      'OrbitControls': '🎮 Permite girar câmera ao redor da cena com mouse',
      'controls.enableDamping': '🎯 Ativa movimento suave/amortecido dos controles',
      'controls.update()': '🔄 Atualiza posição dos controles (necessário se damping ativo)',
      
      // Renderização
      'renderer.render': '🖼️ Desenha a cena na tela',
      'requestAnimationFrame': '🎬 Cria loop de animação suave (60 FPS)',
      'setSize': '📐 Define tamanho do canvas de renderização',
      'setPixelRatio': '🔍 Define qualidade de pixels (densidade da tela)',
      
      // Sombras
      'shadowMap.enabled': '👥 Ativa sistema de sombras no renderizador',
      'shadow.mapSize': '🗺️ Resolução do mapa de sombras (maior = mais qualidade)',
      
      // Eventos
      'addEventListener': '👂 Escuta por eventos (resize, click, etc)',
      'window.innerWidth': '📱 Largura da janela do navegador',
      'window.innerHeight': '📱 Altura da janela do navegador',
      
      // Scene
      'scene.add': '➕ Adiciona objeto à cena para ser renderizado',
      'scene.background': '🎨 Define cor ou textura de fundo da cena',
      'scene.fog': '🌫️ Adiciona névoa/fog para profundidade',
    };
  }
}
