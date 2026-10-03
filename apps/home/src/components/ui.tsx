// Базовые элементы киоска: иконка, нажимаемая поверхность с пружиной, кнопки, карточки.
// Всё крупное — планшет на столе кабинки, нажимают пальцем на расстоянии вытянутой руки.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, type PressableProps, type StyleProp, StyleSheet, Text, type TextStyle, View, type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { brandGradient, colors, payGradient, radius, space, springs, violetGradient } from '@/lib/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 24, color = colors.text, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} style={style} />;
}

/** Имя иконки из строки (режимы HA, пресеты категорий) с запасной иконкой. */
export function safeIcon(name: string | null | undefined, fallback: IconName): IconName {
  return name && name in MaterialCommunityIcons.glyphMap ? (name as IconName) : fallback;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Нажимаемая область: пружинит при нажатии и даёт лёгкий тактильный отклик. */
export function Tap({
  children, style, scaleTo = 0.96, hapticOnPress = true, onPress, disabled, ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; hapticOnPress?: boolean; children?: ReactNode }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { scale.set(withSpring(scaleTo, springs.snappy)); rest.onPressIn?.(e); }}
      onPressOut={(e) => { scale.set(withSpring(1, springs.snappy)); rest.onPressOut?.(e); }}
      onPress={(e) => { if (hapticOnPress) haptic.tap(); onPress?.(e); }}
      style={[style, animated, disabled && { opacity: 0.45 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

type ButtonVariant = 'primary' | 'brand' | 'pay' | 'secondary' | 'amber' | 'danger' | 'ghost';

const BUTTON_BG: Record<ButtonVariant, ViewStyle> = {
  primary: { experimental_backgroundImage: violetGradient, boxShadow: '0 10px 28px rgba(109,40,217,0.35)' },
  brand: { experimental_backgroundImage: brandGradient, boxShadow: '0 10px 28px rgba(139,92,246,0.35)' },
  pay: { experimental_backgroundImage: payGradient, boxShadow: '0 10px 28px rgba(16,185,129,0.30)' },
  secondary: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.borderStrong },
  amber: { backgroundColor: colors.amberTint, borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)' },
  danger: { backgroundColor: colors.redTint, borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)' },
  ghost: { backgroundColor: 'transparent' },
};

const BUTTON_FG: Record<ButtonVariant, string> = {
  primary: '#fff', brand: '#fff', pay: '#fff', secondary: colors.textBody, amber: colors.amber, danger: colors.red, ghost: colors.violetLight,
};

export function Button({
  title, onPress, variant = 'primary', icon, loading, disabled, style, size = 'lg',
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'xl' | 'lg' | 'md';
}) {
  const fg = BUTTON_FG[variant];
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.button, size === 'xl' && styles.buttonXl, size === 'md' && styles.buttonMd, BUTTON_BG[variant], style]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'md' ? 20 : 24} color={fg} /> : null}
          <Text style={[styles.buttonText, size === 'xl' && { fontSize: 19 }, size === 'md' && { fontSize: 15 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Tap>
  );
}

/** Круглая кнопка-иконка (назад, закрыть, ±). */
export function IconButton({
  icon, onPress, size = 52, color = colors.textBody, tone, disabled, label, style,
}: { icon: IconName; onPress?: () => void; size?: number; color?: string; tone?: string; disabled?: boolean; label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={[
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        tone ? { backgroundColor: `${tone}22`, borderColor: `${tone}55` } : null,
        style,
      ]}
    >
      <Icon name={icon} size={size * 0.46} color={tone ?? color} />
    </Tap>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: string }) {
  return (
    <View style={[styles.card, tone ? { backgroundColor: `${tone}14`, borderColor: `${tone}40` } : null, style]}>
      {children}
    </View>
  );
}

export function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <View style={styles.loader}>
      <ActivityIndicator color={colors.violetLight} size="large" />
      {label ? <Text style={styles.loaderText}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 60, borderRadius: radius.control + 2, paddingHorizontal: space.xxl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm + 2,
  },
  buttonXl: { minHeight: 72, borderRadius: 20, paddingHorizontal: space.xxxl },
  buttonMd: { minHeight: 46, borderRadius: 12, paddingHorizontal: space.lg },
  buttonText: { fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  iconButton: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
    padding: space.xl,
  },
  badge: {
    position: 'absolute', top: -6, right: -6, minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12,
    backgroundColor: '#f43f5e', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  loaderText: { color: colors.textSecondary, fontSize: 15 },
});
