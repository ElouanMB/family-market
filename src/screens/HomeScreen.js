import { useCallback, useEffect, useRef, useState } from 'react';
import { 
    ActivityIndicator, 
    Alert, 
    Animated, 
    Keyboard, 
    KeyboardAvoidingView, 
    Platform, 
    Pressable, 
    ScrollView, 
    StyleSheet, 
    TouchableOpacity, 
    View 
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUser } from '../context/UserContext';
import {
    addItem,
    createShoppingList,
    deleteItem,
    deleteShoppingList,
    ensureDefaultList,
    moveItem,
    subscribeToAllLists,
    subscribeToListItems,
    toggleItemStatus,
    updateItem,
    updateItemsOrder,
    updateListsOrder,
    updateShoppingList
} from '../services/itemsService';
import { useNetworkStatus } from '../services/networkService';
import { registerForPushNotificationsAsync, saveUserToken } from '../services/notificationService';
import { getAllListsItemCounts, subscribeSyncStatus } from '../services/offlineService';



// --- COMPONENTS ---

const ListTab = ({ title, isActive, onPress, count }) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={[styles.tab, isActive && styles.tabActive]}
    >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{title}</Text>
            {count > 0 && (
                <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
                    <Text style={[styles.countText, isActive && styles.countTextActive]}>{count}</Text>
                </View>
            )}
        </View>
    </TouchableOpacity>
);

const AddButton = ({ onPress }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={styles.addBtn}>
        <MaterialCommunityIcons name="pencil" size={28} color="#000" />
    </TouchableOpacity>
);

const Checkbox = ({ checked, onPress, color }) => (
    <TouchableOpacity 
        onPress={onPress} 
        activeOpacity={0.6}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 30 }}
        style={styles.checkboxContainer}
    >
        <View style={[styles.checkbox, checked && { backgroundColor: color, borderColor: color }]}>
            {checked && <MaterialCommunityIcons name="check" size={14} color="#000" />}
        </View>
    </TouchableOpacity>
);

// --- MAIN SCREEN ---

