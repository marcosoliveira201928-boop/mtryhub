# MTRY Hub — versão Firebase

Site próprio (fora do Claude), hospedado no **Firebase Hosting**, com login de
verdade para cada jogador via **Firebase Authentication** e os vídeos/jogadores
guardados no **Firestore**. Quando o técnico adiciona um vídeo, todo mundo que
está com o site aberto vê a novidade na hora (sem precisar "publicar").

## Arquivos

- `index.html`, `style.css`, `app.js` — o site em si.
- `firebase-config.js` — onde você cola as chaves do seu projeto Firebase.
- `firestore.rules` — regras de segurança (quem pode ler/escrever o quê).
- `firebase.json` — configuração de hosting/deploy.

## 1. Criar o projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e clique em **Adicionar projeto**.
2. Dê um nome (ex: `mtry-hub`) e finalize a criação.

## 2. Ativar Authentication (login por e-mail/senha)

1. No menu lateral: **Build > Authentication > Get started**.
2. Na aba **Sign-in method**, ative o provedor **E-mail/senha**.

## 3. Ativar o Firestore

1. No menu lateral: **Build > Firestore Database > Create database**.
2. Escolha o modo **produção** e uma região perto de você (ex: `southamerica-east1`).

## 4. Pegar as chaves do app Web

1. Clique no ícone de engrenagem (canto superior esquerdo) > **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone `</>` (Web), dê um apelido e clique em **Registrar app**.
3. Copie o objeto `firebaseConfig` que aparece e cole no arquivo `firebase-config.js`, substituindo os campos `COLE_AQUI`.

## 5. Criar a conta do técnico

1. Ainda em **Authentication > Users**, clique em **Add user**.
2. Use um e-mail qualquer (ex: `tecnico@mtryhub.app`) e uma senha — essa é a conta que você vai usar para entrar como "Técnico" no site.
3. Copie o **UID** que aparece na lista de usuários (vai precisar no próximo passo).

## 6. Marcar essa conta como técnico (admin)

1. Vá em **Firestore Database > Dados**.
2. Clique em **Iniciar coleção**, nome `config`.
3. ID do documento: `admin`. Adicione um campo:
   - Campo: `uids` — Tipo: `array` — Valor: cole o UID que você copiou (um item no array).
4. Salve.

> Sem esse passo o site carrega normalmente, mas ninguém consegue entrar como técnico.

*(Opcional)* Crie também o documento `config/meta` com os campos `teamName` (string) e `tagline` (string) se quiser definir o nome do hub antes mesmo do primeiro login — senão o app usa "MTRY Hub" como padrão e você troca depois pelo painel.

## 7. Publicar as regras de segurança

Duas formas, escolha uma:

- **Pelo console:** Firestore Database > aba **Regras** > cole o conteúdo de `firestore.rules` > **Publicar**.
- **Pela CLI** (junto do deploy, passo 9): `firebase deploy --only firestore:rules`.

## 8. Instalar a Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

Dentro da pasta do projeto:

```bash
firebase use --add
```

Escolha o projeto que você criou no passo 1.

## 9. Deploy

```bash
firebase deploy
```

Ao final, a CLI mostra a URL do site, algo como `https://mtry-hub.web.app`.

## 10. Usar o site

1. Abra a URL, entre na aba **Técnico** com o e-mail/senha do passo 5.
2. No painel, cadastre os jogadores (aba **Jogadores**) — isso já cria a conta de login de cada um.
3. Cadastre os vídeos (aba **Vídeos**), atribuindo a um jogador específico ou a "Todos".
4. Envie para cada jogador: a URL do site + usuário + senha que você definiu para ele.

## Novidade: POVs separadas de Demos

Agora o site tem duas seções bem separadas:

- **POVs**: continua exatamente como era — link do YouTube, o jogador só assiste. Sem confirmação, sem avaliação.
- **Demos**: nova seção pro arquivo `.dem` da partida. Como esse arquivo costuma ser grande, o técnico não faz upload pelo site — só cola um **link externo** (Google Drive, Mega, Dropbox etc.) de onde o arquivo já está hospedado. Aqui sim entra:
  - **Confirmação de visualização**: o jogador clica em "Confirmar que assisti + avaliar" pra registrar que viu a demo.
  - **Avaliação**: 5 pontos positivos e 5 pontos negativos daquela partida, preenchidos pelo jogador.
  - **Painel do técnico**: aba "Demos" mostra, pra cada demo, `X/Y avaliaram` — clique expande a lista de jogadores com status (avaliou em tal data + o que escreveu, ou ainda pendente).

Jogadores continuam com o campo **Time** (ex: Red, Blue) no cadastro.

### ⚠️ Coleções do Firestore mudaram — republique as regras

A coleção que antes se chamava `videos` virou `povs`, e existe uma nova coleção `demos`. Se você já tinha dados de teste na coleção `videos`, eles não vão aparecer mais no site (o app agora lê de `povs`) — pode apagar essa coleção antiga no Firestore se quiser.

Republique as regras de novo:

- **Pelo console:** Firestore Database > aba **Regras** > apague tudo > cole o conteúdo do `firestore.rules` deste zip > **Publicar**.
- **Pela CLI:** `firebase deploy --only firestore:rules`.

Sem isso, POVs/Demos/avaliações vão dar erro de permissão.

## Limitações que vale saber

- Remover um jogador na aba **Jogadores** tira ele da lista e das demos, mas a conta de login em si só é apagada de verdade em **Authentication** no console do Firebase.
- Não existe "esqueci minha senha" pronto no app — se um jogador esquecer a senha, o técnico troca no console (Authentication > usuário > redefinir senha) ou remove e recria o jogador.
- Plano gratuito do Firebase (Spark) é mais que suficiente para um elenco pequeno; ele tem limite diário de leituras/escritas no Firestore, o que não costuma ser problema pra esse uso.
