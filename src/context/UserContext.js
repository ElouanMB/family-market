import { 
    createContext, 
    useCallback, 
    useContext, 
    useEffect, 
    useState 
} from 'react';
import { 
    ActivityIndicator, 
    Alert, 
    Image, 
    ScrollView, 
    StatusBar, 
    StyleSheet, 
    TextInput, 
    TouchableOpacity, 
    View 
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import Logo from '../../assets/icon-square.png';
import { addFamilyMember, subscribeToFamilyMembers } from '../services/userService';

const UserContext = createContext();
export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState([]);

    const loadUser = useCallback(async () => {
        try {
            const savedUser = await AsyncStorage.getItem('family_market_user_v1');
            if (savedUser) setUser(savedUser);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        loadUser();
        const unsub = subscribeToFamilyMembers(setMembers);
        return () => unsub();
    }, [loadUser]);

    const login = async (name) => {
        try {
            await AsyncStorage.setItem('family_market_user_v1', name);
            setUser(name);
        } catch (e) { console.error(e); }
    };

    const logout = async () => {
        try {
            await AsyncStorage.removeItem('family_market_user_v1');
            setUser(null);
        } catch (e) { console.error(e); }
    };

    if (loading) return null;

    if (!user) {
        return <LoginScreen onLogin={login} members={members} />;
    }

    return (
        <UserContext.Provider value={{ user, members, logout, login }}>
            {children}
        </UserContext.Provider>
    );
};

function LoginScreen({ onLogin, members }) {
    const theme = useTheme();
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreateUser = async () => {
        if (!newName.trim()) return;
        setIsSubmitting(true);
        try {
            const colorIdx = members.length;
            await addFamilyMember(newName.trim(), colorIdx);
            onLogin(newName.trim()); // Connect automatically
        } catch (_e) {
            Alert.alert("Erreur", "Impossible de créer le profil.");
        } finally {
            setIsSubmitting(false);
            setIsCreating(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle="light-content" />
            <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <View style={[styles.iconContainer, { backgroundColor: 'transparent' }]}>
                        <Image source={Logo} style={{ width: 120, height: 120 }} resizeMode="contain" />
                    </View>
                    <Text style={styles.title}>Family Market</Text>
                    <Text style={styles.subtitle}>{members.length > 0 ? "Qui utilise l'app ?" : "Bienvenue ! Créez le premier membre."}</Text>
                </View>

                {isCreating ? (
                    <View style={[styles.createBox, { backgroundColor: theme.colors.surface }]}>
                        <Text style={styles.label}>Nom du membre</Text>
                        <TextInput
                            style={styles.input}
                            value={newName}
                            onChangeText={setNewName}
                            placeholder="Ex: Elouan"
                            placeholderTextColor="#666"
                            autoFocus
                        />
                        <View style={styles.btnRow}>
                            <TouchableOpacity 
                                onPress={() => setIsCreating(false)} 
                                style={[styles.btn, styles.btnSecondary]}
                                disabled={isSubmitting}
                            >
                                <Text style={styles.btnTextSecondary}>Annuler</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={handleCreateUser} 
                                style={[styles.btn, styles.btnPrimary]}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? <ActivityIndicator color="black" /> : <Text style={styles.btnTextPrimary}>Créer</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={styles.userList}>
                        {members.map((m) => (
                            <TouchableOpacity
                                key={m.id}
                                style={[styles.userRow, { backgroundColor: theme.colors.surface }]}
                                activeOpacity={0.7}
                                onPress={() => onLogin(m.name)}
                            >
                                <View style={[styles.avatar, { backgroundColor: m.bg || '#333' }]}>
                                    <Text style={[styles.avatarText, { color: m.color || '#FFF' }]}>{m.name[0]}</Text>
                                </View>
                                <Text style={styles.userName}>{m.name}</Text>
                                <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                            style={[styles.addUserBtn, { borderColor: theme.colors.outline }]}
                            activeOpacity={0.7}
                            onPress={() => setIsCreating(true)}
                        >
                            <MaterialCommunityIcons name="plus" size={24} color={theme.colors.onSurfaceVariant} />
                            <Text style={styles.addUserText}>Ajouter un membre</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 24 },
    header: { marginTop: 60, marginBottom: 60 },
    iconContainer: {
        width: 150, height: 150,
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 24
    },
    title: {
        fontSize: 40, fontWeight: '800', color: 'white',
        letterSpacing: -1, lineHeight: 48
    },
    subtitle: {
        fontSize: 20, color: '#888', marginTop: 8
    },
    userList: { gap: 16 },
    userRow: {
        flexDirection: 'row', alignItems: 'center',
        padding: 16, borderRadius: 24,
    },
    avatar: {
        width: 48, height: 48, borderRadius: 24,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 16
    },
    avatarText: { fontSize: 20, fontWeight: '700' },
    userName: {
        flex: 1, fontSize: 18, fontWeight: '600', color: 'white'
    },
    addUserBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        padding: 16, borderRadius: 24, borderStyle: 'dashed', borderWidth: 1,
        marginTop: 8
    },
    addUserText: {
        marginLeft: 8, fontSize: 16, fontWeight: '600', color: '#8E8E93'
    },
    createBox: {
        padding: 24, borderRadius: 30, gap: 16
    },
    label: { color: '#8E8E93', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 16, borderRadius: 16, color: 'white', fontSize: 18, fontWeight: '600'
    },
    btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
    btn: { flex: 1, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    btnPrimary: { backgroundColor: 'white' },
    btnSecondary: { backgroundColor: 'rgba(255,255,255,0.1)' },
    btnTextPrimary: { color: 'black', fontWeight: '800', fontSize: 16 },
    btnTextSecondary: { color: 'white', fontWeight: '600' },
});
