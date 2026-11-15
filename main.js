// 1. Temporizador
// A data vem do config.js (a mesma usada pela lancamento.html)
const targetDate = new Date(LUMME_CONFIG.lancamento).getTime();

function updateCountdown() {
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance < 0) {
        location.replace('./lancamento.html');
        return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    document.getElementById('cd-days').innerText = String(days).padStart(2, '0');
    document.getElementById('cd-hours').innerText = String(hours).padStart(2, '0');
    document.getElementById('cd-minutes').innerText = String(minutes).padStart(2, '0');
    document.getElementById('cd-seconds').innerText = String(seconds).padStart(2, '0');
}

setInterval(updateCountdown, 1000);
updateCountdown();

// 2. Integração AWS (URL Única)
// Em produção o CloudFront encaminha '/acessos' para o API Gateway.
// Rodando localmente (localhost, 127.0.0.1 ou arquivo aberto direto), usa a URL do API Gateway.
const API_LOCAL = 'https://SEU-API-ID.execute-api.SUA-REGIAO.amazonaws.com/prod/acessos'; // <-- TROQUE pela URL do seu API Gateway
const ehLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const API_URL = ehLocal ? API_LOCAL : '/acessos';

// Apenas LÊ os números (GET). Não incrementa mais nada no banco.
const atualizarContador = async (tipo, elementoId) => {
    try {
        const resposta = await fetch(`${API_URL}?tipo=${tipo}&_=${Date.now()}`, { cache: 'no-store' });
        const dados = await resposta.json();

        if (dados.acessos !== undefined) {
            document.getElementById(elementoId).innerText = dados.acessos;
        }
    } catch (erro) {
        console.error(`Erro ao atualizar o contador ${tipo}:`, erro);
        document.getElementById(elementoId).innerText = '-';
    }
};

window.addEventListener('DOMContentLoaded', () => {
    atualizarContador('hits', 'visitas');
    atualizarContador('lista_espera', 'cliques-espera');
});

// 3. Captcha "zíper" — LUMME TRACKER
const gate = document.getElementById('gate');
const zip = document.getElementById('zip');
const zipClip = document.getElementById('zipClip');
const zipPull = document.getElementById('zipPull');
const gateStatus = document.getElementById('gateStatus');
const paginaPrincipal = document.querySelector('.page');

// Geometria do texto dentro do SVG (viewBox de 1000 de largura)
const VB_W = 1000;
const TXT_X0 = 30;
const TXT_W = 940;

const SALTO_MAX = 0.3;      // não deixa "teletransportar" o zíper
const CONCLUIR_EM = 0.985;  // % mínima para considerar aberto

const MSG_INICIAL = 'Comece pela esquerda e deslize o dedo/mouse sobre o nome para abrir o zíper.';

let progresso = 0;
let tokenDesafio = null;
let inicioGesto = null;
let pontos = 0;
let concluido = false;

function jaVerificado() {
    try {
        return sessionStorage.getItem('lumme_verificado') === '1';
    } catch (e) {
        return false;
    }
}

function desenharZiper() {
    const x = TXT_X0 + progresso * TXT_W;
    zipClip.setAttribute('width', x);
    zipPull.setAttribute('transform', `translate(${x} 0)`);
    zip.setAttribute('aria-valuenow', Math.round(progresso * 100));
}

async function carregarDesafio() {
    try {
        const resposta = await fetch(`${API_URL}?tipo=desafio&_=${Date.now()}`, { cache: 'no-store' });
        const dados = await resposta.json();
        if (!resposta.ok || !dados.token) throw new Error(dados.error || 'Sem token');
        tokenDesafio = dados.token;
        gateStatus.textContent = MSG_INICIAL;
    } catch (erro) {
        console.error('Erro ao carregar o desafio:', erro);
        tokenDesafio = null;
        gateStatus.textContent = 'Não foi possível carregar a verificação. Tentando novamente...';
        setTimeout(carregarDesafio, 3000);
    }
}

function reiniciarZiper(mensagem) {
    progresso = 0;
    pontos = 0;
    inicioGesto = null;
    concluido = false;
    tokenDesafio = null;
    gate.classList.remove('completo');
    desenharZiper();
    gateStatus.textContent = mensagem || 'Carregando verificação...';
    carregarDesafio();
}

