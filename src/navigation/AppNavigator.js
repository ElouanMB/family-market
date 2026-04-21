import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HistoryScreen from '../screens/HistoryScreen';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ListStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
    );
}

export default function AppNavigator() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: theme.colors.surface,
                    borderTopWidth: 0,
                    height: 60 + insets.bottom, // Dynamic height
                    paddingBottom: insets.bottom + 8, // Dynamic padding
                    paddingTop: 8,
                },
                tabBarActiveTintColor: theme.colors.primary,
                tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                },
                tabBarIcon: ({ focused, color }) => {
                    let iconName;
                    if (route.name === 'Liste') {
                        iconName = focused ? 'cart' : 'cart-outline';
                    } else if (route.name === 'Historique') {
                        iconName = focused ? 'history' : 'history';
                    }
                    return <MaterialCommunityIcons name={iconName} size={24} color={color} />;
                },
            })}
        >
            <Tab.Screen name="Liste" component={ListStack} />
            <Tab.Screen name="Historique" component={HistoryScreen} />
        </Tab.Navigator>
    );
}
