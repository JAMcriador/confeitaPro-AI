import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc as realDoc, 
  getDocFromServer,
  collection as realCollection,
  getDoc as realGetDoc,
  getDocs as realGetDocs,
  setDoc as realSetDoc,
  updateDoc as realUpdateDoc,
  deleteDoc as realDeleteDoc,
  query as realQuery,
  where as realWhere,
  orderBy as realOrderBy,
  onSnapshot as realOnSnapshot
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without specifying firestoreDatabaseId in getFirestore
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Test Firestore Connection on Boot
async function testConnection() {
  try {
    // Attempting to test connection
    await getDocFromServer(realDoc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration: Client appears offline.");
    } else {
      console.log("Firestore test connection ran successfully (ignored expected empty doc fetch).");
    }
  }
}
testConnection();

// Operation Types for detailed error logging
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed Info:', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

// -----------------------------------------------------------------
// DUAL-MODE FIREBASE LOCAL SANDBOX FALLBACK ENGINE
// -----------------------------------------------------------------

export function isSandboxActive(): boolean {
  return localStorage.getItem('is_firebase_sandbox') === 'true';
}

export function setSandboxActive(active: boolean) {
  if (active) {
    localStorage.setItem('is_firebase_sandbox', 'true');
  } else {
    localStorage.removeItem('is_firebase_sandbox');
  }
}

// Helper structures for local mock state
class MockQuerySnapshot {
  docs: any[];
  constructor(docs: any[]) {
    this.docs = docs;
  }
  forEach(callback: (doc: any) => void) {
    this.docs.forEach(callback);
  }
  get empty() {
    return this.docs.length === 0;
  }
  get size() {
    return this.docs.length;
  }
}

class MockDocumentSnapshot {
  id: string;
  _data: any;
  constructor(id: string, data: any) {
    this.id = id;
    this._data = data;
  }
  data() {
    return this._data;
  }
  exists() {
    return this._data !== undefined && this._data !== null;
  }
}

function getMockLocalStorageData(path: string): any {
  const key = "confeitapro_doc:" + path;
  const val = localStorage.getItem(key);
  return val ? JSON.parse(val) : null;
}

function setMockLocalStorageData(path: string, data: any) {
  const key = "confeitapro_doc:" + path;
  localStorage.setItem(key, JSON.stringify(data));
}

function deleteMockLocalStorageData(path: string) {
  const key = "confeitapro_doc:" + path;
  localStorage.removeItem(key);
}

function addPathToCollectionIndex(path: string) {
  const allPathsKey = "confeitapro_all_doc_paths";
  const pathsStr = localStorage.getItem(allPathsKey);
  const paths: string[] = pathsStr ? JSON.parse(pathsStr) : [];
  if (!paths.includes(path)) {
    paths.push(path);
    localStorage.setItem(allPathsKey, JSON.stringify(paths));
  }
}

function removePathFromCollectionIndex(path: string) {
  const allPathsKey = "confeitapro_all_doc_paths";
  const pathsStr = localStorage.getItem(allPathsKey);
  if (pathsStr) {
    const paths: string[] = JSON.parse(pathsStr);
    const filtered = paths.filter(p => p !== path);
    localStorage.setItem(allPathsKey, JSON.stringify(filtered));
  }
}

function getCollectionDocPaths(collectionPath: string): string[] {
  const allPathsKey = "confeitapro_all_doc_paths";
  const pathsStr = localStorage.getItem(allPathsKey);
  const paths: string[] = pathsStr ? JSON.parse(pathsStr) : [];
  
  return paths.filter(p => {
    if (!p.startsWith(collectionPath + '/')) return false;
    const subPath = p.substring(collectionPath.length + 1);
    return !subPath.includes('/');
  });
}

// Wrapped/Proxy Firestore Functions

export function collection(db: any, path: string): any {
  if (isSandboxActive()) {
    return { _type: 'collection', path };
  }
  return realCollection(db, path);
}

export function doc(dbOrRef: any, ...pathSegments: string[]): any {
  if (isSandboxActive()) {
    let path = '';
    if (dbOrRef && dbOrRef._type === 'collection') {
      path = dbOrRef.path + '/' + pathSegments.join('/');
    } else {
      path = pathSegments.filter(Boolean).join('/');
    }
    const segments = path.split('/');
    const id = segments[segments.length - 1];
    return { _type: 'doc', path, id };
  }
  return realDoc(dbOrRef, ...pathSegments);
}

