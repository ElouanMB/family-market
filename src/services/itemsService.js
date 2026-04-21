import { 
    addDoc, 
    collection, 
    deleteDoc, 
    doc, 
    getDocs, 
    limit, 
    onSnapshot, 
    orderBy, 
    query, 
    setDoc, 
    updateDoc, 
    where 
} from 'firebase/firestore';
import { Alert } from 'react-native';

import { db } from './firebase';
import { isOnline, subscribeToNetwork } from './networkService';
import { sendPushNotificationToOthers } from './notificationService';
import {
    ActionTypes,
    addHistoryLocally,
    addItemLocally,
    addListLocally,
    cacheHistory,
    cacheItems,
    cacheLists,
    deleteItemLocally,
    getCachedHistory,
    getCachedItems,
    getCachedLists,
    getPendingActions,
    queueAction,
    removeAction,
    removeCachedList,
    removeHistoryLocally,
    setSyncing,
    subscribeToLocalHistory,
    subscribeToLocalItems,
    subscribeToLocalLists,
    toggleItemLocally,
    updateItemLocally,
    updateItemsOrderLocally
} from './offlineService';

// Collection references
const LISTS_COLLECTION = 'shoppingLists';
const ITEMS_COLLECTION = 'items';
const HISTORY_COLLECTION = 'history';

// ==================== HISTORY & LOGGING ====================

const addToHistory = async (action, description, userName, listName, skipSync = false) => {
    // Basic log object
    const logData = {
        action,
        description,
        user: userName || 'Inconnu',
        listName: listName || ''
    };

    // Always log locally for immediate feedback
    const localLog = await addHistoryLocally(logData);

    if (skipSync) return; // For actions being synced themselves

    if (!isOnline()) {
        // Queue for sync
        await queueAction({
            type: ActionTypes.LOG_HISTORY,
            payload: { ...logData, localId: localLog.id }
        });
        console.log('[History] Log queued for sync');
        return;
    }

    try {
        await addDoc(collection(db, HISTORY_COLLECTION), {
            ...logData,
            createdAt: new Date().toISOString()
        });
        // Success online -> remove the temporary local log to avoid duplicates
        await removeHistoryLocally(localLog.id);
    } catch (e) {
        console.error("[History] Log error", e);
    }
};

export const subscribeToHistory = (callback) => {
    // 1. Load from cache immediately
    getCachedHistory().then(cachedLogs => {
        if (cachedLogs.length > 0) callback(cachedLogs);
    });

    // 2. Subscribe to LOCAL changes
    const unsubscribeLocal = subscribeToLocalHistory((logs) => {
        callback(logs);
    });

    // 3. Subscribe to FIREBASE changes
    const q = query(collection(db, HISTORY_COLLECTION), orderBy('createdAt', 'desc'));
    const unsubscribeFirebase = onSnapshot(q, async (snapshot) => {
        const firebaseLogs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Merge logic: Prioritize Firebase logs and only keep unique local pending logs
        const cachedLogs = await getCachedHistory();

        // Strategy: A local log is only kept if NO firebase log exists with the same content
        // (This handles the case where the local log hasn't been removed yet from cache)
        const pendingLocalLogs = cachedLogs.filter(localLog => {
            if (!localLog.id || !localLog.id.startsWith('local_')) return false;

            // Deduplicate: If we find a firebase log with same user/description, skip the local one
            const isAlreadyInFirebase = firebaseLogs.some(f =>
                f.user === localLog.user &&
                f.description === localLog.description &&
                f.listName === localLog.listName
            );
            return !isAlreadyInFirebase;
        });

        const mergedLogs = [...firebaseLogs, ...pendingLocalLogs].sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        ).slice(0, 50);

        cacheHistory(mergedLogs);
        callback(mergedLogs);
    }, (error) => {
        console.error('[History] Snapshot error:', error);
    });

    return () => {
        unsubscribeLocal();
        unsubscribeFirebase();
    };
};

// ==================== SHOPPING LISTS MANAGEMENT ====================

const DEFAULT_LIST_NAME = 'Courses';

