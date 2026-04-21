import NetInfo from '@react-native-community/netinfo';
import { useState, useEffect } from 'react';

// Subscribers for network state changes
let listeners = [];
let currentState = { isConnected: true, isInternetReachable: true };

// Initialize network listener
NetInfo.addEventListener(state => {
    currentState = {
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? false
    };

    console.log('[Network]', currentState.isConnected ? '🟢 Online' : '🔴 Offline');

    // Notify all listeners
    listeners.forEach(listener => listener(currentState));
});

/**
 * Subscribe to network state changes
 */
export const subscribeToNetwork = (callback) => {
    listeners.push(callback);
    // Immediately call with current state
    callback(currentState);

    return () => {
        listeners = listeners.filter(l => l !== callback);
    };
};

/**
 * Get current network state (sync)
 */
export const isOnline = () => currentState.isConnected && currentState.isInternetReachable;

/**
 * Get current network state (async - more reliable)
 */
export const checkNetwork = async () => {
    const state = await NetInfo.fetch();
    return state.isConnected && state.isInternetReachable;
};

/**
 * React hook for network state
 */
export const useNetworkStatus = () => {
    const [online, setOnline] = useState(isOnline());

    useEffect(() => {
        return subscribeToNetwork(state => {
            setOnline(state.isConnected && state.isInternetReachable);
        });
    }, []);

    return online;
};