export async function getDoc(docRef: any): Promise<any> {
  if (isSandboxActive() || (docRef && docRef._type === 'doc')) {
    const path = docRef.path;
    const data = getMockLocalStorageData(path);
    return new MockDocumentSnapshot(docRef.id, data);
  }
  return realGetDoc(docRef);
}

export async function setDoc(docRef: any, data: any, options?: any): Promise<void> {
  if (isSandboxActive() || (docRef && docRef._type === 'doc')) {
    const path = docRef.path;
    let finalData = { ...data };
    if (options && options.merge) {
      const existing = getMockLocalStorageData(path) || {};
      finalData = { ...existing, ...data };
    }
    setMockLocalStorageData(path, finalData);
    addPathToCollectionIndex(path);
    return;
  }
  return realSetDoc(docRef, data, options);
}

export async function updateDoc(docRef: any, data: any): Promise<void> {
  if (isSandboxActive() || (docRef && docRef._type === 'doc')) {
    const path = docRef.path;
    const existing = getMockLocalStorageData(path) || {};
    const finalData = { ...existing, ...data };
    setMockLocalStorageData(path, finalData);
    return;
  }
  return realUpdateDoc(docRef, data);
}

export async function deleteDoc(docRef: any): Promise<void> {
  if (isSandboxActive() || (docRef && docRef._type === 'doc')) {
    const path = docRef.path;
    deleteMockLocalStorageData(path);
    removePathFromCollectionIndex(path);
    return;
  }
  return realDeleteDoc(docRef);
}

export function where(field: string, operator: string, value: any): any {
  if (isSandboxActive()) {
    return { type: 'where', field, operator, value };
  }
  return realWhere(field, operator as any, value);
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): any {
  if (isSandboxActive()) {
    return { type: 'orderBy', field, direction };
  }
  return realOrderBy(field, direction);
}

export function query(collectionRef: any, ...constraints: any[]): any {
  if (isSandboxActive() || (collectionRef && collectionRef._type === 'collection')) {
    return { _type: 'query', collectionRef, constraints };
  }
  return realQuery(collectionRef, ...constraints);
}

export async function getDocs(ref: any): Promise<any> {
  if (isSandboxActive() || (ref && (ref._type === 'collection' || ref._type === 'query'))) {
    let collectionPath = '';
    let constraints: any[] = [];
    
    if (ref._type === 'collection') {
      collectionPath = ref.path;
    } else {
      collectionPath = ref.collectionRef.path;
      constraints = ref.constraints || [];
    }
    
    const docPaths = getCollectionDocPaths(collectionPath);
    let docs = docPaths.map(path => {
      const data = getMockLocalStorageData(path);
      const segments = path.split('/');
      const id = segments[segments.length - 1];
      return new MockDocumentSnapshot(id, data);
    }).filter(doc => doc.exists());
    
    // Apply constraints
    for (const constraint of constraints) {
      if (!constraint) continue;
      if (constraint.type === 'where') {
        const { field, operator, value } = constraint;
        docs = docs.filter(doc => {
          const docData = doc.data();
          const fieldValue = docData ? docData[field] : undefined;
          
          if (operator === '==') return fieldValue === value;
          if (operator === '!=') return fieldValue !== value;
          if (operator === '>') return fieldValue > value;
          if (operator === '>=') return fieldValue >= value;
          if (operator === '<') return fieldValue < value;
          if (operator === '<=') return fieldValue <= value;
          if (operator === 'array-contains') {
            return Array.isArray(fieldValue) && fieldValue.includes(value);
          }
          return true;
        });
      }
    }
    
    // Apply orderBy
    const orderByConstraint = constraints.find(c => c && c.type === 'orderBy');
    if (orderByConstraint) {
      const { field, direction } = orderByConstraint;
      docs.sort((a, b) => {
        const valA = a.data()?.[field];
        const valB = b.data()?.[field];
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return new MockQuerySnapshot(docs);
  }
  return realGetDocs(ref);
}

export function onSnapshot(ref: any, onNext: (snapshot: any) => void, onError?: (error: any) => void): any {
  if (isSandboxActive() || (ref && (ref._type === 'collection' || ref._type === 'query'))) {
    // Execute immediately
    getDocs(ref).then(onNext).catch(onError);
    // Return empty unsubscribe
    return () => {};
  }
  return realOnSnapshot(ref, onNext, onError);
}
