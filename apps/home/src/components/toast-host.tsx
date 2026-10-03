// Всплывающая подсказка гостю сверху экрана; исчезает сама.
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { useToast } from '@/lib/flow';
import { colors } from '@/lib/theme';

import { Icon, type IconName } from './ui';

const LOOK: Record<string, { icon: IconName; color: string }> = {
  success: { icon: 'check-circle', color: colors.green },
  info: { icon: 'bell-ring-outline', color: colors.cyan },
  warning: { icon: 'alert-circle-outline', color: colors.amber },
  error: { icon: 'close-circle-outline', color: colors.red },
};

export function ToastHost() {
  const toast = useToast((s) => s.toast);
  const hide = useToast((s) => s.hide);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, 3800);
    return () => clearTimeout(t);
  }, [toast, hide]);

  if (!toast) return null;
  const look = LOOK[toast.tone] ?? LOOK.success!;
  return (
    <View pointerEvents="none" style={styles.layer}>
      <Animated.View key={toast.id} entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp} style={[styles.toast, { borderColor: `${look.color}66` }]}>
        <Icon name={look.icon} size={24} color={look.color} />
        <Text style={styles.text}>{toast.text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 18, left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 640,
    paddingHorizontal: 22, paddingVertical: 16, borderRadius: 20,
    backgroundColor: 'rgba(29,26,36,0.97)', borderWidth: 1, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  },
  text: { color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
});