export const ensureDefaultList = async (userName) => {
    // 1. Check local cache first (Offline First)
    const cached = await getCachedLists();
    if (cached.length > 0) {
        return;
    }

    // 2. If not in cache, check Online if available
    if (isOnline()) {
        try {
            // Check if ANY shopping list exists
            const q = query(collection(db, LISTS_COLLECTION), limit(1));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                console.log('[Lists] Default list "Courses" missing, creating...');
                const docRef = await addDoc(collection(db, LISTS_COLLECTION), {
                    name: DEFAULT_LIST_NAME,
                    createdBy: userName || 'Système',
                    createdAt: new Date().toISOString(),
                    order: 0
                });
                return docRef.id;
            } else {
                // If found online, update cache
                const lists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                cacheLists(lists);
            }
        } catch (error) {
            console.log('[Lists] Failed to ensure default list online:', error.message);
        }
    } else {
        // 3. Fallback: Create locally if really missing everywhere
        console.log('[Lists] Offline and missing Courses, adding locally');
        const lists = await getCachedLists();
        const localCourses = {
            id: 'local_courses_0',
            name: DEFAULT_LIST_NAME,
            createdBy: userName || 'Système',
            createdAt: new Date().toISOString(),
            order: 0
        };
        await cacheLists([localCourses, ...lists]);
        // notifyListsChanged(); // This function doesn't exist, rely on subscribeToLocalLists
    }
};

export const subscribeToAllLists = (callback) => {
    // Sort by order primarily - simplified to avoid composite index requirement
    const q = query(collection(db, LISTS_COLLECTION), orderBy('order', 'asc'));

    // First, try to load from cache for instant display
    getCachedLists().then(cachedLists => {
        if (cachedLists.length > 0) {
            console.log('[Lists] Loaded', cachedLists.length, 'lists from cache');
            callback(cachedLists);
        }
    });

    // Subscribe to LOCAL changes (for offline mode)
    const unsubscribeLocal = subscribeToLocalLists((lists) => {
        console.log('[Lists] Local update received:', lists.length, 'lists');
        callback(lists);
    });

    // Subscribe to FIREBASE changes (for online mode)
    const unsubscribeFirebase = onSnapshot(q, async (snapshot) => {
        const isFromCache = snapshot.metadata.fromCache;
        console.log('[Lists] Snapshot received (Cache:', isFromCache, ')');

        const firebaseLists = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Get current local/cached lists to find pending ones
        const cached = await getCachedLists();
        const pendingLocalLists = cached.filter(l => l.id?.startsWith('local_list_'));

        // Merge: Firebase + Pending Local
        const mergedLists = [...firebaseLists];

        // Add local lists that don't exist in firebase by name (basic dedupe) or ID
        pendingLocalLists.forEach(local => {
            const exists = firebaseLists.some(f => f.name === local.name);
            if (!exists) mergedLists.push(local);
        });

        // Cache and notify
        if (mergedLists.length > 0 || !isFromCache) {
            cacheLists(mergedLists);
            callback(mergedLists);
        }
    }, async (error) => {
        console.error('[Lists] Snapshot error, loading from cache:', error.message);
        // Fallback to cache on error
        const cachedLists = await getCachedLists();
        callback(cachedLists);
    });

    // Return combined unsubscribe function
    return () => {
        unsubscribeLocal();
        unsubscribeFirebase();
    };
};

