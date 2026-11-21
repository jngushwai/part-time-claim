import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

export { app, auth, googleProvider, db, collection, addDoc, serverTimestamp, getDocs, query, orderBy };
