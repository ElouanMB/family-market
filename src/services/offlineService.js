import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const KEYS = {
    LISTS: '@family_market_lists',
    ITEMS: '@family_market_items',
    HISTORY: '@family_market_history',
    PENDING_ACTIONS: '@family_market_pending'
};

// ==================== LOCAL CACHE ====================

/**
 * Save lists to local storage
 */
export const cacheLists = async (lists) => {
    try {
        await AsyncStorage.setItem(KEYS.LISTS, JSON.stringify(lists));
        console.log('[Offline] Cached', lists.length, 'lists');
    } catch (e) {
        console.error('[Offline] Failed to cache lists:', e);
    }
};

/**
 * Get cached lists
 */
export const getCachedLists = async () => {
    try {
        const data = await AsyncStorage.getItem(KEYS.LISTS);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('[Offline] Failed to get cached lists:', e);
        return [];
    }
};

/**
 * Save history to local storage
 */
export const cacheHistory = async (logs) => {
    try {
        await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(logs));
    } catch (e) {
        console.error('[Offline] Failed to cache history:', e);
    }
};

/**
 * Get cached history
 */
export const getCachedHistory = async () => {
    try {
        const data = await AsyncStorage.getItem(KEYS.HISTORY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('[Offline] Failed to get cached history:', e);
        return [];
    }
};

/**
 * Save items to local storage (keyed by listId)
 */
export const cacheItems = async (listId, items) => {
    try {
        const allItems = await getAllCachedItems();
        allItems[listId] = items;
        await AsyncStorage.setItem(KEYS.ITEMS, JSON.stringify(allItems));
        console.log('[Offline] Cached', items.length, 'items for list', listId);
    } catch (e) {
        console.error('[Offline] Failed to cache items:', e);
    }
};

/**
 * Get all cached items (all lists)
 */
export const getAllCachedItems = async () => {
    try {
        const data = await AsyncStorage.getItem(KEYS.ITEMS);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('[Offline] Failed to get cached items:', e);
        return {};
    }
};

/**
 * Get item counts for all lists
 */
export const getAllListsItemCounts = async () => {
    const allItems = await getAllCachedItems();
    const counts = {};
    for (const listId in allItems) {
        counts[listId] = allItems[listId].length;
    }
    return counts;
};

/**
 * Get cached items for a specific list
 */
export const getCachedItems = async (listId) => {
    const allItems = await getAllCachedItems();
    return allItems[listId] || [];
};

// ==================== LOCAL CHANGE LISTENERS ====================

// Listeners for local item changes (to update UI when offline)
let itemsListeners = {};

/**
 * Subscribe to local item changes for a specific list
 */
export const subscribeToLocalItems = (listId, callback) => {
    if (!itemsListeners[listId]) {
        itemsListeners[listId] = [];
    }
    itemsListeners[listId].push(callback);

    return () => {
        if (itemsListeners[listId]) {
            itemsListeners[listId] = itemsListeners[listId].filter(l => l !== callback);
        }
    };
};

/**
 * Notify all listeners when items change for a list
 */
export const notifyItemsChanged = async (listId) => {
    if (itemsListeners[listId] && itemsListeners[listId].length > 0) {
        const items = await getCachedItems(listId);
        console.log('[Offline] Notifying', itemsListeners[listId].length, 'listeners for list', listId);
        itemsListeners[listId].forEach(callback => callback(items));
    }
};

// Listeners for local lists changes
let listsListeners = [];

/**
 * Subscribe to local lists changes
 */
export const subscribeToLocalLists = (callback) => {
    listsListeners.push(callback);
    return () => {
        listsListeners = listsListeners.filter(l => l !== callback);
    };
};

/**
 * Notify all listeners when lists change
 */
export const notifyListsChanged = async () => {
    if (listsListeners.length > 0) {
        const lists = await getCachedLists();
        console.log('[Offline] Notifying', listsListeners.length, 'lists listeners');
        listsListeners.forEach(callback => callback(lists));
    }
};

// Listeners for local history changes
let historyListeners = [];

/**
 * Subscribe to local history changes
 */
export const subscribeToLocalHistory = (callback) => {
    historyListeners.push(callback);
    return () => {
        historyListeners = historyListeners.filter(l => l !== callback);
    };
};

/**
 * Notify all listeners when history changes
 */
export const notifyHistoryChanged = async () => {
    if (historyListeners.length > 0) {
        const logs = await getCachedHistory();
        historyListeners.forEach(callback => callback(logs));
    }
};

/**
 * Remove cached items for a deleted list
 */
export const removeCachedList = async (listId) => {
    try {
        // Remove from lists cache
        const lists = await getCachedLists();
        const updatedLists = lists.filter(l => l.id !== listId);
        await AsyncStorage.setItem(KEYS.LISTS, JSON.stringify(updatedLists));

        // Remove items cache
        const allItems = await getAllCachedItems();
        delete allItems[listId];
        await AsyncStorage.setItem(KEYS.ITEMS, JSON.stringify(allItems));

        console.log('[Offline] Removed cache for list', listId);

        // Notify UI to update
        await notifyListsChanged();
    } catch (e) {
        console.error('[Offline] Failed to remove cached list:', e);
    }
};

// ==================== PENDING ACTIONS (OFFLINE QUEUE) ====================

/**
 * Action types for offline queue
 */
export const ActionTypes = {
    ADD_ITEM: 'ADD_ITEM',
    UPDATE_ITEM: 'UPDATE_ITEM',
    DELETE_ITEM: 'DELETE_ITEM',
    TOGGLE_ITEM: 'TOGGLE_ITEM',
    CREATE_LIST: 'CREATE_LIST',
    DELETE_LIST: 'DELETE_LIST',
    LOG_HISTORY: 'LOG_HISTORY',
    UPDATE_ITEMS_ORDER: 'UPDATE_ITEMS_ORDER',
    SYNC_USER: 'SYNC_USER'
};

/**
 * Add an action to the pending queue (for when offline)
 */
export const queueAction = async (action) => {
    try {
        const pending = await getPendingActions();
        const newAction = {
            ...action,
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        pending.push(newAction);
        await AsyncStorage.setItem(KEYS.PENDING_ACTIONS, JSON.stringify(pending));
        console.log('[Offline] Queued action:', action.type);
        return newAction.id;
    } catch (e) {
        console.error('[Offline] Failed to queue action:', e);
        return null;
    }
};

/**
 * Get all pending actions
 */
export const getPendingActions = async () => {
    try {
        const data = await AsyncStorage.getItem(KEYS.PENDING_ACTIONS);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('[Offline] Failed to get pending actions:', e);
        return [];
    }
};

/**
 * Clear all pending actions (after successful sync)
 */
export const clearPendingActions = async () => {
    try {
        await AsyncStorage.setItem(KEYS.PENDING_ACTIONS, JSON.stringify([]));
        console.log('[Offline] Cleared pending actions');
    } catch (e) {
        console.error('[Offline] Failed to clear pending actions:', e);
    }
};

/**
 * Remove a specific action from queue
 */
export const removeAction = async (actionId) => {
    try {
        const pending = await getPendingActions();
        const updated = pending.filter(a => a.id !== actionId);
        await AsyncStorage.setItem(KEYS.PENDING_ACTIONS, JSON.stringify(updated));
    } catch (e) {
        console.error('[Offline] Failed to remove action:', e);
    }
};

// ==================== LOCAL LIST OPERATIONS ====================

/**
 * Add list locally (for offline mode)
 */
export const addListLocally = async (list) => {
    const lists = await getCachedLists();

    // Calculate next order locally
    const maxOrder = lists.reduce((max, l) => Math.max(max, l.order || 0), 0);

    const newList = {
        ...list,
        id: `local_list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        isLocal: true,
        order: maxOrder + 1,
        createdAt: new Date().toISOString()
    };
    lists.push(newList);
    await cacheLists(lists);
    // Notify UI to update
    await notifyListsChanged();
    return newList;
};

/**
 * Save user info locally
 */
export const saveUserLocally = async (userName, data) => {
    // We don't really have a local users cache, we just queue it
    await queueAction({
        type: ActionTypes.SYNC_USER,
        payload: { userName, data }
    });
};

// ==================== LOCAL ITEM OPERATIONS ====================

/**
 * Add item locally (for offline mode)
 */
export const addItemLocally = async (listId, item) => {
    const items = await getCachedItems(listId);
    const newItem = {
        ...item,
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        isLocal: true,
        createdAt: new Date().toISOString()
    };
    items.unshift(newItem);
    await cacheItems(listId, items);
    // Notify UI to update
    await notifyItemsChanged(listId);
    return newItem;
};

/**
 * Add history log locally
 */
export const addHistoryLocally = async (log) => {
    const logs = await getCachedHistory();
    const newLog = {
        ...log,
        id: `local_hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString()
    };
    logs.unshift(newLog);
    // Keep only last 50 logs locally to save space
    const trimmedLogs = logs.slice(0, 50);
    await cacheHistory(trimmedLogs);
    await notifyHistoryChanged();
    return newLog;
};

/**
 * Update item locally
 */
export const updateItemLocally = async (listId, itemId, updates) => {
    const items = await getCachedItems(listId);
    const index = items.findIndex(i => i.id === itemId);
    if (index !== -1) {
        items[index] = { ...items[index], ...updates, isModified: true };
        await cacheItems(listId, items);
        // Notify UI to update
        await notifyItemsChanged(listId);
    }
};

/**
 * Update items order locally
 */
export const updateItemsOrderLocally = async (listId, orderMap) => {
    const items = await getCachedItems(listId);
    let modified = false;
    items.forEach(item => {
        if (orderMap[item.id] !== undefined) {
            item.order = orderMap[item.id];
            modified = true;
        }
    });

    if (modified) {
        await cacheItems(listId, items);
        await notifyItemsChanged(listId);
    }
};

/**
 * Delete item locally
 */
export const deleteItemLocally = async (listId, itemId) => {
    const items = await getCachedItems(listId);
    const updated = items.filter(i => i.id !== itemId);
    await cacheItems(listId, updated);
    // Notify UI to update
    await notifyItemsChanged(listId);
};

/**
 * Toggle item status locally
 */
export const toggleItemLocally = async (listId, itemId) => {
    const items = await getCachedItems(listId);
    const index = items.findIndex(i => i.id === itemId);
    if (index !== -1) {
        items[index].isCompleted = !items[index].isCompleted;
        items[index].isModified = true;
        await cacheItems(listId, items);
        // Notify UI to update
        await notifyItemsChanged(listId);
        return items[index].isCompleted;
    }
    return null;
};

/**
 * Delete history log locally
 */
export const removeHistoryLocally = async (logId) => {
    try {
        const logs = await getCachedHistory();
        const updated = logs.filter(l => l.id !== logId);
        await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
        await notifyHistoryChanged();
    } catch (e) {
        console.error('[Offline] Failed to remove local history:', e);
    }
};

// ==================== SYNC STATUS ====================

let syncInProgress = false;
let syncListeners = [];

export const subscribeSyncStatus = (callback) => {
    syncListeners.push(callback);
    callback(syncInProgress ? 'syncing' : 'idle');
    return () => {
        syncListeners = syncListeners.filter(l => l !== callback);
    };
};

export const notifySyncStatus = (status) => {
    syncListeners.forEach(l => l(status));
};

export const isSyncing = () => syncInProgress;

export const setSyncing = (value) => {
    syncInProgress = value;
    notifySyncStatus(value ? 'syncing' : 'idle');
};
