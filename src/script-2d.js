document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('opengl-canvas');
    const gl = canvas.getContext('webgl2');

    if (!gl) {
        console.error('WebGL 2 não é suportado neste navegador.');
        alert('Seu navegador não suporta WebGL 2!');
        return;
    }

    const btnShaders = document.getElementById('btn-shaders');
    const btnBuffers = document.getElementById('btn-buffers');
    const btnTransformacoes = document.getElementById('btn-transformacoes');
    const btnIluminacao = document.getElementById('btn-iluminacao');
    const btnTexturas = document.getElementById('btn-texturas');
    const backToMenu2D = document.getElementById('back-to-menu-2d');

    // Voltar para o menu principal
    backToMenu2D.addEventListener('click', () => {
        window.location.href = './index.html';
    });

    // Renderização inicial
    function render() {
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Ações dos botões
    btnShaders.addEventListener('click', () => {
        renderShaders();
    });

    btnBuffers.addEventListener('click', () => {
        renderBuffers();
    });

    btnTransformacoes.addEventListener('click', () => {
        renderTransformations();
    });

    btnIluminacao.addEventListener('click', () => {
        renderLighting();
    });

    btnTexturas.addEventListener('click', () => {
        renderTextures();
    });

    // Função para renderizar Shaders
    function renderShaders() {
        const vertexShaderSource = `
            attribute vec2 aPosition;
            void main() {
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `;
        const fragmentShaderSource = `
            precision mediump float;
            void main() {
                gl_FragColor = vec4(0.4, 0.8, 0.2, 1.0);
            }
        `;

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        const program = createProgram(gl, vertexShader, fragmentShader);

        gl.useProgram(program);

        const vertices = new Float32Array([
            0.0, 0.5,
            -0.5, -0.5,
            0.5, -0.5
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(program, 'aPosition');
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(positionLocation);

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Função para renderizar Buffers
    function renderBuffers() {
        const vertices = new Float32Array([
            -0.5, -0.5,
             0.5, -0.5,
             0.0,  0.5
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const vertexShaderSource = `
            attribute vec2 aPosition;
            void main() {
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            void main() {
                gl_FragColor = vec4(0.2, 0.5, 0.8, 1.0);
            }
        `;

        const program = createProgram(
            gl,
            createShader(gl, gl.VERTEX_SHADER, vertexShaderSource),
            createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
        );

        gl.useProgram(program);

        const positionLocation = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Função para renderizar Transformações
    function renderTransformations() {
        const vertices = new Float32Array([
            -0.5, -0.5,
             0.5, -0.5,
             0.0,  0.5
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const vertexShaderSource = `
            attribute vec2 aPosition;
            uniform mat3 uTransform;
            void main() {
                vec3 transformed = uTransform * vec3(aPosition, 1.0);
                gl_Position = vec4(transformed.xy, 0.0, 1.0);
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            void main() {
                gl_FragColor = vec4(0.8, 0.3, 0.5, 1.0);
            }
        `;

        const program = createProgram(
            gl,
            createShader(gl, gl.VERTEX_SHADER, vertexShaderSource),
            createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
        );

        gl.useProgram(program);

        const transformLocation = gl.getUniformLocation(program, 'uTransform');
        const transformMatrix = new Float32Array([
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.5, 0.5, 1.0,
        ]);

        gl.uniformMatrix3fv(transformLocation, false, transformMatrix);

        const positionLocation = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Função para renderizar Iluminação
    function renderLighting() {
        alert('Função de iluminação ainda em desenvolvimento.');
        render();
    }

    // Função para renderizar Texturas
    function renderTextures() {
        alert('Função de texturas ainda em desenvolvimento.');
        render();
    }

    // Funções auxiliares
    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function createProgram(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    render(); // Renderiza a tela inicialmente
});
