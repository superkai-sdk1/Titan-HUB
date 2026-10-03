// Панель «Свет и климат» кабинки (Home Assistant): в альбомной ориентации — колонка
// справа, в портретной — полоса снизу. Видна на всех экранах гостя.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { errorText } from '@/lib/api';
import { toast } from '@/lib/flow';
import { type HaEntity, type HaStatus, useHa } from '@/lib/home-assistant';
import {
  climateInfo, fanLabel, HVAC_ICON, HVAC_LABEL, HVAC_SHORT, HVAC_TONE, isOn, isUnavailable, powerClimate, rememberMode,
  setFanMode, setHvacMode, setLight, setTemperature,
} from '@/lib/room';
import { colors, radius, space, warmGradient } from '@/lib/theme';
import type { SmartDevice } from '@/lib/types';
import { useRoom } from '@/lib/use-room';

import { Icon, IconButton, safeIcon, Tap } from './ui';

export type DockLayout = 'side' | 'bottom';

/** Размеры панели: под них раскладывается остальной экран. */
export const DOCK_SIDE_WIDTH = 300;
export const DOCK_BOTTOM_HEIGHT = 360;
export const DOCK_MARGIN = 12;

const fail = (e: unknown) => toast(errorText(e), 'error');

export function RoomDock({ layout }: { layout: DockLayout }) {
  const { room } = useRoom();
  const status = useHa((s) => s.status);
  const entities = useHa((s) => s.entities);
  if (!room) return null;
  const ready = status === 'connected';
  const side = layout === 'side';

  return (
    <View style={[styles.dock, side ? styles.side : styles.bottom]}>
      <View style={styles.header}>
        <Icon name="home-automation" size={20} color={colors.violetLight} />
        <Text style={styles.headerText}>Свет и климат</Text>
        <StatusChip status={status} />
      </View>

      <View style={side ? styles.sideBody : styles.bottomBody}>
        {room.lights.length > 0 ? (
          <View style={side ? styles.lightsSide : styles.lightsBottom}>
            {room.lights.map((light) => (
              <LightTile key={light.entityId} device={light} entity={entities[light.entityId]} disabled={!ready} fill={!side} />
            ))}
          </View>
        ) : null}
        {room.climate ? (
          <ClimateCard device={room.climate} entity={entities[room.climate.entityId]} disabled={!ready} layout={layout} />
        ) : null}
      </View>
    </View>
  );
}

function StatusChip({ status }: { status: HaStatus }) {
  if (status === 'connected') return null;
  const text = status === 'auth_failed' ? 'Нет доступа' : status === 'offline' ? 'Нет связи' : 'Подключаемся…';
  const tone = status === 'connecting' || status === 'idle' ? colors.amber : colors.red;
  return (
    <View style={[styles.status, { borderColor: `${tone}55`, backgroundColor: `${tone}18` }]}>
      <View style={[styles.statusDot, { backgroundColor: tone }]} />
      <Text style={[styles.statusText, { color: tone }]}>{text}</Text>
    </View>
  );
}

/* ─────────────────────────────── Свет ─────────────────────────────── */

function LightTile({ device, entity, disabled, fill }: { device: SmartDevice; entity?: HaEntity; disabled: boolean; fill?: boolean }) {
  const on = isOn(entity);
  const unavailable = isUnavailable(entity);
  const glow = useAnimatedStyle(() => ({ opacity: withTiming(on ? 1 : 0, { duration: 260 }) }), [on]);

  return (
    <Tap
      onPress={() => setLight(device.entityId, !on).catch(fail)}
      disabled={disabled || unavailable}
      scaleTo={0.94}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: disabled || unavailable }}
      accessibilityLabel={device.name}
      style={[styles.light, fill && { flex: 1 }]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.lightGlow, glow]} />
      <View style={[styles.bulb, on && styles.bulbOn]}>
        <Icon name={on ? 'lightbulb-on' : 'lightbulb-outline'} size={28} color={on ? '#fff' : colors.textSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.lightName, on && { color: '#fff' }]} numberOfLines={2}>{device.name}</Text>
        <Text style={[styles.lightState, on && { color: 'rgba(255,255,255,0.85)' }]}>
          {unavailable ? 'Недоступен' : on ? 'Включён' : 'Выключен'}
        </Text>
      </View>
      <View style={[styles.switchTrack, on && styles.switchTrackOn]}>
        <View style={[styles.switchKnob, on && styles.switchKnobOn]} />
      </View>
    </Tap>
  );
}

