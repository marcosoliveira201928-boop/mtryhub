// Cole aqui o firebaseConfig do seu projeto.
// Firebase Console > Configurações do projeto (ícone de engrenagem) >
// role até "Seus apps" > app da Web (</>) > "Config".
const firebaseConfig = {
  apiKey: "AIzaSyDuMg9W8vyvYP6BfGsLdy1aPCAOqx8I-I8",
  authDomain: "mtry-hub.firebaseapp.com",
  projectId: "mtry-hub",
  storageBucket: "mtry-hub.firebasestorage.app",
  messagingSenderId: "688316508931",
  appId: "1:688316508931:web:dec600a9a8683fe2459736",
  measurementId: "G-10Q5934ZTK"
};

// Domínio "falso" usado só para transformar o nome de usuário dos jogadores
// em um e-mail válido para o Firebase Authentication (ex: joaozinho -> joaozinho@mtryhub.app).
// Não precisa ser um domínio real — pode deixar como está.
export const USERNAME_DOMAIN = "mtryhub.app";
