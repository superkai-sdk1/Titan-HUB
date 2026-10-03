// Базовые элементы интерфейса My Titan: нажимаемая поверхность с пружиной,
// кнопки, карточки, иконки, сегменты, аватар, пустые состояния, скелетоны.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { type ComponentProps, type ReactNode, useEffect } from 'react';
import {
  ActivityIndicator, Pressable, type PressableProps, type StyleProp, StyleSheet, Text, View, type ViewStyle,
} from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { colors, radius, space, springs, type, violetGradient } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color = colors.text, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return <Ionicons name={name} size={size} color={color} style={style as never} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Нажимаемая область: пружинит при нажатии и даёт лёгкий тактильный отклик. */
export function Tap({
  children, style, scaleTo = 0.97, hapticOnPress = true, onPress, disabled, ...rest
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
      style={[style, animated, disabled && { opacity: 0.5 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'telegram' | 'ghost';

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
  size?: 'lg' | 'md';
}) {
  const fg = variant === 'secondary' ? colors.textBody : variant === 'ghost' ? colors.violetLight : variant === 'danger' ? colors.red : '#fff';
  const bg: ViewStyle =
    variant === 'primary' ? { experimental_backgroundImage: violetGradient, boxShadow: '0 10px 28px rgba(109,40,217,0.35)' }
      : variant === 'telegram' ? { backgroundColor: colors.telegram, boxShadow: '0 10px 28px rgba(42,171,238,0.30)' }
        : variant === 'danger' ? { backgroundColor: colors.redTint, borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)' }
          : variant === 'ghost' ? { backgroundColor: 'transparent' }
            : { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.borderStrong };
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.button, size === 'md' && styles.buttonMd, bg, style]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'md' ? 18 : 20} color={fg} /> : null}
          <Text style={[styles.buttonText, size === 'md' && { fontSize: 15 }, { color: fg }]}>{title}</Text>
        </>
      )}
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

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={type.overline}>{title}</Text>
      {action ? (
        <Tap onPress={onAction} hitSlop={10} scaleTo={0.94}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Tap>
      ) : null}
    </View>
  );
}

export function IconBubble({ name, color, size = 40 }: { name: IconName; color: string; size?: number }) {
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22` }]}>
      <Icon name={name} size={size * 0.5} color={color} />
    </View>
  );
}

export function Segmented<T extends string>({
  options, value, onChange,
}: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => { if (!active) { haptic.select(); onChange(o.key); } }}
            style={[styles.segmentItem, active && styles.segmentActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && { color: colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ uri, name, size = 44, ring }: { uri?: string | null; name?: string | null; size?: number; ring?: boolean }) {
  const initial = (name ?? '?').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, ring && { borderWidth: 2, borderColor: 'rgba(139,92,246,0.55)' }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.avatarFallback]}>
          <Text style={{ color: colors.violetLight, fontWeight: '800', fontSize: size * 0.4 }}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.violetLight} />
      </View>
      <Text style={[type.headline, { textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[type.callout, { color: colors.textSecondary, textAlign: 'center', marginTop: 6 }]}>{text}</Text> : null}
      {children ? <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>{children}</View> : null}
    </View>
  );
}

/** Мерцающая заглушка на время загрузки. */
export function Skeleton({ width, height, style, rounded = 12 }: { width?: number | `${number}%`; height: number; style?: StyleProp<ViewStyle>; rounded?: number }) {
  const o = useSharedValue(0.45);
  useEffect(() => {
    o.set(withRepeat(withTiming(0.9, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [o]);
  const animated = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: width ?? '100%', height, borderRadius: rounded, backgroundColor: colors.surfaceRaised }, animated, style]} />;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

/** Бейдж статуса клиента: цвет из справочника тарифов. */
export function TierBadge({ label, color, onCard }: { label: string; color: string; onCard?: boolean }) {
  return (
    <View style={[styles.tier, { borderColor: color, backgroundColor: onCard ? 'rgba(0,0,0,0.25)' : `${color}22` }]}>
      <Text style={[styles.tierText, !onCard && { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54, borderRadius: radius.control, paddingHorizontal: space.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
  },
  buttonMd: { minHeight: 44, borderRadius: 12, paddingHorizontal: space.lg },
  buttonText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.border,
    padding: space.lg,
  },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: space.sm + 2, paddingHorizontal: space.xs,
  },
  sectionAction: { color: colors.violetLight, fontSize: 13, fontWeight: '700' },
  bubble: { alignItems: 'center', justifyContent: 'center' },
  segment: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 3,
  },
  segmentItem: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.violetTint, borderWidth: 1, borderColor: colors.borderViolet },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.18)' },
  empty: { alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.violetTint,
    alignItems: 'center', justifyContent: 'center', marginBottom: space.lg,
  },
  tier: { paddingHorizontal: 11, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  tierText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
});
