# Setup do Adam com Google Drive API via Service Account

## 1. Criar o projeto no Google Cloud

Acesse o Google Cloud Console com a conta do ministério ou com sua conta administradora.
Crie um projeto, por exemplo:

`ADB Sampaio Adam Drive`

## 2. Ativar APIs

No projeto, ative:

- Google Drive API
- Google Sheets API

## 3. Criar Service Account

Crie uma Service Account chamada, por exemplo:

`adam-drive-adb`

Copie o e-mail da Service Account. Ele será parecido com:

`adam-drive-adb@nome-do-projeto.iam.gserviceaccount.com`

## 4. Criar chave JSON

Na Service Account, crie uma nova chave do tipo JSON.
Baixe o arquivo JSON e guarde com segurança.

Você usará apenas estes campos do JSON na Vercel:

- `client_email` → colocar em `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → colocar em `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Nunca suba esse JSON para o GitHub.

## 5. Compartilhar o Drive com a Service Account

No Google Drive da conta `ministerioadbsampaio@gmail.com`, compartilhe as pastas principais com o e-mail da Service Account.
Dê permissão de **Leitor**.

Pastas iniciais:

- Documentos: `19W25ZpV23G3LIXkRTIrN_9I0KuQYpUbL`
- Controle Financeiro: `18IlLgEjjGurn2PmEP1qieRvL9k-9vBGM`
- Fotos dos Cultos: `1gkAJXF4Tg5cMCSbEIDCbCO4mHv7HGVv6`

Se alguma planilha não estiver dentro dessas pastas ou não herdar permissão, compartilhe a planilha individualmente com a Service Account.

## 6. Configurar variáveis na Vercel

Vá em:

`Project > Settings > Environment Variables`

Adicione:

```txt
GEMINI_API_KEY=sua_chave_do_google_ai_studio
GEMINI_TEXT_MODEL=gemini-3.5-flash
GOOGLE_SERVICE_ACCOUNT_EMAIL=email_da_service_account
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=chave_privada_do_json
```

Opcional:

```txt
GOOGLE_DRIVE_FOLDER_IDS=19W25ZpV23G3LIXkRTIrN_9I0KuQYpUbL,18IlLgEjjGurn2PmEP1qieRvL9k-9vBGM,1gkAJXF4Tg5cMCSbEIDCbCO4mHv7HGVv6
GOOGLE_EXTRA_SPREADSHEET_IDS=id1,id2,id3
```

## 7. Fazer Redeploy

Depois de alterar variáveis de ambiente, faça **Redeploy**.

## 8. Testar

Abra:

`https://SEU-LINK-VERCEL.vercel.app/api/drive-test`

Se aparecer `connected: true`, o Adam está conseguindo acessar o Drive.

## 9. O que o Adam consegue ler

- Lista de arquivos e pastas compartilhadas.
- Google Sheets conectadas, com prévia das abas e linhas principais.
- Google Docs, exportados como texto.
- Metadados de PDFs, imagens e arquivos de mídia.

Observação: PDFs e imagens exigem uma etapa futura de OCR/leitura visual para conteúdo interno. Nesta versão, ele lista e usa metadados desses arquivos, mas não extrai texto de PDFs escaneados.
