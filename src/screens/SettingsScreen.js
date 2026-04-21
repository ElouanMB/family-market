import { useState } from 'react';
import { 
    ActivityIndicator, 
    Alert, 
    ScrollView, 
    StyleSheet, 
    TextInput, 
    TouchableOpacity, 
    View 
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUser } from '../context/UserContext';
import { 
    USER_PALETTES, 
    addFamilyMember, 
    deleteFamilyMember, 
    updateFamilyMember 
} from '../services/userService';

export default function SettingsScreen({ navigation }) {
    const theme = useTheme();
    const { members, user, logout } = useUser();
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async () => {
        if (!newName.trim()) return;
        setIsSubmitting(true);
        try {
            await addFamilyMember(newName.trim(), members.length);
            setNewName('');
            setIsAdding(false);
        } catch (_e) {
            Alert.alert("Erreur", "Impossible d'ajouter le membre.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = (member) => {
        if (member.name === user) {
            Alert.alert("Action impossible", "Vous ne pouvez pas supprimer le profil actuellement connecté.");
            return;
        }

        Alert.alert(
            "Supprimer le profil",
            `Voulez-vous vraiment supprimer le profil de ${member.name} ?`,
            [
                { text: "Annuler", style: "cancel" },
                { 
                    text: "Supprimer", 
                    style: "destructive", 
                    onPress: () => deleteFamilyMember(member.id) 
                }
            ]
        );
    };

    const handleChangeColor = async (member) => {
        const currentIndex = USER_PALETTES.findIndex(p => p.color === member.color);
        const nextIndex = (currentIndex + 1) % USER_PALETTES.length;
        const nextPalette = USER_PALETTES[nextIndex];

        await updateFamilyMember(member.id, {
            color: nextPalette.color,
            bg: nextPalette.bg
        });
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="chevron-left" size={32} color="white" />
                </TouchableOpacity>
                <Text style={styles.title}>Paramètres</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Membres de la famille</Text>
                    {members.map((m) => (
                        <View key={m.id} style={[styles.memberRow, { backgroundColor: theme.colors.surface }]}>
                            <TouchableOpacity 
                                style={[styles.avatar, { backgroundColor: m.bg }]} 
                                onPress={() => handleChangeColor(m)}
                            >
                                <Text style={[styles.avatarText, { color: m.color }]}>{m.name[0]}</Text>
                            </TouchableOpacity>
                            <Text style={styles.memberName}>{m.name} {m.name === user && "(Moi)"}</Text>
                            <TouchableOpacity onPress={() => confirmDelete(m)} style={styles.deleteBtn}>
                                <MaterialCommunityIcons name="trash-can-outline" size={22} color={theme.colors.onSurfaceVariant} />
                            </TouchableOpacity>
                        </View>
                    ))}

                    {isAdding ? (
                        <View style={[styles.addBox, { backgroundColor: theme.colors.surface }]}>
                            <TextInput
                                style={styles.input}
                                value={newName}
                                onChangeText={setNewName}
                                placeholder="Nom du nouveau membre"
                                placeholderTextColor="#666"
                                autoFocus
                            />
                            <View style={styles.btnRow}>
                                <TouchableOpacity onPress={() => setIsAdding(false)} style={styles.smallBtn}>
                                    <Text style={{ color: '#8E8E93' }}>Annuler</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleAdd} style={[styles.smallBtn, styles.primarySmallBtn]}>
                                    {isSubmitting ? <ActivityIndicator size="small" color="black" /> : <Text style={{ color: 'black', fontWeight: '700' }}>Ajouter</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <TouchableOpacity style={styles.addBtn} onPress={() => setIsAdding(true)}>
                            <MaterialCommunityIcons name="plus" size={20} color={theme.colors.primary} />
                            <Text style={styles.addBtnText}>Ajouter un nouveau membre</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Session</Text>
                    <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: theme.colors.surface }]} onPress={logout}>
                        <MaterialCommunityIcons name="account-switch-outline" size={24} color="#FF453A" />
                        <Text style={styles.logoutText}>Changer d'utilisateur</Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.infoBox, { opacity: 0.5 }]}>
                    <Text style={styles.infoText}>Family Market v1.1.6</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, marginBottom: 20 },
    backBtn: { marginRight: 8 },
    title: { fontSize: 24, fontWeight: '800', color: 'white' },
    scroll: { paddingHorizontal: 24, paddingBottom: 40 },
    section: { marginBottom: 32 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase', marginBottom: 12, marginLeft: 4 },
    memberRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 20, marginBottom: 8 },
    avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    avatarText: { fontSize: 18, fontWeight: '700' },
    memberName: { flex: 1, fontSize: 16, fontWeight: '600', color: 'white' },
    deleteBtn: { padding: 8 },
    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: '#2C2C2E' },
    addBtnText: { marginLeft: 8, color: 'white', fontWeight: '600' },
    addBox: { padding: 16, borderRadius: 20, gap: 12 },
    input: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 12, color: 'white' },
    btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    smallBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
    primarySmallBtn: { backgroundColor: 'white' },
    logoutBtn: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 24, gap: 16 },
    logoutText: { color: '#FF453A', fontSize: 16, fontWeight: '700' },
    infoBox: { marginTop: 40, alignItems: 'center' },
    infoText: { color: '#8E8E93', fontSize: 12, marginBottom: 4, textAlign: 'center' },
});
