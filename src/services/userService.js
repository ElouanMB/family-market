import { 
    addDoc,
    collection, 
    deleteDoc, 
    doc, 
    getDocs,
    onSnapshot,
    orderBy, 
    query, 
    updateDoc
} from 'firebase/firestore';
import { db } from './firebase';

const USERS_COLLECTION = 'family_members';

// Default palettes for assignment
export const USER_PALETTES = [
    { color: '#FF9F0A', bg: '#332002', name: 'Orange' },
    { color: '#30D158', bg: '#062A11', name: 'Gris' },
    { color: '#0A84FF', bg: '#021B33', name: 'Bleu' },
    { color: '#BF5AF2', bg: '#261230', name: 'Violet' },
    { color: '#FF375F', bg: '#330B13', name: 'Rose' },
    { color: '#FFD60A', bg: '#332B02', name: 'Jaune' },
    { color: '#64D2FF', bg: '#142A33', name: 'Cyan' },
];

export const subscribeToFamilyMembers = (callback) => {
    const q = query(collection(db, USERS_COLLECTION), orderBy('name', 'asc'));
    
    return onSnapshot(q, (snapshot) => {
        const members = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        callback(members);
    }, (error) => {
        console.error("[Users] Error subscribing:", error);
    });
};

export const getFamilyMembers = async () => {
    try {
        const q = query(collection(db, USERS_COLLECTION), orderBy('name', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("[Users] Error fetching:", error);
        return [];
    }
};

export const addFamilyMember = async (name, colorIndex = 0) => {
    try {
        const palette = USER_PALETTES[colorIndex % USER_PALETTES.length];
        const docRef = await addDoc(collection(db, USERS_COLLECTION), {
            name,
            color: palette.color,
            bg: palette.bg,
            createdAt: new Date().toISOString()
        });
        return docRef.id;
    } catch (error) {
        console.error("[Users] Error adding member:", error);
        return null;
    }
};

export const updateFamilyMember = async (memberId, updates) => {
    try {
        const memberRef = doc(db, USERS_COLLECTION, memberId);
        await updateDoc(memberRef, updates);
        return true;
    } catch (error) {
        console.error("[Users] Error updating member:", error);
        return false;
    }
};

export const deleteFamilyMember = async (memberId) => {
    try {
        await deleteDoc(doc(db, USERS_COLLECTION, memberId));
        return true;
    } catch (error) {
        console.error("[Users] Error deleting member:", error);
        return false;
    }
};
