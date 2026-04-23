import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  RecaptchaVerifier, 
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  orderBy,
  serverTimestamp,
  increment,
  getDocFromServer
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Graceful Firestore initialization with Persistent Cache
let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalForceLongPolling: true
  }, (firebaseConfig as any).firestoreDatabaseId || '(default)');
} catch (e) {
  console.warn("Firestore initialization warning:", e);
  _db = getFirestore(app);
}

export const db = _db;
export const storage = getStorage(app);

// Auth Providers
export const googleProvider = new GoogleAuthProvider();
