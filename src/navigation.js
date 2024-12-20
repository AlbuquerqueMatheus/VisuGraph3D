// Seleção de elementos
const menuScreen = document.getElementById('menu-screen');
const screen3D = document.getElementById('screen-3d');
const screen2D = document.getElementById('screen-2d');
const btn3D = document.getElementById('btn-3d');
const btn2D = document.getElementById('btn-2d');
const backToMenu3D = document.getElementById('back-to-menu-3d');
const backToMenu2D = document.getElementById('back-to-menu-2d');
const generateCodeBtn = document.getElementById('generateCodeBtn');
const codeEditor = document.getElementById('codeEditor');

// Funções de navegação
function showScreen(screenToShow) {
    // Esconde todas as telas
    [menuScreen, screen3D, screen2D].forEach(screen => screen.classList.add('hidden'));
    // Mostra a tela desejada
    screenToShow.classList.remove('hidden');

    // Controla a visibilidade do botão "Gerar Código" e editor (apenas no modo 3D)
    if (screenToShow === screen3D) {
        generateCodeBtn.classList.remove('hidden');
        codeEditor.classList.remove('hidden');
    } else {
        generateCodeBtn.classList.add('hidden');
        codeEditor.classList.add('hidden');
    }
}

// Eventos dos botões
btn3D.addEventListener('click', () => showScreen(screen3D));
btn2D.addEventListener('click', () => showScreen(screen2D));
backToMenu3D.addEventListener('click', () => showScreen(menuScreen));
backToMenu2D?.addEventListener('click', () => showScreen(menuScreen));
