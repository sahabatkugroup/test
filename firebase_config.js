// firebase_config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";
import { getDatabase, ref, set, get, onValue, update, remove, runTransaction } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// Firebase config Anda (ini akan digunakan untuk semua fungsionalitas)
const firebaseConfig = {
  apiKey: "AIzaSyCtva8TeL40-WotK4kFL_vL8uUXL3GDfww", // Ganti dengan API Key Anda
  authDomain: "sahabatkuu-bisa.firebaseapp.com",
  databaseURL: "https://sahabatkuu-bisa-default-rtdb.asia-southeast1.firebasedatabase.app", // Realtime Database
  projectId: "sahabatkuu-bisa",
  storageBucket: "sahabatkuu-bisa.firebasestorage.app",
  messagingSenderId: "315555564115",
  appId: "1:315555564115:web:56f46dbceb8c154589d4a6",
  measurementId: "G-PFGYL96VPS"
};

// Inisialisasi Firebase Apps (hanya satu aplikasi yang diinisialisasi)
const app = initializeApp(firebaseConfig, "mainApp"); 
const db = getDatabase(app); // Realtime Database
const auth = getAuth(app); // Authentication
const firestoreDb = getFirestore(app); // Firestore (untuk absensi)

try { getAnalytics(app); } catch(e) {} // Optional analytics

// UID Admin untuk Main App (Realtime Database)
const ADMIN_UID = "kSW4ThusrwhUFCQeTsnPV1VNaR72"; 

export { 
  db, auth, firestoreDb, ADMIN_UID,
  ref, set, get, onValue, update, remove, runTransaction,
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, addDoc,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
};
