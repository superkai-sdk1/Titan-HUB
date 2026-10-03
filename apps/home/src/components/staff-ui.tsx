// Элементы панели сотрудника: секции, строки, переключатель, сегменты.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { colors, radius, space, type } from '@/lib/theme';

import { Icon, type IconName, Tap } from './ui';

export function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  return (
    <View style={styles.section}>
      <Text style={[type.overline, styles.sectionTitle]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function InfoRow({ icon, label, value, tone }: { icon: IconName; label: string; value?: string | null; tone?: string }) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={22} color={tone ?? colors.textSecondary} />
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={[styles.value, tone ? { color: tone } : null]} numberOfLines={1}>{value}</Text> : null}
    </View>
  );
}

export function ActionRow({ icon, label, hint, onPress, tone, disabled }: { icon: IconName; label: string; hint?: string; onPress: () => void; tone?: string; disabled?: boolean }) {
  return (
    <Tap style={styles.row} onPress={onPress} disabled={disabled} scaleTo={0.98} accessibilityRole="button">
      <Icon name={icon} size={22} color={tone ?? colors.violetLight} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, tone ? { color: tone } : null]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Icon name="chevron-right" size={22} color={colors.textMuted} />
    </Tap>
  );
}

export function ToggleRow({ icon, label, hint, value, onChange }: { icon: IconName; label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable style={styles.row} onPress={() => { haptic.select(); onChange(!value); }} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <Icon name={icon} size={22} color={colors.violetLight} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

export function Segments<T extends string>({ options, value, onChange }: { options: { key: T; label: string; icon: IconName }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segments}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => { if (!active) { haptic.select(); onChange(o.key); } }}
            style={[styles.segment, active && styles.segmentOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Icon name={o.icon} size={20} color={active ? colors.text : colors.textSecondary} />
            <Text style={[styles.segmentText, active && { color: colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.xs },
  sectionBody: { borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  footer: { fontSize: 13, color: colors.textMuted, paddingHorizontal: space.xs, lineHeight: 18 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  label: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  value: { fontSize: 15, color: colors.textSecondary, maxWidth: '55%', textAlign: 'right' },
  hint: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  track: { width: 52, height: 30, borderRadius: 15, padding: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  trackOn: { backgroundColor: colors.violet },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.textSecondary },
  knobOn: { backgroundColor: '#fff', transform: [{ translateX: 22 }] },
  segments: { flexDirection: 'row', gap: 6, padding: 6 },
  segment: { flex: 1, height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  segmentOn: { backgroundColor: colors.violetTint, borderWidth: 1, borderColor: colors.borderViolet },
  segmentText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
});