/* ─────────────────────────────── Климат ─────────────────────────────── */

const fmtTemp = (t: number) => (Number.isInteger(t) ? String(t) : t.toFixed(1).replace('.', ','));

function ClimateCard({ device, entity, disabled, layout }: { device: SmartDevice; entity?: HaEntity; disabled: boolean; layout: DockLayout }) {
  const info = climateInfo(entity);
  const off = info.mode === 'off';
  const unavailable = isUnavailable(entity);
  const blocked = disabled || unavailable;
  const tone = off || unavailable ? colors.textMuted : HVAC_TONE[info.mode] ?? colors.violetLight;

  // Температуру жмут несколько раз подряд — отправляем одно значение, когда пальцы остановились.
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = pending ?? info.target;

  useEffect(() => {
    if (entity) rememberMode(device.entityId, entity.state);
  }, [device.entityId, entity]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const bump = (dir: 1 | -1) => {
    if (shown == null) return;
    const next = Math.min(info.max, Math.max(info.min, Math.round((shown + dir * info.step) * 10) / 10));
    setPending(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setTemperature(device.entityId, next).catch(fail).finally(() => setPending(null));
    }, 700);
  };

  const header = (
    <View style={styles.climateHeader}>
      <View style={[styles.climateIcon, { backgroundColor: `${tone}22` }]}>
        <Icon name="air-conditioner" size={22} color={tone} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.climateName} numberOfLines={1}>{device.name}</Text>
        <Text style={[styles.climateMode, { color: tone }]} numberOfLines={1}>
          {unavailable ? 'Недоступен' : off ? 'Выключен' : HVAC_LABEL[info.mode] ?? info.mode}
        </Text>
      </View>
      <IconButton
        icon="power"
        label={off ? 'Включить кондиционер' : 'Выключить кондиционер'}
        size={48}
        tone={off ? undefined : colors.green}
        disabled={blocked}
        onPress={() => powerClimate(device.entityId, off).catch(fail)}
      />
    </View>
  );

  const temperature = (
    <View>
      <View style={styles.tempRow}>
        <IconButton icon="minus" label="Холоднее" size={52} disabled={blocked || shown == null || shown <= info.min} onPress={() => bump(-1)} />
        <View style={styles.tempValue}>
          <Text style={[styles.tempText, { color: off ? colors.textSecondary : colors.text }]}>{shown != null ? fmtTemp(shown) : '—'}</Text>
          <Text style={[styles.tempDeg, { color: tone }]}>°</Text>
        </View>
        <IconButton icon="plus" label="Теплее" size={52} disabled={blocked || shown == null || shown >= info.max} onPress={() => bump(1)} />
      </View>
      <Text style={styles.ambient}>
        {info.current != null ? `В кабинке ${fmtTemp(info.current)}°` : 'Цель'}
        {info.humidity != null ? ` · влажность ${Math.round(info.humidity)}%` : ''}
      </Text>
    </View>
  );

  const compact = layout === 'bottom';
  const modes = (
    <View style={compact ? styles.modesRow : styles.modes}>
      {info.modes.map((mode) => {
        const active = info.mode === mode;
        const t = HVAC_TONE[mode] ?? colors.violetLight;
        return (
          <Tap
            key={mode}
            disabled={blocked}
            onPress={() => { if (!active) setHvacMode(device.entityId, mode).catch(fail); }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={HVAC_LABEL[mode] ?? mode}
            style={[compact ? styles.modeCompact : styles.mode, active && { backgroundColor: `${t}26`, borderColor: `${t}88` }]}
          >
            <Icon name={safeIcon(HVAC_ICON[mode], 'thermostat')} size={compact ? 22 : 20} color={active ? t : colors.textSecondary} />
            <Text style={[compact ? styles.modeTextCompact : styles.modeText, active && { color: colors.text }]} numberOfLines={1}>{(compact ? HVAC_SHORT : HVAC_LABEL)[mode] ?? mode}</Text>
          </Tap>
        );
      })}
    </View>
  );

  const fans = info.fanModes.length > 1 ? (
    <View style={styles.fans}>
      <Icon name="fan" size={18} color={colors.textMuted} />
      {info.fanModes.map((fan) => {
        const active = info.fanMode === fan;
        return (
          <Tap
            key={fan}
            disabled={blocked || off}
            onPress={() => { if (!active) setFanMode(device.entityId, fan).catch(fail); }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.fan, active && styles.fanActive]}
          >
            <Text style={[styles.fanText, active && { color: colors.text }]}>{fanLabel(fan)}</Text>
          </Tap>
        );
      })}
    </View>
  ) : null;

  return (
    <View style={[styles.climate, { flex: 1, borderColor: `${tone}40` }]}>
      {header}
      <View style={styles.climateCenter}>{temperature}</View>
      {modes}
      {fans}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: 'rgba(29,26,36,0.92)', borderRadius: radius.panel, borderWidth: 1, borderColor: colors.borderViolet,
    padding: space.lg, gap: space.md, boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
  },
  side: { width: DOCK_SIDE_WIDTH, margin: DOCK_MARGIN, marginLeft: 0 },
  bottom: { height: DOCK_BOTTOM_HEIGHT, margin: DOCK_MARGIN, marginTop: 0, paddingVertical: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 26 },
  headerText: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textSecondary },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },

  sideBody: { flex: 1, gap: space.md },
  bottomBody: { flex: 1, flexDirection: 'row', gap: space.md },
  lightsSide: { gap: space.sm },
  lightsBottom: { gap: space.md, width: 260 },

  light: {
    minHeight: 78, borderRadius: radius.tile + 4, paddingHorizontal: space.md + 2, paddingVertical: space.md,
    flexDirection: 'row', alignItems: 'center', gap: space.md, overflow: 'hidden',
    backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
  },
  lightGlow: { experimental_backgroundImage: warmGradient, borderRadius: radius.tile + 4 },
  bulb: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  bulbOn: { backgroundColor: 'rgba(255,255,255,0.22)', boxShadow: '0 0 24px rgba(255,236,179,0.65)' },
  switchTrack: { width: 40, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.10)', padding: 3 },
  switchTrackOn: { backgroundColor: 'rgba(255,255,255,0.35)' },
  switchKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textMuted },
  switchKnobOn: { backgroundColor: '#fff', transform: [{ translateX: 16 }] },
  lightName: { fontSize: 16, fontWeight: '800', color: colors.text },
  lightState: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },

  climate: {
    borderRadius: radius.tile + 4, padding: space.md + 2, gap: space.md,
    backgroundColor: colors.surfaceRaised, borderWidth: 1,
  },
  climateCenter: { flex: 1, justifyContent: 'center' },
  climateHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  climateIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  climateName: { fontSize: 16, fontWeight: '800', color: colors.text },
  climateMode: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  tempRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tempValue: { flexDirection: 'row', alignItems: 'flex-start' },
  tempText: { fontSize: 56, lineHeight: 62, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -2 },
  tempDeg: { fontSize: 30, lineHeight: 40, fontWeight: '800' },
  ambient: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mode: {
    flexGrow: 1, flexBasis: '30%', minWidth: 76, height: 50, borderRadius: 14, paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: colors.border,
  },
  modeText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, flexShrink: 1 },
  modesRow: { flexDirection: 'row', gap: 6 },
  modeCompact: {
    flex: 1, flexBasis: 0, minWidth: 0, height: 62, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: colors.border,
  },
  modeTextCompact: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  fans: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  fan: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: colors.border },
  fanActive: { backgroundColor: colors.violetTint, borderColor: colors.borderViolet },
  fanText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
});
