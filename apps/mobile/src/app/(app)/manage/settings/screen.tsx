import { ContentUnavailableView, Form, Host, Picker, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { pickerStyle, refreshable, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Share } from 'react-native';

import { ActionRow, LinkRow } from '@/components/native-form';
import { useSettingsEditor } from '@/components/settings-parts';
import { haptic } from '@/lib/haptics';
import {
  BAND_DURATIONS,
  BAND_SETTING,
  SCREEN_THEMES,
  THEME_SETTING,
  createSlide,
  myTitanSlide,
  pickAdImage,
  screenUrl,
  useScreenSlides,
  type ScreenSlide,
} from '@/lib/screen-api';
import { useSession } from '@/lib/session';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function slideTitle(slide: ScreenSlide): string {
  return slide.kind === 'image' ? 'Картинка' : slide.title || 'Карточка';
}

function slideSubtitle(slide: ScreenSlide): string {
  const parts = [`${slide.durationSec} с`];
  if (slide.kind === 'card') parts.push(slide.linkUrl ? `QR → ${slide.linkUrl.replace(/^https?:\/\//, '')}` : 'без QR');
  return parts.join(' · ');
}

/**
 * Titan Menu — меню на экране ТВ: ссылка для плеера AbleSign, тема и реклама. Слайды
 * по очереди сменяют ленту «Игровой вечер / Кабинки» внизу экрана; правит владелец.
 */
export default function ScreenSettingsScreen() {
  const router = useRouter();
  const settings = useSettingsEditor();
  const slides = useScreenSlides();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [busy, setBusy] = useState(false);

  const theme = settings.text(THEME_SETTING, 'night');
  const bandSec = settings.number(BAND_SETTING, 20);
  const list = slides.data ?? [];

  const refresh = async () => {
    await Promise.allSettled([settings.refetch(), slides.refetch()]);
  };

  const add = async (make: () => Promise<Parameters<typeof createSlide>[0] | null>, failure: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const input = await make();
      if (!input) return;
      await createSlide(input);
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert(failure, errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const addImage = () =>
    void add(async () => {
      const url = await pickAdImage();
      return url ? { kind: 'image', imageUrl: url, durationSec: 10 } : null;
    }, 'Картинка не загрузилась');

  if (settings.loading) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ProgressView />
      </Host>
    );
  }
  if (settings.error) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={settings.error.message} />
      </Host>
    );
  }

  return (
    <>
      <Stack.Title>Titan Menu</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(refresh)]}>
          <Section title="Экран" footer={<Text>Эту ссылку вставляют в AbleSign. Изменения доходят до телевизора за 20 секунд.</Text>}>
            <LinkRow
              icon="tv"
              color="#8B5CF6"
              title={screenUrl().replace(/^https:\/\//, '')}
              subtitle="Поделиться или скопировать"
              onPress={() => {
                const url = screenUrl();
                void Share.share({ message: url, url });
              }}
            />
            <LinkRow icon="eye" color="#34C759" title="Открыть экран" onPress={() => void WebBrowser.openBrowserAsync(screenUrl())} />
          </Section>

          <Section title="Тема" footer={<Text>Оформление экрана. Раскладка меню не меняется.</Text>}>
            <Picker
              label="Тема экрана"
              selection={SCREEN_THEMES.some((t) => t.key === theme) ? theme : 'night'}
              onSelectionChange={(next) => {
                if (!isOwner) return;
                haptic.selection();
                settings.save({ [THEME_SETTING]: String(next) });
              }}
              modifiers={[pickerStyle('menu')]}>
              {SCREEN_THEMES.map((t) => (
                <Text key={t.key} modifiers={[tag(t.key)]}>
                  {t.name}
                </Text>
              ))}
            </Picker>
            <ActionRow title="Посмотреть тему на весь экран" icon="play.rectangle" onPress={() => void WebBrowser.openBrowserAsync(screenUrl(theme))} />
          </Section>

          <Section
            title="Реклама"
            footer={
              <Text>
                {isOwner
                  ? 'Слайды по очереди сменяют ленту тарифов внизу экрана: панель переворачивается, меню остаётся на месте. Картинка вписывается целиком — лучше широкая, примерно 3:1.'
                  : 'Рекламу на экране настраивает владелец.'}
              </Text>
            }>
            <Picker
              label="Лента тарифов"
              selection={BAND_DURATIONS.includes(bandSec) ? bandSec : 20}
              onSelectionChange={(next) => {
                if (!isOwner) return;
                haptic.selection();
                settings.save({ [BAND_SETTING]: String(next) });
              }}
              modifiers={[pickerStyle('menu')]}>
              {BAND_DURATIONS.map((sec) => (
                <Text key={sec} modifiers={[tag(sec)]}>
                  {`${sec} с`}
                </Text>
              ))}
            </Picker>
            {list.map((slide) => (
              <LinkRow
                key={slide.id}
                icon={slide.kind === 'image' ? 'photo' : 'qrcode'}
                color={slide.isActive ? (slide.kind === 'image' ? '#FF9500' : '#8B5CF6') : '#8E8E93'}
                title={slideTitle(slide)}
                subtitle={slideSubtitle(slide)}
                value={slide.isActive ? undefined : 'Скрыт'}
                onPress={isOwner ? () => router.push({ pathname: '/manage/settings/screen-slide', params: { slideId: slide.id } }) : undefined}
              />
            ))}
            {slides.isLoading && <ProgressView />}
          </Section>

          {isOwner && (
            <Section>
              <ActionRow title={busy ? 'Загружаем…' : 'Добавить картинку'} icon="photo.badge.plus" disabled={busy} onPress={addImage} />
              <ActionRow title="Добавить карточку с QR" icon="qrcode" disabled={busy} onPress={() => router.push('/manage/settings/screen-slide')} />
              <ActionRow title="QR приложения My Titan" icon="iphone" disabled={busy} onPress={() => void add(async () => myTitanSlide(), 'Карточка не добавилась')} />
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
