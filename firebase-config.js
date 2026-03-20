import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBjaUboeJZQb9dsRkXiPmLUD11nicMziY4",
  authDomain: "preferencepoll.firebaseapp.com",
  projectId: "preferencepoll",
  storageBucket: "preferencepoll.firebasestorage.app",
  messagingSenderId: "940416557761",
  appId: "1:940416557761:web:f32e658a972a1b5d2e2a40"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
