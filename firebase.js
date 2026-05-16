/* ═══════════════════════════════════════════════════════════════════
   MedMate v2.0 – Firebase Initializer
   Replace the firebaseConfig values with your own Firebase project!
   ═══════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  signOut,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── YOUR FIREBASE CONFIG ─────────────────────────────────────────────────────
// Go to https://console.firebase.google.com → your project → Project settings → Your apps
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Expose everything the app needs on a single global object
window._fb = {
  auth, db,
  onAuthStateChanged: (a, cb) => onAuthStateChanged(a, cb),
  signInWithEmailAndPassword:    (a, e, p) => signInWithEmailAndPassword(a, e, p),
  createUserWithEmailAndPassword:(a, e, p) => createUserWithEmailAndPassword(a, e, p),
  updateProfile:  (u, d) => updateProfile(u, d),
  updatePassword: (u, p) => updatePassword(u, p),
  signOut:        (a)    => signOut(a),
  deleteUser:     (u)    => deleteUser(u),
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy,
  onSnapshot, serverTimestamp
};

// Signal the app that Firebase is ready
window.dispatchEvent(new Event('fbready'));
