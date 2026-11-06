import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Só a URL do banco: a regra atual não exige login. NÃO colocar a chave/secret do banco aqui:
// tudo que fica nesta página é público.
const app = initializeApp({ databaseURL: "https://amauryesp-active-default-rtdb.firebaseio.com" });
export const db = getDatabase(app);
