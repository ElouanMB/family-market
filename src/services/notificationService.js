import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { isOnline } from './networkService';

// 1. Configure Handler (Foreground behavior)
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

// 2. Register for Push Notifications
export async function registerForPushNotificationsAsync() {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    if (!Device.isDevice) {
        console.log('Must use physical device for Push Notifications');
        // return null; 
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        alert('Notifications désactivées : vous ne recevrez pas d\'alertes :( Allez dans les réglages du téléphone pour les activer.');
        return null;
    }

    // Get the token
    // Check for projectId in app config if needed, usually automatic in Expo Go / EAS
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    try {
        const pushTokenString = (await Notifications.getExpoPushTokenAsync({
            projectId,
        })).data;
        return pushTokenString;
    } catch (e) {
        console.error("Error fetching push token", e);
        return null;
    }
}

// 3. Save User Token to Firestore
export const saveUserToken = async (userName, token) => {
    if (!userName) return;

    const userData = {
        pushToken: token || null,
        lastSeen: new Date().toISOString(),
        platform: Platform.OS,
        isDevice: Device.isDevice,
        appVersion: Constants?.expoConfig?.version || 'unknown'
    };

    console.log(`[Notifs] Syncing user ${userName} (Token: ${token ? 'YES' : 'NO'})`);

    if (!isOnline()) {
        const { saveUserLocally } = require('./offlineService');
        await saveUserLocally(userName, userData); // Corrected: Pass userData directly
        console.log('[Notifs] Offline, user sync queued');
        return;
    }

    try {
        // Save to a 'users' collection with the username as ID
        await setDoc(doc(db, 'users', userName), userData, { merge: true });
        console.log(`[Notifs] User ${userName} synced to Firestore`);
    } catch (e) {
        console.error("Error saving token", e);
    }
};

// 4. Send Push Notification (Client to Expo API)
// In a real production app, this should be done via a Backend Server (Cloud Functions)
// for security. But for this standalone app, we can call Expo API directly.
export const sendPushNotificationToOthers = async (title, body, currentUserName) => {
    try {
        // A. Get all users
        const usersSnap = await getDocs(collection(db, 'users'));
        const tokens = [];

        usersSnap.forEach(docSnap => {
            const data = docSnap.data();
            // Don't send to self
            if (docSnap.id !== currentUserName && data.pushToken) {
                tokens.push(data.pushToken);
            }
        });

        if (tokens.length === 0) return;

        // B. Send HTTP Request to Expo
        // Format: https://docs.expo.dev/push-notifications/sending-notifications/#message-format
        const message = {
            to: tokens,
            sound: 'default',
            title: title,
            body: body,
            data: { someData: 'goes here' },
        };

        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

    } catch (error) {
        console.error("Error sending push notif", error);
    }
};
