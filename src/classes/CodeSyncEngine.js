// src/classes/CodeSyncEngine.js

/**
 * Sistema de Sincronização Bidirecional
 * UI ↔ Código em tempo real
 */
export class CodeSyncEngine {
  constructor({ 
    codeGenerator, 
    editor, 
    scene, 
    camera, 
    lights, 
    geometryManager, 
    animationManager 
  }) {
    this.codeGenerator = codeGenerator;
    this.editor = editor;
    this.scene = scene;
    this.camera = camera;
    this.lights = lights;
    this.geometryManager = geometryManager;
    this.animationManager = animationManager;

    this.syncEnabled = false;
    this.isUpdatingFromCode = false;
    this.isUpdatingFromUI = false;
    this.lastGeneratedCode = '';
    this.codeChangeListeners = [];
    this.diffHistory = [];
  }

  /**
   * Inicia sincronização bidirecional
   */
  enableSync() {
    this.syncEnabled = true;
    console.log('🔄 Sincronização bidirecional ATIVADA');
    
    // Gera código inicial
    this.updateCodeFromUI();
    
    // Monitora mudanças no editor
    this.setupCodeEditorListener();
  }

  /**
   * Para sincronização
   */
  disableSync() {
    this.syncEnabled = false;
    console.log('⏸️ Sincronização bidirecional DESATIVADA');
  }

  /**
   * UI → Código (quando usuário mexe na interface)
   */
  updateCodeFromUI(changeType = 'unknown', changeData = {}) {
    if (!this.syncEnabled || this.isUpdatingFromCode) return;
    
    this.isUpdatingFromUI = true;

    try {
      const mainObject = this.geometryManager?.object || 
                        this.geometryManager?.getDefaultObject?.();

      // Gera novo código
      const newCode = this.codeGenerator.generate({
        scene: this.scene,
        camera: this.camera,
        object: mainObject,
        lights: this.lights,
        animationManager: this.animationManager,
      });

      // Calcula diff
      const diff = this.calculateDiff(this.lastGeneratedCode, newCode);
      
      if (diff.hasChanges) {
        // Atualiza editor
        if (this.editor?.setValue) {
          this.editor.setValue(newCode);
        }

        // Salva histórico
        this.diffHistory.push({
          timestamp: Date.now(),
          type: changeType,
          data: changeData,
          diff: diff,
          before: this.lastGeneratedCode,
          after: newCode,
        });

        // Notifica listeners
        this.notifyCodeChange({
          type: 'ui-to-code',
          changeType,
          changeData,
          diff,
        });

        this.lastGeneratedCode = newCode;
      }
    } catch (error) {
      console.error('Erro ao atualizar código da UI:', error);
    } finally {
      this.isUpdatingFromUI = false;
    }
  }

  /**
   * Código → UI (quando usuário edita o código)
   */
  updateUIFromCode(newCode) {
    if (!this.syncEnabled || this.isUpdatingFromUI) return;

    this.isUpdatingFromCode = true;

    try {
      // Parse do código editado
      const parsedData = this.parseCode(newCode);
      
      if (parsedData) {
        // Aplica mudanças na cena
        this.applyParsedDataToScene(parsedData);

        // Calcula diff
        const diff = this.calculateDiff(this.lastGeneratedCode, newCode);
        
        // Notifica listeners
        this.notifyCodeChange({
          type: 'code-to-ui',
          diff,
          parsedData,
        });

        this.lastGeneratedCode = newCode;
      }
    } catch (error) {
      console.error('Erro ao atualizar UI do código:', error);
      this.showCodeError(error);
    } finally {
      this.isUpdatingFromCode = false;
    }
  }

