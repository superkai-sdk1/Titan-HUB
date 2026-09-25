import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

/** Текст, который при смене значения прокручивается вверх — как `contentTransition(.numericText)` в SwiftUI. */
export function RollingText({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  return (
    <View style={styles.clip}>
      <Animated.Text key={text} entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(160)} style={style} numberOfLines={1}>
        {text}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
