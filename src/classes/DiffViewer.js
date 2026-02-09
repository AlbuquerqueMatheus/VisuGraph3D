// src/classes/DiffViewer.js

/**
 * Visualizador de Diferenças no Código
 * Mostra o que mudou de forma clara
 */
export class DiffViewer {
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    if (!this.container) {
      console.warn('Container do DiffViewer não encontrado');
    }
    this.isVisible = false;
  }

  /**
   * Mostra diff de mudanças
   */
  show(diffData) {
    if (!this.container) return;

    const { type, changeType, diff } = diffData;

    // Cria HTML do diff
    const html = this.generateDiffHTML(type, changeType, diff);
    
    this.container.innerHTML = html;
    this.container.classList.remove('hidden');
    this.isVisible = true;

    // Auto-oculta após 5 segundos
    setTimeout(() => this.hide(), 5000);
  }

  /**
   * Oculta diff
   */
  hide() {
    if (!this.container) return;
    this.container.classList.add('hidden');
    this.isVisible = false;
  }

  /**
   * Gera HTML do diff
   */
  generateDiffHTML(type, changeType, diff) {
    const icon = type === 'ui-to-code' ? '🎨→📝' : '📝→🎨';
    const direction = type === 'ui-to-code' 
      ? 'Interface → Código' 
      : 'Código → Interface';

    let changesHTML = '';

    if (diff.linesChanged && diff.linesChanged.length > 0) {
      const preview = diff.linesChanged.slice(0, 5); // Mostra até 5 linhas
      
      changesHTML = preview.map(change => {
        const typeClass = change.type === 'added' ? 'added' : 
                         change.type === 'removed' ? 'removed' : 'modified';
        const symbol = change.type === 'added' ? '+' : 
                      change.type === 'removed' ? '-' : '~';
        
        return `
          <div class="diff-line diff-line-${typeClass}">
            <span class="diff-symbol">${symbol}</span>
            <span class="diff-line-number">${change.lineNumber}</span>
            <code class="diff-code">${this.escapeHtml(change.after || change.before)}</code>
          </div>
        `;
      }).join('');

      if (diff.linesChanged.length > 5) {
        changesHTML += `<div class="diff-more">... e mais ${diff.linesChanged.length - 5} linhas</div>`;
      }
    }

    const summary = this.generateChangeSummary(changeType, diff);

    return `
      <div class="diff-viewer-content">
        <div class="diff-header">
          <span class="diff-icon">${icon}</span>
          <span class="diff-direction">${direction}</span>
          <button class="diff-close" onclick="this.closest('.diff-viewer-content').parentElement.classList.add('hidden')">✕</button>
        </div>
        
        <div class="diff-summary">
          ${summary}
        </div>

        <div class="diff-changes">
          ${changesHTML}
        </div>

        <div class="diff-stats">
          <span class="stat-added">+${diff.addedLines || 0}</span>
          <span class="stat-modified">~${diff.modifiedLines || 0}</span>
          <span class="stat-removed">-${diff.removedLines || 0}</span>
        </div>
      </div>
    `;
  }

  /**
   * Gera resumo da mudança
   */
  generateChangeSummary(changeType, diff) {
    const messages = {
      'geometry': '🔷 Geometria alterada',
      'color': '🎨 Cor modificada',
      'position': '📍 Posição ajustada',
      'rotation': '🔄 Rotação modificada',
      'scale': '📏 Escala alterada',
      'texture': '🖼️ Textura aplicada',
      'material': '✨ Material modificado',
      'lights': '💡 Iluminação ajustada',
      'camera': '📷 Câmera reposicionada',
      'animation': '🎬 Animação configurada',
      'unknown': '✏️ Código modificado',
    };

    const message = messages[changeType] || messages['unknown'];
    
    const changesList = diff.changes && diff.changes.length > 0
      ? `<small>(${diff.changes.join(', ')})</small>`
      : '';

    return `${message} ${changesList}`;
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