export const createShoppingList = async (name, userName) => {
    if (!name.trim()) return;

    if (!isOnline()) {
        const localList = await addListLocally({ name, createdBy: userName });
        await queueAction({
            type: ActionTypes.CREATE_LIST,
            payload: { name, userName, localId: localList.id }
        });
        return localList.id;
    }

    try {
        // Get max order
        const q = query(collection(db, LISTS_COLLECTION), orderBy('order', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        let maxOrder = 0;
        if (!snapshot.empty) {
            maxOrder = snapshot.docs[0].data().order || 0;
        }

        const docRef = await addDoc(collection(db, LISTS_COLLECTION), {
            name,
            createdBy: userName,
            createdAt: new Date().toISOString(),
            order: maxOrder + 1
        });
        addToHistory('create_list', `A créé la liste "${name}"`, userName, name);
        return docRef.id;
    } catch (error) {
        console.error("[Lists] Error creating list:", error);
        return null;
    }
};

export const updateShoppingList = async (listId, newName, userName) => {
    if (!isOnline()) {
        Alert.alert('Mode hors-ligne', 'Le renommage sera effectué une fois connecté.');
        return false;
    }

    try {
        const listRef = doc(db, LISTS_COLLECTION, listId);
        await updateDoc(listRef, { name: newName });
        addToHistory('rename_list', `A renommé une liste en "${newName}"`, userName, newName);
        return true;
    } catch (error) {
        console.error("[Lists] Error updating list:", error);
        return false;
    }
};

export const updateListsOrder = async (orderMap) => {
    if (!isOnline()) return;

    try {
        for (const [listId, newOrder] of Object.entries(orderMap)) {
            try {
                const listRef = doc(db, LISTS_COLLECTION, listId);
                await updateDoc(listRef, { order: newOrder });
            } catch (innerError) {
                console.log(`[Sync] Skipping order update for ${listId}:`, innerError.message);
            }
        }
    } catch (error) {
        console.error("[Lists] Error updating orders:", error);
    }
};

export const deleteShoppingList = async (listId, listName, userName) => {
    // Basic protection: don't delete if it's potentially the only/main list
    // (Actual complex protection is handled in UI, but this is a safety net)
    const cached = await getCachedLists();
    if (cached.length <= 1) {
        Alert.alert("Action impossible", "Vous devez garder au moins une liste de courses.");
        return;
    }
    console.log('[Lists] Starting deletion for:', listId, listName);

    // Always remove from local cache immediately
    await removeCachedList(listId);

    if (!isOnline()) {
        // Queue for later sync
        await queueAction({
            type: ActionTypes.DELETE_LIST,
            payload: { listId, listName, userName }
        });
        console.log('[Lists] Queued delete for offline sync');
        return;
    }

    try {
        // Get all items in this list
        const q = query(collection(db, ITEMS_COLLECTION), where('listId', '==', listId));
        const snapshot = await getDocs(q);
        console.log('[Lists] Found', snapshot.docs.length, 'items to delete');

        // Delete each item
        for (const docSnap of snapshot.docs) {
            await deleteDoc(docSnap.ref);
        }

        // Delete the list document
        const listRef = doc(db, LISTS_COLLECTION, listId);
        await deleteDoc(listRef);
        console.log('[Lists] Deleted successfully!');

        addToHistory('delete_list', `A supprimé la liste "${listName}"`, userName, listName);

    } catch (error) {
        console.error("[Lists] ERROR:", error.code, error.message);
        Alert.alert("Erreur", `Impossible de supprimer: ${error.message}`);
    }
};

// ==================== ITEMS MANAGEMENT ====================

export const subscribeToListItems = (listId, callback) => {
    if (!listId) return () => { };

    // First, try to load from cache for instant display
    getCachedItems(listId).then(cachedItems => {
        if (cachedItems.length > 0) {
            console.log('[Items] Loaded', cachedItems.length, 'items from cache');
            callback(sortItems(cachedItems));
        }
    });

    // Subscribe to LOCAL changes (for offline mode)
    const unsubscribeLocal = subscribeToLocalItems(listId, (items) => {
        console.log('[Items] Local update received:', items.length, 'items');
        callback(sortItems(items));
    });

    // Subscribe to FIREBASE changes (for online mode)
    const q = query(collection(db, ITEMS_COLLECTION), where('listId', '==', listId));

    const unsubscribeFirebase = onSnapshot(q, async (snapshot) => {
        const isFromCache = snapshot.metadata.fromCache;
        const firebaseItems = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Get current local items to check for pending local items
        const cachedItems = await getCachedItems(listId);

        // Find local items that might not be synced yet (start with 'local_')
        const pendingLocalItems = cachedItems.filter(item =>
            item.id?.startsWith('local_')
        );

        // Merge: Firebase items + pending local items (that don't exist in Firebase)
        const firebaseNames = firebaseItems.map(i => i.name.toLowerCase());

        const uniqueLocalItems = pendingLocalItems.filter(localItem => {
            // 1. Check if this local item has already been synced (exists in firebase with matching ID)
            const isSynced = firebaseItems.some(f => f.originalLocalId === localItem.id);
            if (isSynced) return false;

            // 2. Fallback to name check (only if both are for the same list)
            return !firebaseNames.includes(localItem.name.toLowerCase());
        });

        const mergedItems = [...firebaseItems, ...uniqueLocalItems];

        // Cache and callback ONLY if we have data or if the snapshot is from server
        // IMPORTANT: For local lists (local_list_...), firebaseItems will always be empty.
        // We must ensure we still callback with uniqueLocalItems.
        if (mergedItems.length > 0 || !isFromCache || listId.startsWith('local_')) {
            cacheItems(listId, mergedItems);
            callback(sortItems(mergedItems));
        }
    }, async (error) => {
        console.error('[Items] Snapshot error, loading from cache:', error.message);
        // Fallback to cache on error
        const cachedItems = await getCachedItems(listId);
        callback(sortItems(cachedItems));
    });

    // Return combined unsubscribe function
    return () => {
        unsubscribeLocal();
        unsubscribeFirebase();
    };
};

// Sort helper: By date (oldest first)
// Sort helper: By order, then by date
const sortItems = (items) => {
    return [...items].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
            if (a.order !== b.order) return a.order - b.order;
        }
        return a.createdAt > b.createdAt ? 1 : -1;
    });
};

