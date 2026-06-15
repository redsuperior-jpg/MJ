import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2FztPzHkafdH-QeCdyf2IXJj5QXSiKNo",
  authDomain: "csmj-ab2f1.firebaseapp.com",
  databaseURL: "https://csmj-ab2f1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "csmj-ab2f1",
  storageBucket: "csmj-ab2f1.firebasestorage.app",
  messagingSenderId: "510110606249",
  appId: "1:510110606249:web:2b56fca9489f6615185ab8"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
