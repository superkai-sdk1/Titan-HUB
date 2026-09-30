import { Button, HStack, RNHostView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, monospacedDigit } from '@expo/ui/swift-ui/modifiers';
import type { ReactNode } from 'react';

import { primary, secondary } from '@/components/native-form';
import { Avatar } from '@/components/new-check-parts';
import { clientPhoto, tierLook, type Client, type ClientTierRow } from '@/lib/clients-api';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';

/**
 * Строка клиента в нативном списке: фото, ник, статус цветом и контакт; справа — баланс
 * (депозит бирюзовым, долг красным) или своя правая часть.
 */
export function ClientLine({ client, tiers, onPress, trailing }: { client: Client; tiers: ClientTierRow[] | undefined; onPress: () => void; trailing?: ReactNode }) {
  const tier = tierLook(client.clientTier, tiers);
  const balance = toNumber(client.balance);
  return (
    <Button
      onPress={() => {
        haptic.selection();
        onPress();
      }}>
      <HStack spacing={12}>
        <RNHostView matchContents>
          <Avatar name={client.nickname} photoUrl={clientPhoto(client)} size={40} />
        </RNHostView>
        <VStack alignment="leading" spacing={1}>
          <HStack spacing={6}>
            <Text modifiers={[primary, font({ weight: 'semibold' }), lineLimit(1)]}>{client.nickname}</Text>
            <Text modifiers={[font({ textStyle: 'caption', weight: 'semibold' }), foregroundStyle(tier.color), lineLimit(1)]}>{tier.label}</Text>
          </HStack>
          <Text modifiers={[font({ textStyle: 'subheadline' }), secondary, lineLimit(1)]}>{client.phone || client.fullName || 'Нет телефона'}</Text>
        </VStack>
        <Spacer />
        {trailing ??
          (Math.abs(balance) >= 0.005 ? (
            <Text modifiers={[font({ weight: 'semibold' }), foregroundStyle(balance > 0 ? '#06B6D4' : '#F43F5E'), monospacedDigit()]}>
              {formatMoney(balance, { sign: true, kopecks: 'auto' })}
            </Text>
          ) : null)}
      </HStack>
    </Button>
  );
}
