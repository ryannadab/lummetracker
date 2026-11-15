# LUMME Tracker — Landing Page de Lançamento com Contador Serverless

Landing page de pré-lançamento com contagem regressiva, contador de acessos, lista de espera e uma página de lançamento. Os contadores rodam em uma arquitetura **100% serverless na AWS**: sem servidor para gerenciar, custo sob demanda e escala automática de 10 a 1 milhão de acessos.

> Projeto criado a partir do case *"Contador de Acessos Serverless"* (Cases Cloud).

## Arquitetura

```
Navegador ──► CloudFront ──► S3 (HTML/CSS/JS estáticos)
                 │
                 └─ /acessos ─► API Gateway ─► Lambda ─► DynamoDB
```

| Serviço | Função |
|---|---|
| **S3 + CloudFront** | Hospeda e distribui o front-end; encaminha `/acessos` para a API |
| **API Gateway** | Porta de entrada HTTP que recebe as chamadas do site |
| **AWS Lambda** | Lógica do contador: lê e incrementa (`UpdateItem` atômico) os valores |
| **DynamoDB** | Armazena os contadores (`hits`, `lista_espera`) por partition key (`id`) |
| **IAM** | Lambda com privilégio mínimo: só `GetItem`/`UpdateItem`/`PutItem` na tabela do projeto |
| **AWS CDK** | Infraestrutura como código (Python ou TypeScript) |

> O código do backend (Lambda e CDK) não está neste repositório. Esta pasta contém o front-end.

## Funcionalidades

- Contagem regressiva até o horário do lançamento (configurável em `config.js`).
- Contadores de **visitas** e **lista de espera** lidos da API em tempo real.
- Verificação anti-bot "zíper": a API emite um token de desafio e valida duração e pontos do gesto antes de registrar a visita.
- Cadastro de e-mail na lista de espera, com validação no cliente.
- Página `lancamento.html` com cronômetro de 24h após o lançamento.
- Layout responsivo e respeito a `prefers-reduced-motion`.

## Estrutura

```
.
├── index.html        # Página "Em breve" (home)
├── lancamento.html   # Página exibida após o lançamento
├── main.js           # Contagem regressiva, chamadas à API e verificação zíper
└── config.js         # Data de lançamento e duração do cronômetro
```

## Como rodar

1. Clone o repositório e abra a pasta.
2. Em `main.js` e `lancamento.html`, troque o placeholder `API_LOCAL` pela URL do seu API Gateway:
   ```js
   const API_LOCAL = 'https://SEU-API-ID.execute-api.SUA-REGIAO.amazonaws.com/prod/acessos';
   ```
3. Ajuste a data de lançamento em `config.js`.
4. Sirva localmente:
   ```bash
   python3 -m http.server 8000
   ```
   Em `localhost` o site chama a URL do API Gateway diretamente. Em produção usa o caminho `/acessos` via CloudFront.

## Contrato da API

| Método | Chamada | Resposta |
|---|---|---|
| `GET` | `/acessos?tipo=hits` | `{ "acessos": <número> }` |
| `GET` | `/acessos?tipo=lista_espera` | `{ "acessos": <número> }` |
| `GET` | `/acessos?tipo=desafio` | `{ "token": "..." }` |
| `POST` | `/acessos` com `{ acao: "visita", token, duracao_ms, pontos }` | Registra a visita |
| `POST` | `/acessos` com o e-mail da lista de espera | Retorna o contador atualizado |

## Pontos de atenção do case

- **IAM:** por padrão nada na AWS conversa com nada, então a Lambda recebe apenas as permissões necessárias na tabela.
- **Partição no DynamoDB:** contador simples com partition key fixa (`"id": "hits"`).
- **Atomicidade:** o incremento usa `UpdateItem` com `ADD`, evitando condição de corrida em acessos simultâneos.

## Tecnologias

HTML, CSS e JavaScript · AWS (API Gateway, Lambda, DynamoDB, CloudFront, S3, IAM) · AWS CDK

## Segurança

Nenhuma credencial, chave ou ID de conta está versionada. A URL do API Gateway é um placeholder, e as credenciais da AWS devem ficar sempre fora do repositório (variáveis de ambiente ou perfil do AWS CLI).