export const addItem = async (listId, name, quantity, unit, userName, listName) => {
    if (!listId) return;

    const itemData = {
        listId,
        name,
        quantity: quantity || '',
        unit: unit || '',
        isCompleted: false,
        addedBy: userName,
        order: Date.now() // Use timestamp as default order to keep items at the end
    };

    if (!isOnline()) {
        // Add locally and queue for sync
        const localItem = await addItemLocally(listId, itemData);
        await queueAction({
            type: ActionTypes.ADD_ITEM,
            payload: { ...itemData, localId: localItem.id, listName }
        });
        console.log('[Items] Added locally, queued for sync');
        return localItem;
    }

    try {
        const docRef = await addDoc(collection(db, ITEMS_COLLECTION), {
            ...itemData,
            createdAt: new Date().toISOString()
        });

        const qtyString = quantity ? `(${quantity} ${unit}) ` : '';
        addToHistory('add', `A ajouté ${qtyString}"${name}"`, userName, listName);

        // Notify others
        sendPushNotificationToOthers('Nouvel article', `${userName} a ajouté ${name} dans ${listName}`, userName);

        return { id: docRef.id, ...itemData };
    } catch (error) {
        console.error("[Items] Error adding item:", error);
        // Fallback to local
        const localItem = await addItemLocally(listId, itemData);
        await queueAction({
            type: ActionTypes.ADD_ITEM,
            payload: { ...itemData, localId: localItem.id, listName }
        });
        return localItem;
    }
};

export const updateItem = async (itemId, updates, itemName, userName, listName, listId) => {
    // Update locally first for instant feedback
    if (listId) {
        await updateItemLocally(listId, itemId, updates);
    }

    if (!isOnline()) {
        await queueAction({
            type: ActionTypes.UPDATE_ITEM,
            payload: { itemId, updates, itemName, userName, listName }
        });
        console.log('[Items] Update queued for sync');
        return;
    }

    try {
        const itemRef = doc(db, ITEMS_COLLECTION, itemId);
        await updateDoc(itemRef, updates);

        const isContentUpdate = 'name' in updates || 'quantity' in updates || 'unit' in updates;
        if (isContentUpdate && userName) {
            addToHistory('update', `A modifié "${itemName}"`, userName, listName);
        }
    } catch (error) {
        console.error("[Items] Error updating item:", error);
    }
};

export const toggleItemStatus = async (itemId, itemName, currentStatus, userName, listName, listId) => {
    // Toggle locally first for instant feedback
    if (listId) {
        await toggleItemLocally(listId, itemId);
    }

    if (!isOnline()) {
        await queueAction({
            type: ActionTypes.TOGGLE_ITEM,
            payload: { itemId, itemName, newStatus: !currentStatus, userName, listName }
        });
        return;
    }

    try {
        const itemRef = doc(db, ITEMS_COLLECTION, itemId);
        await updateDoc(itemRef, { isCompleted: !currentStatus });
    } catch (error) {
        console.error("[Items] Error toggling item:", error);
    }
};

export const deleteItem = async (itemId, itemName, userName, listName, listId) => {
    // Delete locally first for instant feedback
    if (listId) {
        await deleteItemLocally(listId, itemId);
    }

    if (!isOnline()) {
        await queueAction({
            type: ActionTypes.DELETE_ITEM,
            payload: { itemId, itemName, userName, listName }
        });
        console.log('[Items] Delete queued for sync');
        return;
    }

    try {
        await deleteDoc(doc(db, ITEMS_COLLECTION, itemId));
        addToHistory('delete', `A supprimé "${itemName}"`, userName, listName);
    } catch (error) {
        console.error("[Items] Error deleting item:", error);
    }
};

