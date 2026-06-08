# Adam Assistente Virtual — Gemini + Google Drive

Esta versão transforma o Adam em um widget conversacional dentro do ADB Administrativo, usando Gemini pela Vercel e podendo consultar o ecossistema do Google Drive da conta `ministerioadbsampaio@gmail.com` por meio de um conector em Google Apps Script.

## O que esta versão faz

- Mantém o app principal com Financeiro, Secretaria, Drive-Mídia e Agenda.
- Mantém **Artes de Eventos** como **Em breve**, sem API de imagem.
- Adiciona Adam logo abaixo da logo na primeira página.
- Usa a memória bíblica, teológica e pastoral da ADB.
- Prepara consulta a documentos, planilhas, relatórios financeiros, entradas e saídas do Drive.

## Variáveis necessárias na Vercel

```txt
GEMINI_API_KEY=sua_chave_nova_do_google_ai_studio
GEMINI_TEXT_MODEL=gemini-3.5-flash
ADAM_DRIVE_WEBAPP_URL=https://script.google.com/macros/s/SEU_SCRIPT/exec
ADAM_DRIVE_TOKEN=um_token_longo_criado_por_voce
```

`GEMINI_TEXT_MODEL` pode ser trocado para `gemini-3-flash` ou `gemini-2.5-flash` se o modelo 3.5 Flash não estiver disponível no seu projeto.

## Como conectar o Drive

1. Acesse `script.google.com` com a conta do ministério.
2. Crie um projeto novo.
3. Cole o arquivo `google-apps-script/ADAM_DRIVE_BRIDGE.gs`.
4. Configure a propriedade do script `ADAM_DRIVE_TOKEN`.
5. Publique como App da Web.
6. Copie o link `/exec`.
7. Coloque esse link na Vercel como `ADAM_DRIVE_WEBAPP_URL`.
8. Faça Redeploy.

## Segurança

O app não salva chaves no HTML. A chave Gemini e o token do Drive ficam apenas nas variáveis de ambiente da Vercel e nas propriedades do Apps Script.

## Observação sobre dados financeiros

O conector consegue ler planilhas do Google Sheets e enviar contexto ao Gemini. A análise de entradas e saídas depende da estrutura das planilhas. O Adam foi instruído a não inventar valores e a avisar quando a leitura automática parecer incompleta.