export default function HomeScreen({ navigation }) {
    const theme = useTheme();
    const { user } = useUser();
    const isOnline = useNetworkStatus();

    // DATA
    const [lists, setLists] = useState([]);
    const [activeListId, setActiveListId] = useState(null);
    const [items, setItems] = useState([]);
    const [listCounts, setListCounts] = useState({});

    // DERIVED STATE
    const currentList = lists.find(l => l.id === activeListId);
    const isFirstList = lists.length > 0 && lists[0].id === activeListId;
    const currentListName = currentList ? currentList.name : 'Liste';
    const selectedItems = items.filter(i => i.isCompleted);
    const selectedCount = selectedItems.length;

    // INPUT STATE (Bottom Sheet)
    const [isInputOpen, setInputOpen] = useState(false);
    const [itemName, setItemName] = useState('');
    const [itemQty, setItemQty] = useState('');
    const [editingItem, setEditingItem] = useState(null);
    const [newListingMode, setNewListingMode] = useState(false);
    const [isRenameListMode, setIsRenameListMode] = useState(false);
    const [isBulkEdit, setIsBulkEdit] = useState(false); // Mode "Modifier tout"
    const [isSyncing, setIsSyncing] = useState(false);

    // UNDO DELETE STATE
    const [undoItem, setUndoItem] = useState(null);
    const [deletedIds, setDeletedIds] = useState([]); // Temporary hidden items (for Undo)
    const [deletedListIds, setDeletedListIds] = useState([]); // Temporary hidden lists (for Undo)
    const [undoList, setUndoList] = useState(null);
    const undoProgress = useRef(new Animated.Value(1)).current;
    const undoListProgress = useRef(new Animated.Value(1)).current;
    const undoTimeoutRef = useRef(null);
    const undoListTimeoutRef = useRef(null);

    // Use Ref to avoid stale closure in onSnapshot
    const activeListIdRef = useRef(activeListId);
    useEffect(() => { activeListIdRef.current = activeListId; }, [activeListId]);

    // 0. INIT
    useEffect(() => {
        if (user) ensureDefaultList(user);
        return subscribeSyncStatus(status => setIsSyncing(status === 'syncing'));
    }, [user]);

    // 0. Push Notifs registration (Already handled in UserContext, but kept localized check here just in case)
    useEffect(() => {
        const setupNotifications = async () => {
            if (user) {
                try {
                    const token = await registerForPushNotificationsAsync();
                    await saveUserToken(user, token);
                } catch (e) {
                    console.log('[Notifs] Non-critical error during setup:', e.message);
                }
            }
        };
        setupNotifications();
    }, [user]);

    useEffect(() => {
        const unsub = subscribeToAllLists(fetched => {
            setLists(fetched);
            // Use ref to check current state
            if (!activeListIdRef.current && fetched.length > 0) setActiveListId(fetched[0].id);
            if (fetched.length === 0) setActiveListId(null);
        });
        return () => unsub();
    }, []);

    const updateCounts = useCallback(async () => {
        const counts = await getAllListsItemCounts();
        setListCounts(counts);
    }, []);

    useEffect(() => {
        updateCounts();
    }, [updateCounts]);

    useEffect(() => {
        if (!activeListId) { setItems([]); return; }
        return subscribeToListItems(activeListId, (fetchedItems) => {
            setItems(fetchedItems);
            updateCounts();
        });
    }, [activeListId, updateCounts]);

    useEffect(() => {
        updateCounts();
    }, [updateCounts]);

    // ACTIONS
    const handleDeleteSelected = () => {
        if (selectedCount === 0) return;

        Alert.alert(
            "Supprimer",
            `Supprimer les ${selectedCount} articles sélectionnés ?`,
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    style: 'destructive',
                    onPress: async () => {
                        // Optimistic UI could be done here but let's keep it simple
                        for (const item of selectedItems) {
                            await deleteItem(item.id, item.name, user, currentListName, activeListId);
                        }
                    }
                }
            ]
        );
    };

    const handleMoveSelected = () => {
        if (selectedCount === 0) return;

        const otherLists = lists.filter(l => l.id !== activeListId);
        if (otherLists.length === 0) {
            Alert.alert("Info", "Aucune autre liste disponible pour le déplacement.");
            return;
        }

        Alert.alert(
            "Déplacer",
            `Vers quelle liste déplacer les ${selectedCount} articles ?`,
            [
                ...otherLists.map(l => ({
                    text: l.name,
                    onPress: async () => {
                        for (const item of selectedItems) {
                            await moveItem(item.id, l.id, item.name, user, currentListName, l.name, activeListId);
                        }
                    }
                })),
                { text: "Annuler", style: "cancel" }
            ]
        );
    };

    const handleClearSelection = async () => {
        for (const item of selectedItems) {
            await toggleItemStatus(item.id, item.name, true, user, currentListName, activeListId);
        }
    };

    const handleOrderChange = async (newData) => {
        setItems(newData);
        const orderMap = {};
        newData.forEach((it, idx) => {
            orderMap[it.id] = idx;
        });
        await updateItemsOrder(activeListId, orderMap);
    };

    const handleMoveList = async (direction) => {
        if (!activeListId || isFirstList) return;

        const currentIndex = lists.findIndex(l => l.id === activeListId);
        const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;

        if (newIndex < 1 || newIndex >= lists.length) return; // Cannot move before Courses (index 0) or beyond bounds

        const newLists = [...lists];
        const [movedList] = newLists.splice(currentIndex, 1);
        newLists.splice(newIndex, 0, movedList);

        // Update local state for instant feedback
        setLists(newLists);

        // Persistent update in DB
        const orderMap = {};
        newLists.forEach((list, idx) => {
            orderMap[list.id] = idx;
        });
        await updateListsOrder(orderMap);
    };

    const handleAddOrUpdate = async () => {
        if (!itemName.trim() && !isBulkEdit) return closeInput();

        if (newListingMode) {
            if (!itemName.trim()) {
                return closeInput();
            }
            if (isRenameListMode) {
                // Update existing list
                await updateShoppingList(activeListId, itemName.trim(), user);
            } else {
                // Create new list
                const newListId = await createShoppingList(itemName.trim(), user);
                if (newListId) setActiveListId(newListId);
            }
        } else if (isBulkEdit) {
            // --- SYNC BULK EDIT ---
            const newLines = itemName.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const activeItems = items.filter(i => !i.isCompleted);

            // 1. Identify items to Delete
            const newLinesLower = newLines.map(l => l.toLowerCase());

            // Items to Delete: Exists in DB but not in Text
            const itemsToDelete = activeItems.filter(i => !newLinesLower.includes(i.name.toLowerCase()));

            // Let's execute deletes first
            await Promise.all(itemsToDelete.map(item => deleteItem(item.id, item.name, user, currentListName, activeListId)));

            // Now add missing items.
            const remainingActive = [...activeItems.filter(i => !itemsToDelete.includes(i))];
            const itemsToAddPromises = [];

            for (const line of newLines) {
                const matchIndex = remainingActive.findIndex(i => i.name.toLowerCase() === line.toLowerCase());
                if (matchIndex !== -1) {
                    // Lines matches an existing item, remove it from pool so we don't match it again
                    remainingActive.splice(matchIndex, 1);
                } else {
                    // No match found, create new
                    itemsToAddPromises.push(addItem(activeListId, line, '', '', user, currentListName));
                }
            }
            await Promise.all(itemsToAddPromises);

        } else {
            // Create/Update Single Item OR Fallback Bulk Add
            if (editingItem) {
                await updateItem(editingItem.id, { name: itemName, quantity: itemQty }, itemName, user, currentListName, activeListId);
            } else {
                // Bulk Add (Standard Mode)
                const lines = itemName.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                // Use Promise.all to ensure all complete before closing
                await Promise.all(lines.map(line => addItem(activeListId, line, '', '', user, currentListName)));
            }
        }
        closeInput();
    };

    const handleDelete = (item) => {
        if (!item) return;

        // Confirm before delete is good practice, but swipe usually implies intent. 
        // User asked for "swipe to delete". Often swipe + confirm or swipe + undo.
        // For now, prompt to be safe as per original logic, or direct delete if swiped?
        // Let's keep the alert for consistency but maybe fast delete?
        // User said "faire glisser vers la gauche le supprime", implies action.
        // I will make it direct delete on swipe or simple confirmation.
        // Let's stick to the prompt.
        Alert.alert("Supprimer", `Retirer ${item.name} ?`, [
            { text: "Annuler", style: "cancel" },
            { text: "Supprimer", style: 'destructive', onPress: () => deleteItem(item.id, item.name, user, currentListName, activeListId) }
        ]);
    };

    // Direct delete for Swipe with UNDO
    const handleSwipeDelete = (item) => {
        // 1. If another item was pending, finalize it immediately
        if (undoTimeoutRef.current) {
            clearTimeout(undoTimeoutRef.current);
            const pendingItem = undoItem;
            deleteItem(pendingItem.id, pendingItem.name, user, currentListName, activeListId);
        }

        // 2. Setup new undo
        setUndoItem(item);
        setDeletedIds(prev => [...prev, item.id]); // Hide from UI
        undoProgress.setValue(1);

        // 3. Start animation
        Animated.timing(undoProgress, {
            toValue: 0,
            duration: 5000,
            useNativeDriver: false,
        }).start();

        // 4. Set timeout for actual deletion
        undoTimeoutRef.current = setTimeout(() => {
            deleteItem(item.id, item.name, user, currentListName, activeListId);
            setUndoItem(null);
            setDeletedIds(prev => prev.filter(id => id !== item.id));
            undoTimeoutRef.current = null;
        }, 5000);
    };

    const handleUndoDelete = () => {
        if (undoTimeoutRef.current) {
            clearTimeout(undoTimeoutRef.current);
            undoTimeoutRef.current = null;
        }
        if (undoItem) {
            setDeletedIds(prev => prev.filter(id => id !== undoItem.id)); // Show back
            setUndoItem(null);
        }
    };

    const handleUndoDeleteList = () => {
        if (undoListTimeoutRef.current) {
            clearTimeout(undoListTimeoutRef.current);
            undoListTimeoutRef.current = null;
        }
        if (undoList) {
            setDeletedListIds(prev => prev.filter(id => id !== undoList.id)); // Show back
            if (activeListId === null) setActiveListId(undoList.id);
            setUndoList(null);
        }
    };


    const confirmDeleteList = () => {
        if (!currentList) return;
        const listToDelete = currentList;

        // 1. If another list was pending, finalize it
        if (undoListTimeoutRef.current) {
            clearTimeout(undoListTimeoutRef.current);
            const pendingList = undoList;
            deleteShoppingList(pendingList.id, pendingList.name, user);
        }

        // 2. Setup new undo
        setUndoList(listToDelete);
        setDeletedListIds(prev => [...prev, listToDelete.id]);

        // Hide list immediately by switching to another or null
        const otherList = lists.find(l => l.id !== listToDelete.id);
        setActiveListId(otherList ? otherList.id : null);

        undoListProgress.setValue(1);

        // 3. Start animation
        Animated.timing(undoListProgress, {
            toValue: 0,
            duration: 5000,
            useNativeDriver: false,
        }).start();

        // 4. Set timeout for actual deletion
        undoListTimeoutRef.current = setTimeout(() => {
            deleteShoppingList(listToDelete.id, listToDelete.name, user);
            setUndoList(null);
            setDeletedListIds(prev => prev.filter(id => id !== listToDelete.id));
            undoListTimeoutRef.current = null;
        }, 5000);
    };


    const openInput = (item = null, isListMode = false, isRename = false) => {
        setNewListingMode(isListMode);
        setIsRenameListMode(isRename);

        if (item) {
            // Edit Single Item
            setIsBulkEdit(false);
            setEditingItem(item);
            setItemName(item.name);
            setItemQty(item.quantity || '');
        } else if (isListMode) {
            // New List or Rename
            setIsBulkEdit(false);
            setEditingItem(null);
            setItemName(isRename ? currentList?.name : '');
            setItemQty('');
        } else {
            // FAB Click -> Item List Bulk Edit
            // Load current active items into text
            setIsBulkEdit(true);
            setEditingItem(null);
            const activeText = items
                .filter(i => !i.isCompleted)
                .map(i => i.name)
                .join('\n');
            setItemName(activeText);
            setItemQty('');
        }
        setInputOpen(true);
    };

    const closeInput = () => {
        setInputOpen(false);
        Keyboard.dismiss();
    };



    const renderRightActions = (_progress, _dragX, item) => {
        return (
            <TouchableOpacity style={styles.deleteAction} onPress={() => handleDelete(item)}>
                <MaterialCommunityIcons name="trash-can-outline" size={24} color="white" />
            </TouchableOpacity>
        );
    };


    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>

                {/* 1. HEADER / SELECTION MENU */}
                {selectedCount > 0 ? (
                    <View style={styles.selectionMenu}>
                        <View style={styles.selectionInfo}>
                            <TouchableOpacity onPress={handleClearSelection} style={styles.closeSelectionBtn}>
                                <MaterialCommunityIcons name="close" size={24} color="white" />
                            </TouchableOpacity>
                            <Text style={styles.selectionText}>{selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}</Text>
                        </View>
                        <View style={styles.selectionActions}>
                            <TouchableOpacity onPress={handleMoveSelected} style={styles.selectionBtn}>
                                <MaterialCommunityIcons name="folder-move-outline" size={24} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleDeleteSelected} style={[styles.selectionBtn, { marginLeft: 20 }]}>
                                <MaterialCommunityIcons name="trash-can-outline" size={24} color="#FF453A" />
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={styles.header}>
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={styles.headerTitle}>Family Market</Text>
                                {!isOnline && (
                                    <MaterialCommunityIcons name="wifi-off" size={18} color="#FF9500" />
                                )}
                            </View>
                            <Text style={styles.headerSubtitle}>Mes listes de courses</Text>
                        </View>
                        <TouchableOpacity 
                            onPress={() => navigation.navigate('Settings')}
                            style={styles.settingsIconBtn}
                        >
                            <MaterialCommunityIcons name="cog-outline" size={28} color="#8E8E93" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* 2. TABS (LISTS) */}
                <View style={styles.tabsContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
                        {lists
                            .filter(l => !deletedListIds.includes(l.id))
                            .map((list) => (
                                <ListTab
                                    key={list.id}
                                    title={list.name}
                                    isActive={activeListId === list.id}
                                    onPress={() => setActiveListId(list.id)}
                                    count={listCounts[list.id] || 0}
                                />
                            ))}
                        <TouchableOpacity style={styles.addTab} onPress={() => openInput(null, true)}>
                            <MaterialCommunityIcons name="plus" size={24} color="#8E8E93" />
                        </TouchableOpacity>
                    </ScrollView>
                </View>

                {/* 3. CONTENT AREA (DRAGGABLE LIST) */}
                {!activeListId ? (
                    <View style={styles.emptyStateContainer}>
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>Aucune liste sélectionnée.</Text>
                            <Text style={styles.emptySub}>Créez-en une nouvelle ci-dessus.</Text>
                        </View>
                    </View>
                ) : (
                    <DraggableFlatList
                        data={items.filter(i => !deletedIds.includes(i.id))}
                        onDragEnd={({ data }) => handleOrderChange(data)}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item, drag, isActive }) => (
                            <ScaleDecorator>
                                <Swipeable
                                    renderRightActions={(p, d) => renderRightActions(p, d, item)}
                                    onSwipeableOpen={() => handleSwipeDelete(item)}
                                >
                                    <TouchableOpacity
                                        style={[
                                            styles.itemRow,
                                            isActive && { backgroundColor: '#2C2C2E', transform: [{ scale: 1.02 }] }
                                        ]}
                                        activeOpacity={0.7}
                                        onPress={() => openInput(item)}
                                        onLongPress={drag}
                                        disabled={isActive}
                                    >
                                        <Checkbox
                                            checked={item.isCompleted}
                                            onPress={() => toggleItemStatus(item.id, item.name, item.isCompleted, user, currentListName, activeListId)}
                                            color={theme.colors.secondary}
                                        />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.itemText, item.isCompleted && styles.itemTextSelected]}>{item.name}</Text>
                                            {item.quantity ? <Text style={styles.itemMeta}>{item.quantity}</Text> : null}
                                        </View>

                                        {selectedCount === 0 && (
                                            <MaterialCommunityIcons name="drag-vertical" size={24} color="#8E8E93" style={{ opacity: 0.3, marginRight: 8 }} />
                                        )}

                                        <MaterialCommunityIcons name="chevron-right" size={20} color="#3A3A3C" style={{ opacity: 0.2 }} />
                                    </TouchableOpacity>
                                </Swipeable>
                            </ScaleDecorator>
                        )}
                        ListEmptyComponent={
                            <TouchableOpacity style={[styles.emptyState, { marginTop: 60 }]} onPress={() => openInput()}>
                                <MaterialCommunityIcons name="text-box-plus-outline" size={64} color="#333" />
                                <Text style={[styles.emptySub, { marginTop: 16 }]}>Votre liste est vide</Text>
                                <Text style={{ color: 'white', marginTop: 8, fontSize: 16, fontWeight: '600' }}>Appuyez ici pour écrire...</Text>
                            </TouchableOpacity>
                        }
                        ListFooterComponent={
                            <View>
                                {/* Rename / Delete / Move List Buttons */}
                                {currentList && (
                                    <View style={styles.listOpsContainer}>
                                        <TouchableOpacity
                                            onPress={() => handleMoveList('left')}
                                            disabled={lists.findIndex(l => l.id === activeListId) <= 1}
                                            style={[styles.moveListBtn, lists.findIndex(l => l.id === activeListId) <= 1 && { opacity: 0.3 }]}
                                        >
                                            <MaterialCommunityIcons name="chevron-left" size={24} color="#8E8E93" />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => openInput(null, true, true)}
                                            style={styles.renameListBtn}
                                        >
                                            <MaterialCommunityIcons name="pencil-outline" size={18} color="#8E8E93" />
                                            <Text style={styles.renameListText}>Renommer</Text>
                                        </TouchableOpacity>

                                        {!isFirstList && (
                                            <Pressable
                                                onPress={confirmDeleteList}
                                                style={({ pressed }) => [
                                                    styles.deleteListBtnCompact,
                                                    pressed && styles.deleteListBtnPressed
                                                ]}
                                            >
                                                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF453A" />
                                                <Text style={styles.deleteListText}>Supprimer</Text>
                                            </Pressable>
                                        )}

                                        <TouchableOpacity
                                            onPress={() => handleMoveList('right')}
                                            disabled={lists.findIndex(l => l.id === activeListId) === lists.length - 1}
                                            style={[styles.moveListBtn, lists.findIndex(l => l.id === activeListId) === lists.length - 1 && { opacity: 0.3 }]}
                                        >
                                            <MaterialCommunityIcons name="chevron-right" size={24} color="#8E8E93" />
                                        </TouchableOpacity>
                                    </View>
                                )}

                                <View style={styles.versionContainer}>
                                    <Text style={styles.versionText}>Version {Constants.expoConfig?.version || Constants.manifest?.version || '1.1.4'} (PROD)</Text>
                                </View>

                                <View style={{ height: 100 }} />
                            </View>
                        }
                        contentContainerStyle={styles.content}
                    />
                )}

                {/* 4. FAB */}
                {activeListId && !isInputOpen && (
                    <View style={styles.fabContainer}>
                        <AddButton onPress={() => openInput()} />
                    </View>
                )}

                {/* 5. BOTTOM SHEET INPUT OVERLAY */}
                {isInputOpen && (
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.inputOverlay}
                    >
                        <TouchableOpacity style={styles.backdrop} onPress={closeInput} />
                        <View style={styles.inputSheet}>
                            <View style={styles.inputHeader}>
                                <Text style={styles.inputTitle}>
                                    {isRenameListMode ? 'Renommer la liste' : (newListingMode ? 'Nouvelle Liste' : (editingItem ? 'Modifier' : (isBulkEdit ? 'Modifier ma liste' : 'Ajouter')))}
                                </Text>
                                <TouchableOpacity onPress={closeInput}>
                                    <Text style={{ color: '#888' }}>Fermer</Text>
                                </TouchableOpacity>
                            </View>

                            <TextInput
                                placeholder={newListingMode ? "Nom de la liste..." : (editingItem ? "Nom de l'article" : "Modifiez votre liste librement...")}
                                placeholderTextColor="#666"
                                style={[styles.mainInput, (isBulkEdit) && styles.bulkInput]}
                                value={itemName}
                                onChangeText={setItemName}
                                autoFocus
                                cursorColor="white"
                                selectionColor="rgba(255,255,255,0.3)"
                                multiline={!newListingMode && !editingItem} // Multiline for bulk/add
                                textAlignVertical={!newListingMode && !editingItem ? 'top' : 'center'}
                                theme={{ colors: { background: 'transparent', text: 'white', placeholder: '#666', primary: 'white' } }}
                                underlineColor="transparent"
                                activeUnderlineColor="transparent"
                            />

                            {(editingItem || newListingMode) && (
                                <View style={styles.qtyContainer}>
                                    {!newListingMode && (
                                        <TextInput
                                            placeholder="Qté (ex: 2, 1kg)"
                                            placeholderTextColor="#555"
                                            style={styles.qtyInput}
                                            value={itemQty}
                                            onChangeText={setItemQty}
                                            theme={{ colors: { background: '#222', text: 'white', placeholder: '#555' } }}
                                        />
                                    )}
                                </View>
                            )}

                            <TouchableOpacity onPress={handleAddOrUpdate} style={styles.saveBtn}>
                                <Text style={styles.saveBtnText}>Valider</Text>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                )}

                {/* 6. SYNC OVERLAY */}
                {isSyncing && (
                    <View style={styles.syncOverlay}>
                        <View style={styles.syncBox}>
                            <ActivityIndicator size="large" color="#FF9500" />
                            <Text style={styles.syncText}>Mise à jour...</Text>
                        </View>
                    </View>
                )}

                {/* 7. UNDO BAR (Lists & Items) */}
                {(undoItem || undoList) && (
                    <View style={styles.undoContainer}>
                        <View style={styles.undoContent}>
                            <Text style={styles.undoLabel}>
                                {undoList ? `Liste "${undoList.name}" supprimée` : `"${undoItem.name}" supprimé`}
                            </Text>
                            <TouchableOpacity onPress={undoList ? handleUndoDeleteList : handleUndoDelete} style={styles.undoBtn}>
                                <Text style={styles.undoBtnText}>ANNULER</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.undoProgressWrapper}>
                            <Animated.View style={[
                                styles.undoProgressBar,
                                {
                                    width: (undoList ? undoListProgress : undoProgress).interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['0%', '100%']
                                    })
                                }
                            ]} />
                        </View>
                    </View>
                )}

            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    // Header
    header: {
        paddingHorizontal: 24,
        paddingTop: 10,
        paddingBottom: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    headerDate: { color: '#8E8E93', fontSize: 13, fontWeight: '600', marginBottom: 4, letterSpacing: 0.5 },
    headerTitle: { color: 'white', fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    headerSubtitle: { color: '#8E8E93', fontSize: 14, fontWeight: '500' },
    settingsIconBtn: {
        padding: 4,
    },
    offlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FF9500',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
    },
    offlineText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '600',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },

    // Tabs
    tabsContainer: { height: 60 },
    tabsScroll: { paddingHorizontal: 24, gap: 12, alignItems: 'center' },
    tab: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 30,
        backgroundColor: '#1C1C1E',
        borderWidth: 0,
    },
    tabActive: {
        backgroundColor: '#FFFFFF',
    },
    tabText: { color: '#8E8E93', fontWeight: '600', fontSize: 15 },
    tabTextActive: { color: 'black', fontWeight: '700' },
    addTab: {
        width: 44,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
    },

    // List Tab Count
    countBadge: {
        backgroundColor: '#2C2C2E',
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    countBadgeActive: {
        backgroundColor: 'black',
    },
    countText: {
        color: '#8E8E93',
        fontSize: 10,
        fontWeight: '700',
    },
    countTextActive: {
        color: 'white',
    },

    // Selection Menu
    selectionMenu: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 10,
        paddingBottom: 20,
        backgroundColor: '#1C1C1E', // or theme background
    },
    selectionInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    selectionText: {
        color: 'white',
        fontSize: 18,
        fontWeight: '700',
    },
    selectionActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    selectionBtn: {
        padding: 5,
    },
    closeSelectionBtn: {
        padding: 4,
    },

    // Content
    content: { padding: 24, paddingBottom: 120 },
    emptyState: { alignItems: 'center', marginTop: 100 },
    emptyText: { color: 'white', fontSize: 18, fontWeight: '600' },
    emptySub: { color: '#8E8E93', marginTop: 8 },

    // Items
    sectionHeader: { color: '#8E8E93', fontSize: 13, fontWeight: '700', marginTop: 32, marginBottom: 12, marginLeft: 4, letterSpacing: 1 },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        marginBottom: 8,
    },
    itemText: { color: 'white', fontSize: 15, fontWeight: '500' },
    itemTextSelected: { color: '#FFFFFF', opacity: 0.8 }, // or some other style
    itemTextDone: { color: '#555' },
    itemMeta: { color: '#8E8E93', fontSize: 12, marginTop: 2 },

    // Checkbox custom
    checkboxContainer: {
        paddingVertical: 4,
        paddingHorizontal: 4,
        marginRight: 4,
        marginLeft: -4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 7, 
        borderWidth: 2,
        borderColor: '#48484A',
        justifyContent: 'center',
        alignItems: 'center'
    },

    // FAB
    fabContainer: { position: 'absolute', bottom: 32, right: 32 },
    addBtn: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },

    // Input Bottom Sheet
    inputOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
    inputSheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 50, maxHeight: '90%' },
    inputHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    inputTitle: { color: '#8E8E93', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },

    // Undo Bar List Specific
    undoListContainer: {
        backgroundColor: '#2C2C2E',
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    undoInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    undoListText: { color: 'white', fontSize: 13, fontWeight: '500' },
    undoListBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    undoListBtnText: { color: '#FF9500', fontWeight: 'bold' },
    undoListProgressBar: { height: 3, backgroundColor: '#FF9500' },

    // Improved Input visibility
    mainInput: {
        fontSize: 20,
        fontWeight: '500',
        color: 'white',
        backgroundColor: '#2C2C2E', // Distinct background
        borderRadius: 16,
        padding: 16,
        minHeight: 60,
    },
    bulkInput: {
        minHeight: 300,
        maxHeight: 500, // Allow it to grow
        fontSize: 18, // Bigger text
        lineHeight: 28,
        textAlignVertical: 'top', // Ensure starts at top
        paddingTop: 16
    },
    qtyContainer: { flexDirection: 'row', marginTop: 16, gap: 12 },
    qtyInput: { flex: 1, backgroundColor: '#2C2C2E', borderRadius: 16, height: 56, color: 'white', paddingHorizontal: 16 },
    deleteBtn: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center', backgroundColor: '#3A1515', borderRadius: 16 },
    saveBtn: { backgroundColor: 'white', borderRadius: 20, height: 56, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
    saveBtnText: { color: 'black', fontWeight: '800', fontSize: 18 },

    // Swipe Actions
    deleteAction: {
        backgroundColor: '#FF453A',
        justifyContent: 'center',
        alignItems: 'center',
        width: 70,
        height: '100%',
        borderRadius: 12,
        marginBottom: 8,
        marginLeft: 8, // Spacing from item
    },

    // List Operations
    listOpsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        marginTop: 20,
    },
    renameListBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
    },
    moveListBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
    },
    renameListText: {
        color: '#8E8E93',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 8,
    },
    deleteListBtnCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,69,58,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
    },
    deleteListBtn: {
        marginTop: 40,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(255, 69, 58, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 69, 58, 0.3)',
    },
    deleteListBtnPressed: {
        backgroundColor: 'rgba(255, 69, 58, 0.25)',
        transform: [{ scale: 0.98 }],
    },
    deleteListText: {
        color: '#FF453A',
        fontSize: 14,
        fontWeight: '600',
    },

    // Sync Overlay
    syncOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 200,
    },
    syncBox: {
        backgroundColor: '#1C1C1E',
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
    },
    syncText: {
        color: 'white',
        marginTop: 16,
        fontSize: 16,
        fontWeight: '600'
    },
    versionContainer: {
        marginTop: 40,
        alignItems: 'center',
        opacity: 0.4
    },
    versionText: {
        color: '#8E8E93',
        fontSize: 12,
        fontWeight: '600'
    },
    versionSubtext: {
        color: '#8E8E93',
        fontSize: 10,
        marginTop: 4
    },

    // Undo Bar
    undoContainer: {
        position: 'absolute',
        bottom: 100,
        left: 24,
        right: 24,
        backgroundColor: '#2C2C2E',
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
        zIndex: 1000,
    },
    undoContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    undoLabel: {
        color: 'white',
        fontSize: 14,
        fontWeight: '500',
    },
    undoBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    undoBtnText: {
        color: '#FF9500',
        fontSize: 12,
        fontWeight: '800',
    },
    undoProgressWrapper: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.1)',
        width: '100%',
    },
    undoProgressBar: {
        height: '100%',
        backgroundColor: '#FF9500',
    },
    itemOrderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 4,
    },
    orderBtn: {
        padding: 2,
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
    },
});
