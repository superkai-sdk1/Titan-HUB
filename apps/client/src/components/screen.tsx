// Каркас экрана вкладки: крупный заголовок, прокрутка с «потяни, чтобы обновить»,
// колонка по центру на планшетах и запас снизу под плавающую панель вкладок.
import { type ReactNode, useState } from 'react';
import { RefreshControl, ScrollView, type ScrollViewProps, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { colors, GUTTER, MAX_WIDTH, space, type } from '@/lib/theme';

import { useTabClearance } from './tab-bar';

export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={type.title} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={[type.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Pull-to-refresh: крутится только от ручного жеста, фоновые обновления его не дёргают. */
export function useManualRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    haptic.soft();
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };
  return { refreshing, onRefresh };
}

export function Screen({
  children, onRefresh, header, tabs = true, ...rest
}: ScrollViewProps & { children: ReactNode; onRefresh?: () => Promise<unknown>; header?: ReactNode; tabs?: boolean }) {
  const insets = useSafeAreaInsets();
  const clearance = useTabClearance();
  const refresh = useManualRefresh(onRefresh ?? (async () => {}));
  return (
    <ScrollView
      {...rest}
      style={[{ flex: 1, backgroundColor: colors.background }, rest.style]}
      contentContainerStyle={[
        { paddingTop: insets.top + space.md, paddingBottom: tabs ? clearance : insets.bottom + space.xxl, paddingHorizontal: GUTTER },
        rest.contentContainerStyle,
      ]}
      refreshControl={onRefresh ? (
        <RefreshControl
          refreshing={refresh.refreshing}
          onRefresh={refresh.onRefresh}
          tintColor={colors.violetLight}
          colors={[colors.violet]}
          progressBackgroundColor={colors.surface}
          progressViewOffset={insets.top}
        />
      ) : undefined}
    >
      <View style={styles.column}>
        {header}
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg, minHeight: 44 },
});