function liberarPagina() {
    try {
        sessionStorage.setItem('lumme_verificado', '1');
    } catch (e) { }

    paginaPrincipal.removeAttribute('inert');
    document.documentElement.classList.add('verificado');
    gate.classList.add('saindo');
    setTimeout(() => gate.remove(), 800);
}

async function concluirZiper() {
    concluido = true;
    progresso = 1;
    desenharZiper();
    gate.classList.add('completo');
    gateStatus.textContent = 'Verificado! Registrando acesso...';

    try {
        const resposta = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'visita',
                token: tokenDesafio,
                duracao_ms: Math.round(performance.now() - inicioGesto),
                pontos: pontos
            })
        });
        const dados = await resposta.json().catch(() => ({}));

        if (!resposta.ok) throw new Error(dados.error || 'Falha na verificação');

        if (dados.acessos !== undefined) {
            document.getElementById('visitas').innerText = dados.acessos;
        }
        liberarPagina();
    } catch (erro) {
        console.error('Erro ao registrar a visita:', erro);
        reiniciarZiper('Não foi possível validar. Tente abrir o zíper de novo.');
    }
}

function avancarZiper(novoProgresso) {
    if (!inicioGesto) inicioGesto = performance.now();
    progresso = Math.min(1, novoProgresso);
    pontos++;
    desenharZiper();
    if (progresso >= CONCLUIR_EM) concluirZiper();
}

// Mouse (hover) e toque/caneta (arrastar): o mesmo evento cobre os dois
zip.addEventListener('pointermove', (e) => {
    if (concluido || !tokenDesafio || !e.isTrusted) return;

    const caixa = zip.getBoundingClientRect();
    const xNoSvg = ((e.clientX - caixa.left) / caixa.width) * VB_W;
    const p = Math.min(1, Math.max(0, (xNoSvg - TXT_X0) / TXT_W));

    // Só avança se o ponteiro estiver logo à frente do zíper (sequencial, sem pular)
    if (p > progresso && p - progresso <= SALTO_MAX) {
        avancarZiper(p);
    }
});

// Acessibilidade: seta para a direita / Enter / Espaço também abrem o zíper
zip.addEventListener('keydown', (e) => {
    if (concluido || !tokenDesafio || !e.isTrusted) return;
    if (['ArrowRight', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        avancarZiper(progresso + 0.1);
    }
});

if (jaVerificado()) {
    // Mesma aba/sessão: não pede o captcha de novo e não conta nova visita no reload
    gate.remove();
} else {
    paginaPrincipal.setAttribute('inert', '');
    desenharZiper();
    carregarDesafio();
}

// 4. Modal / Pop-up
function mostrarModal() {
    document.getElementById('successModal').classList.add('active');
}

function fecharModal() {
    document.getElementById('successModal').classList.remove('active');
}

// 5. Formulário da lista de espera (POST)
async function enviarParaAWS(event) {
    event.preventDefault();

    // Validação explícita da LGPD via JavaScript
    const lgpdCheckbox = document.getElementById('lgpd-consent');
    if (!lgpdCheckbox.checked) {
        alert('Por favor, aceite os termos da LGPD para continuar.');
        return;
    }

    const email = document.getElementById('emailInput').value;
    const btn = document.getElementById('submitBtn');
    const contadorElement = document.getElementById('cliques-espera');
    const originalBtnContent = btn.innerHTML;

    try {
        btn.innerHTML = '<span>A guardar...</span>';
        btn.disabled = true;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            alert(data.error || 'Houve um erro de comunicação. Tente novamente.');
            btn.innerHTML = originalBtnContent;
            btn.disabled = false;
            return;
        }

        if (data.acessos !== undefined) {
            contadorElement.innerText = data.acessos;
        }

        btn.innerHTML = '<span>Sucesso!</span>';
        document.getElementById('emailInput').value = '';
        lgpdCheckbox.checked = false;

        mostrarModal();

        setTimeout(() => {
            btn.innerHTML = originalBtnContent;
            btn.disabled = false;
        }, 3000);

    } catch (error) {
        console.error('Erro na requisição AWS:', error);
        alert('Houve um erro de comunicação. Tente novamente.');
        btn.innerHTML = originalBtnContent;
        btn.disabled = false;
    }
}