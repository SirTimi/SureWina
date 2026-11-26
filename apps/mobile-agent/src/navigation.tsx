import { useCallback } from 'react';
import { BackHandler, StyleSheet, Text } from 'react-native';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from './auth';
import { HomeScreen } from './screens/HomeScreen';
import { MoreScreen } from './screens/MoreScreen';
import { SignInScreen } from './screens/SignInScreen';
import { LoadingScreen, OfflineScreen } from './screens/StatusScreens';
import { colors } from './theme';

// Tabs are added as features go live (Sell in B1, Wallet in B3, Payouts in
// B4); no placeholder tabs.
export type TabParams = {
  Home: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<TabParams>();

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={[styles.icon, focused && styles.iconFocused]}>{glyph}</Text>;
}

// On the terminal SureWina is the home screen: the Android back button on
// Home does nothing rather than leaving the app.
function StayOnHome({ children }: { children: React.ReactNode }) {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );
  return <>{children}</>;
}

function HomeTab() {
  return (
    <StayOnHome>
      <HomeScreen />
    </StayOnHome>
  );
}

function SignedInTabs() {
  return (
    <Tab.Navigator
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeTab}
        options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="⌂" focused={focused} /> }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="☰" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'signed-out') return <SignInScreen />;
  if (status === 'offline') return <OfflineScreen />;
  return (
    <NavigationContainer>
      <SignedInTabs />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  bar: { height: 64, paddingTop: 6, paddingBottom: 8, borderTopColor: colors.border },
  label: { fontSize: 12, fontWeight: '700' },
  icon: { fontSize: 22, color: colors.muted },
  iconFocused: { color: colors.blue },
});