  /**
   * Configura listener no editor de código
   */
  setupCodeEditorListener() {
    if (!this.editor || !this.editor.cm) {
      console.warn('Editor não disponível para sync');
      return;
    }

    // Debounce para evitar updates excessivos
    let debounceTimer = null;

    this.editor.cm.on('change', (instance, changeObj) => {
      if (this.isUpdatingFromUI) return; // Evita loop infinito

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const newCode = this.editor.getValue();
        this.updateUIFromCode(newCode);
      }, 1000); // 1 segundo após parar de digitar
    });
  }

  /**
   * Parse simplificado do código (extrai valores chave)
   */
  parseCode(code) {
    const data = {};

    try {
      // Regex para extrair valores comuns
      const patterns = {
        // Posição do objeto
        meshPosition: /mesh\.position\.set\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/,
        
        // Rotação do objeto
        meshRotation: /mesh\.rotation\.set\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/,
        
        // Escala do objeto
        meshScale: /mesh\.scale\.set\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/,
        
        // Cor do material
        materialColor: /color:\s*0x([0-9a-fA-F]{6})/,
        
        // Roughness
        materialRoughness: /roughness:\s*([\d.]+)/,
        
        // Metalness
        materialMetalness: /metalness:\s*([\d.]+)/,
        
        // Wireframe
        materialWireframe: /wireframe:\s*(true|false)/,
        
        // Opacity
        materialOpacity: /opacity:\s*([\d.]+)/,
        
        // Posição da câmera
        cameraPosition: /camera\.position\.set\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/,
        
        // Intensidade luz ambiente
        ambientIntensity: /ambientLight.*?new THREE\.AmbientLight.*?,\s*([\d.]+)\s*\)/,
        
        // Intensidade luz direcional
        directionalIntensity: /directionalLight.*?new THREE\.DirectionalLight.*?,\s*([\d.]+)\s*\)/,
        
        // Posição luz direcional
        directionalPosition: /directionalLight\.position\.set\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/,
        
        // Geometria
        geometryType: /new THREE\.(\w+Geometry)/,
        
        // Animação rotação
        rotateSpeed: /rotateSpeed\s*=\s*([\d.]+)/,
        
        // Animação float
        floatAmplitude: /floatAmplitude\s*=\s*([\d.]+)/,
        floatSpeed: /floatSpeed\s*=\s*([\d.]+)/,
      };

      // Executa regex
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = code.match(pattern);
        if (match) {
          data[key] = match.slice(1); // Array de captures
        }
      }

      return Object.keys(data).length > 0 ? data : null;
    } catch (error) {
      console.error('Erro ao fazer parse do código:', error);
      return null;
    }
  }

  /**
   * Aplica dados parseados na cena
   */
  applyParsedDataToScene(data) {
    const mainObject = this.geometryManager?.object || 
                      this.geometryManager?.getDefaultObject?.();

    if (!mainObject) return;

    // Posição
    if (data.meshPosition) {
      const [x, y, z] = data.meshPosition.map(parseFloat);
      mainObject.position.set(x, y, z);
    }

    // Rotação
    if (data.meshRotation) {
      const [x, y, z] = data.meshRotation.map(parseFloat);
      mainObject.rotation.set(x, y, z);
    }

    // Escala
    if (data.meshScale) {
      const [x, y, z] = data.meshScale.map(parseFloat);
      mainObject.scale.set(x, y, z);
    }

    // Material
    if (mainObject.material) {
      // Cor
      if (data.materialColor) {
        const colorHex = parseInt(data.materialColor[0], 16);
        mainObject.material.color.setHex(colorHex);
      }

      // Roughness
      if (data.materialRoughness) {
        mainObject.material.roughness = parseFloat(data.materialRoughness[0]);
      }

      // Metalness
      if (data.materialMetalness) {
        mainObject.material.metalness = parseFloat(data.materialMetalness[0]);
      }

      // Wireframe
      if (data.materialWireframe) {
        mainObject.material.wireframe = data.materialWireframe[0] === 'true';
      }

      // Opacity
      if (data.materialOpacity) {
        const opacity = parseFloat(data.materialOpacity[0]);
        mainObject.material.opacity = opacity;
        mainObject.material.transparent = opacity < 1;
      }
    }

    // Câmera
    if (data.cameraPosition) {
      const [x, y, z] = data.cameraPosition.map(parseFloat);
      this.camera.position.set(x, y, z);
    }

    // Luzes
    if (data.ambientIntensity && this.lights.ambientLight) {
      this.lights.ambientLight.intensity = parseFloat(data.ambientIntensity[0]);
    }

    if (data.directionalIntensity && this.lights.directionalLight) {
      this.lights.directionalLight.intensity = parseFloat(data.directionalIntensity[0]);
    }

    if (data.directionalPosition && this.lights.directionalLight) {
      const [x, y, z] = data.directionalPosition.map(parseFloat);
      this.lights.directionalLight.position.set(x, y, z);
    }

    // Animações
    if (data.rotateSpeed && this.animationManager) {
      this.animationManager.setRotateOptions({
        enabled: true,
        speed: parseFloat(data.rotateSpeed[0]),
      });
    }

    console.log('✅ Cena atualizada a partir do código!');
  }

  /**
   * Calcula diferenças entre dois códigos
   */
  calculateDiff(oldCode, newCode) {
    if (!oldCode) {
      return {
        hasChanges: true,
        changes: ['initial'],
        linesChanged: [],
      };
    }

    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');
    const changes = [];
    const linesChanged = [];

    const maxLines = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (oldLine !== newLine) {
        linesChanged.push({
          lineNumber: i + 1,
          type: !oldLine ? 'added' : !newLine ? 'removed' : 'modified',
          before: oldLine,
          after: newLine,
        });

        // Identifica tipo de mudança
        if (newLine.includes('position.set')) changes.push('position');
        if (newLine.includes('rotation.set')) changes.push('rotation');
        if (newLine.includes('scale.set')) changes.push('scale');
        if (newLine.includes('color:')) changes.push('color');
        if (newLine.includes('roughness:')) changes.push('roughness');
        if (newLine.includes('metalness:')) changes.push('metalness');
        if (newLine.includes('wireframe:')) changes.push('wireframe');
        if (newLine.includes('AmbientLight')) changes.push('ambient-light');
        if (newLine.includes('DirectionalLight')) changes.push('directional-light');
      }
    }

    return {
      hasChanges: linesChanged.length > 0,
      changes: [...new Set(changes)], // Remove duplicatas
      linesChanged,
      addedLines: linesChanged.filter(l => l.type === 'added').length,
      removedLines: linesChanged.filter(l => l.type === 'removed').length,
      modifiedLines: linesChanged.filter(l => l.type === 'modified').length,
    };
  }

  /**
   * Registra listener para mudanças de código
   */
  onCodeChange(callback) {
    this.codeChangeListeners.push(callback);
  }

  /**
   * Notifica todos os listeners
   */
  notifyCodeChange(data) {
    this.codeChangeListeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Erro no listener de código:', error);
      }
    });
  }

  /**
   * Mostra erro de código para o usuário
   */
  showCodeError(error) {
    console.error('❌ Erro no código:', error);
    
    // Você pode adicionar um toast/notificação aqui
    const errorMsg = `Erro ao aplicar código: ${error.message}`;
    alert(errorMsg); // Substituir por toast bonito depois
  }

  /**
   * Obtém histórico de diffs
   */
  getDiffHistory(limit = 10) {
    return this.diffHistory.slice(-limit);
  }

  /**
   * Limpa histórico
   */
  clearHistory() {
    this.diffHistory = [];
  }
}