export const moveItem = async (itemId, newListId, itemName, userName, oldListName, newListName, oldListId) => {
    // 1. Update locally for immediate feedback
    if (oldListId) {
        const item = (await getCachedItems(oldListId)).find(i => i.id === itemId);
        if (item) {
            await deleteItemLocally(oldListId, itemId);
            await addItemLocally(newListId, { ...item, listId: newListId });
        }
    }

    if (!isOnline()) {
        await queueAction({
            type: ActionTypes.UPDATE_ITEM,
            payload: { itemId, updates: { listId: newListId }, itemName, userName, listName: oldListName }
        });
        return;
    }

    try {
        const itemRef = doc(db, ITEMS_COLLECTION, itemId);
        await updateDoc(itemRef, { listId: newListId });
        addToHistory('move', `A déplacé "${itemName}" vers "${newListName}"`, userName, oldListName);
    } catch (error) {
        console.error("[Items] Error moving item:", error);
    }
};

export const updateItemsOrder = async (listId, orderMap) => {
    // 1. Update locally first for immediate feedback
    if (listId) {
        await updateItemsOrderLocally(listId, orderMap);
    }

    if (!isOnline()) {
        await queueAction({
            type: ActionTypes.UPDATE_ITEMS_ORDER,
            payload: { listId, orderMap }
        });
        console.log('[Items] Order update queued for sync');
        return;
    }

    try {
        for (const [itemId, newOrder] of Object.entries(orderMap)) {
            try {
                if (!itemId.startsWith('local_')) {
                    const itemRef = doc(db, ITEMS_COLLECTION, itemId);
                    await updateDoc(itemRef, { order: newOrder });
                }
            } catch (innerError) {
                console.log(`[Sync] Skipping order update for item ${itemId}:`, innerError.message);
            }
        }
    } catch (error) {
        console.error("[Items] Error updating item orders:", error);
    }
};

// ==================== SYNC PENDING ACTIONS ====================

// Lock to prevent race conditions
let isInternalSyncRunning = false;

