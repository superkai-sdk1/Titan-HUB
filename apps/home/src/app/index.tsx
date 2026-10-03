// Главный экран киоска: счёт, меню и действия гостя; после закрытия счёта —
// благодарность и оценка вечера.
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { FinishView } from '@/components/finish-view';
import { HomeView } from '@/components/home-view';
import { useFlow } from '@/lib/flow';

export default function HomeScreen() {
  const phase = useFlow((s) => s.phase);
  const finish = phase.kind === 'finish';
  return (
    <View style={{ flex: 1 }}>
      <Animated.View key={finish ? `finish:${phase.checkId}` : 'home'} entering={FadeIn.duration(350)} style={{ flex: 1 }}>
        {finish ? (
          <FinishView checkId={phase.checkId} paid={phase.paid} />
        ) : (
          <HomeView checkId={phase.kind === 'session' ? phase.checkId : null} />
        )}
      </Animated.View>
    </View>
  );
}
