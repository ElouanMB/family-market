import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { Alert } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { theme } from './src/theme';
import { UserProvider } from './src/context/UserContext';

export default function App() {
  React.useEffect(() => {
    async function onFetchUpdateAsync() {
      try {
        if (!__DEV__ && Updates.isEnabled) {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            const fetchedUpdate = await Updates.fetchUpdateAsync();
            const message = fetchedUpdate.manifest?.extra?.expoClient?.extra?.eas?.message ||
              fetchedUpdate.manifest?.message ||
              "Améliorations et corrections";

            Alert.alert(
              "Mise à jour prête",
              `Une mise à jour est disponible :\n\n"${message}"\n\nVoulez-vous redémarrer pour l'appliquer ?`,
              [
                { text: "Plus tard", style: "cancel" },
                { text: "Redémarrer", onPress: () => Updates.reloadAsync() }
              ]
            );
          }
        }
      } catch (error) {
        console.log("Silent update check failed:", error.message);
      }
    }

    onFetchUpdateAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <UserProvider>
            <NavigationContainer>
              <AppNavigator />
            </NavigationContainer>
          </UserProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