export const syncPendingActions = async () => {
    if (isInternalSyncRunning) {
        console.log('[Sync] Internal lock active, skipping');
        return;
    }

    if (!isOnline()) {
        console.log('[Sync] Offline, skipping sync');
        return;
    }

    isInternalSyncRunning = true;

    try {
        const pending = await getPendingActions();
        if (pending.length === 0) {
            console.log('[Sync] No pending actions');
            return;
        }

        console.log('[Sync] Syncing', pending.length, 'pending actions...');
        setSyncing(true);

        for (const action of pending) {
            try {
                switch (action.type) {
                    case ActionTypes.ADD_ITEM: {
                        await addDoc(collection(db, ITEMS_COLLECTION), {
                            listId: action.payload.listId,
                            name: action.payload.name,
                            quantity: action.payload.quantity || '',
                            unit: action.payload.unit || '',
                            isCompleted: action.payload.isCompleted || false,
                            addedBy: action.payload.addedBy,
                            createdAt: action.timestamp,
                            originalLocalId: action.payload.localId || null
                        });
                        // Remove the local version to prevent duplicates
                        if (action.payload.localId) {
                            await deleteItemLocally(action.payload.listId, action.payload.localId);
                        }
                        // Add history on server for the synced item
                        await addToHistory('add', `A ajouté "${action.payload.name}" (sync)`, action.payload.addedBy, action.payload.listName, true);
                        console.log('[Sync] Added item:', action.payload.name);
                        console.log('[Sync] Deleted local item placeholder:', action.payload.localId);
                        break;
                    }

                    case ActionTypes.UPDATE_ITEM: {
                        if (!action.payload.itemId.startsWith('local_')) {
                            const itemRef = doc(db, ITEMS_COLLECTION, action.payload.itemId);
                            await updateDoc(itemRef, action.payload.updates);
                            console.log('[Sync] Updated item:', action.payload.itemId);
                        }
                        break;
                    }

                    case ActionTypes.TOGGLE_ITEM: {
                        if (!action.payload.itemId.startsWith('local_')) {
                            const itemRef = doc(db, ITEMS_COLLECTION, action.payload.itemId);
                            await updateDoc(itemRef, { isCompleted: action.payload.newStatus });
                            console.log('[Sync] Toggled item:', action.payload.itemId);
                        }
                        break;
                    }

                    case ActionTypes.DELETE_ITEM: {
                        if (!action.payload.itemId.startsWith('local_')) {
                            await deleteDoc(doc(db, ITEMS_COLLECTION, action.payload.itemId));
                            await addToHistory('delete', `A supprimé "${action.payload.itemName}" (sync)`, action.payload.userName, action.payload.listName, true);
                            console.log('[Sync] Deleted item:', action.payload.itemId);
                        }
                        break;
                    }

                    case ActionTypes.UPDATE_ITEMS_ORDER: {
                        for (const [itemId, newOrder] of Object.entries(action.payload.orderMap)) {
                            if (!itemId.startsWith('local_')) {
                                try {
                                    const itemRef = doc(db, ITEMS_COLLECTION, itemId);
                                    await updateDoc(itemRef, { order: newOrder });
                                } catch (e) {
                                    console.log(`[Sync] Skipping item order update: ${itemId}`, e.message);
                                }
                            }
                        }
                        console.log('[Sync] Updated items order for list:', action.payload.listId);
                        break;
                    }

                    case ActionTypes.SYNC_USER: {
                        await setDoc(doc(db, 'users', action.payload.userName), {
                            ...action.payload.data,
                            lastSeen: action.timestamp
                        }, { merge: true });
                        console.log('[Sync] Synced user info:', action.payload.userName);
                        break;
                    }

                    case ActionTypes.CREATE_LIST: {
                        // Check if already created by checking name
                        const listQ = query(collection(db, LISTS_COLLECTION), where('name', '==', action.payload.name));
                        const listSnap = await getDocs(listQ);
                        if (listSnap.empty) {
                            // Get current max order to append at the end
                            const allListsQ = query(collection(db, LISTS_COLLECTION), orderBy('order', 'desc'), limit(1));
                            const allListsSnap = await getDocs(allListsQ);
                            let maxOrderForNew = 0;
                            if (!allListsSnap.empty) {
                                maxOrderForNew = allListsSnap.docs[0].data().order || 0;
                            }

                            await addDoc(collection(db, LISTS_COLLECTION), {
                                name: action.payload.name,
                                createdBy: action.payload.userName,
                                createdAt: action.timestamp,
                                order: maxOrderForNew + 1
                            });
                        }
                        // Remove placeholder
                        if (action.payload.localId) {
                            await removeCachedList(action.payload.localId);
                        }
                        console.log('[Sync] Created list (with order):', action.payload.name);
                        break;
                    }

                    case ActionTypes.DELETE_LIST: {
                        // Complex operation, might fail if already deleted
                        try {
                            const q = query(collection(db, ITEMS_COLLECTION), where('listId', '==', action.payload.listId));
                            const snapshot = await getDocs(q);
                            for (const docSnap of snapshot.docs) {
                                await deleteDoc(docSnap.ref);
                            }
                            await deleteDoc(doc(db, LISTS_COLLECTION, action.payload.listId));
                            console.log('[Sync] Deleted list:', action.payload.listId);
                        } catch (e) {
                            console.log('[Sync] List might already be deleted:', e.message);
                        }
                        break;
                    }

                    case ActionTypes.LOG_HISTORY: {
                        // Deduplicate history during sync: remove the local pending log
                        if (action.payload.localId) {
                            const cachedForHistory = await getCachedHistory();
                            const cleanedForHistory = cachedForHistory.filter(h => h.id !== action.payload.localId);
                            await cacheHistory(cleanedForHistory);
                        }
                        await addDoc(collection(db, HISTORY_COLLECTION), {
                            action: action.payload.action,
                            description: action.payload.description,
                            user: action.payload.user,
                            listName: action.payload.listName,
                            createdAt: action.timestamp,
                            originalLocalId: action.payload.localId || null
                        });
                        // Clean up the local log after sync
                        if (action.payload.localId) {
                            await removeHistoryLocally(action.payload.localId);
                        }
                        console.log('[Sync] Logged history:', action.payload.description);
                        break;
                    }
                }

                // Remove processed action
                await removeAction(action.id);

            } catch (error) {
                console.error('[Sync] Error processing action:', action.type, error);
                // Keep action in queue for retry
            }
        }

        setSyncing(false);
        console.log('[Sync] Complete!');
    } finally {
        isInternalSyncRunning = false;
    }
};

// Auto-sync when coming back online
subscribeToNetwork((state) => {
    if (state.isConnected && state.isInternetReachable) {
        // Delay sync slightly to ensure connection is stable
        setTimeout(() => {
            syncPendingActions();
        }, 2000);
    }
});
