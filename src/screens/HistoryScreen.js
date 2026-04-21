import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUser } from '../context/UserContext';
import { subscribeToHistory } from '../services/itemsService';

export default function HistoryScreen() {
    const [logs, setLogs] = useState([]);
    const { members } = useUser();

    useEffect(() => {
        const unsubscribe = subscribeToHistory(setLogs);
        return () => unsubscribe();
    }, []);

    const formatTime = (isoString) => {
        const date = new Date(isoString);
        return {
            time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            day: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        };
    };

    const getIcon = (action) => {
        if (action === 'add') return { name: 'plus', color: '#32D74B' }; // Green
        if (action === 'delete') return { name: 'trash-can-outline', color: '#FF453A' }; // Red
        if (action === 'complete') return { name: 'check', color: '#32D74B' }; // Green
        return { name: 'circle-small', color: '#888' };
    };

    const renderItem = ({ item, index }) => {
        const isLast = index === logs.length - 1;
        const { time, day } = formatTime(item.createdAt);
        const iconConfig = getIcon(item.action);
        
        // Find member color in the dynamic list
        const member = members.find(m => m.name === item.user);
        const uColor = member ? { color: member.color } : { color: '#FFF' };

        return (
            <View style={styles.row}>
                {/* Left Time Column */}
                <View style={styles.timeCol}>
                    <Text style={styles.timeText}>{time}</Text>
                    <Text style={styles.dayText}>{day}</Text>
                </View>

                {/* Timeline Line */}
                <View style={styles.timelineCol}>
                    <View style={[styles.dot, { borderColor: iconConfig.color }]} />
                    {!isLast && <View style={styles.line} />}
                </View>

                {/* Content Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Text style={[styles.userText, { color: uColor.color }]}>{item.user}</Text>
                        <Text style={styles.listNameText}>{item.listName}</Text>
                        <MaterialCommunityIcons name={iconConfig.name} size={16} color={iconConfig.color} />
                    </View>
                    <Text style={styles.descText}>{item.description}</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Journal</Text>
            </View>
            <FlatList
                data={logs}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { padding: 24, paddingBottom: 16 },
    headerTitle: { fontSize: 34, fontWeight: '800', color: 'white', letterSpacing: -1 },

    list: { paddingHorizontal: 20 },
    row: { flexDirection: 'row', marginBottom: 0 },

    timeCol: { width: 50, alignItems: 'flex-end', marginRight: 12, paddingTop: 4 },
    timeText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
    dayText: { color: '#666', fontSize: 11, marginTop: 2 },

    timelineCol: { alignItems: 'center', width: 20 },
    dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: '#000', zIndex: 1 },
    line: { width: 2, flex: 1, backgroundColor: '#333', marginTop: -2, marginBottom: -2 },

    card: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 12, padding: 12, marginBottom: 16, marginLeft: 8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    userText: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    listNameText: { color: '#666', fontSize: 11, fontWeight: '600', flex: 1, textAlign: 'right', marginRight: 8, fontStyle: 'italic' },
    descText: { color: '#DDD', fontSize: 15, lineHeight: 20 },
});
