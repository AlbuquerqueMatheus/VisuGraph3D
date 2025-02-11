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
const toggleEditorBtn = document.getElementById('toggleEditorBtn');

// Estado inicial
let isEditorVisible = false;

// Funções de navegação
// Funções de navegação
function showScreen(screenToShow) {
    // Esconde todas as telas
    [menuScreen, screen3D, screen2D].forEach(screen => screen.classList.add('hidden'));

    // Mostra a tela desejada
    screenToShow.classList.remove('hidden');

    // Controle de visibilidade do botão Mostrar Editor
    if (screenToShow === screen3D) {
        const toggleEditorBtn = document.getElementById('toggleEditorBtn');
        const codeEditorContainer = document.getElementById('code-editor');
        const generateCodeBtn = document.getElementById('generateCodeBtn');

        if (toggleEditorBtn) {
            toggleEditorBtn.classList.remove('hidden'); // Mostra o botão "Mostrar Editor"
            // Garante que o editor e o botão "Gerar Código" estejam inicialmente ocultos
            codeEditorContainer.classList.add('hidden');
            generateCodeBtn.classList.add('hidden');
            toggleEditorBtn.textContent = "Mostrar Editor"; // Reseta o texto do botão
        } else {
            console.error('Botão toggleEditorBtn não encontrado.');
        }
    }
}



// Função para alternar a visibilidade do editor e do botão "Gerar Código"
function toggleEditor() {
    isEditorVisible = !isEditorVisible;
    if (isEditorVisible) {
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
toggleEditorBtn.addEventListener('click', toggleEditor);
