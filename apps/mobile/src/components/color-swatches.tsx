import { ColorPicker, Host } from '@expo/ui/swift-ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { PALETTE } from '@/lib/catalog-api';
import { haptic } from '@/lib/haptics';
import { space, useAccentHex } from '@/lib/theme';

/** Палитра цветов кружками; выбранный — с галочкой, рядом — системный выбор своего цвета. */
export function ColorSwatches({ value, onChange, colors = PALETTE }: { value: string; onChange: (hex: string) => void; colors?: string[] }) {
  const accent = useAccentHex();
  const list = colors.includes(value) ? colors : [value, ...colors];
  return (
    <View style={styles.palette}>
      {list.map((hex) => {
        const active = hex.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={hex}
            onPress={() => {
              haptic.selection();
              onChange(hex);
            }}
            style={[styles.swatch, { backgroundColor: hex }, active && styles.active]}
            accessibilityRole="button"
            accessibilityLabel={`Цвет ${hex}`}
            accessibilityState={{ selected: active }}>
            {active && <SymbolView name="checkmark" size={14} weight="bold" tintColor="white" />}
          </Pressable>
        );
      })}
      {/* Системная палитра iOS — если нужного оттенка нет в наборе. */}
      <Host matchContents style={styles.picker} seedColor={accent}>
        <ColorPicker selection={value} supportsOpacity={false} onSelectionChange={(hex) => onChange(hex.slice(0, 7))} />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.xs },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  active: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  picker: { width: 36, height: 36 },
});
