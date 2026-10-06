import { ContentUnavailableView, Form, Host, Picker, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { pickerStyle, refreshable, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ActionRow, LinkRow, TextRow } from '@/components/native-form';
import { haptic } from '@/lib/haptics';
import {
  BAND_DURATIONS,
  FITS,
  KINDS,
  ROTATIONS,
  THEMES,
  TRANSITIONS,
  createSlide,
  deleteScreen,
  deviceStatus,
  myTitanSlide,
  pickScreenImages,
  screenPageUrl,
  unpairScreen,
  updateScreen,
  useScreen,
  withCurrent,
  type ScreenPatch,
  type ScreenSlide,
} from '@/lib/screens-api';
import { useSession } from '@/lib/session';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function slideTitle(slide: ScreenSlide, index: number): string {
  return slide.kind === 'image' ? `Картинка ${index + 1}` : slide.title || 'Карточка';
}

function slideSubtitle(slide: ScreenSlide, slideshow: boolean): string {
  const parts = [`${slide.durationSec} с`];
  if (slideshow) {
    parts.push(TRANSITIONS.find((t) => t.key === slide.transition)?.label ?? 'Растворение');
    parts.push(FITS.find((f) => f.key === slide.fit)?.label ?? 'Целиком');
  } else if (slide.kind === 'card') {
    parts.push(slide.linkUrl ? `QR → ${slide.linkUrl.replace(/^https?:\/\//, '')}` : 'без QR');
  }
  return parts.join(' · ');
}

/**
 * Один экран: телевизор (статус, подключение, отвязка), что показывает, как висит ТВ,
 * тема и лента с рекламой (меню) или картинки (слайдшоу). Правит владелец.
 */
export default function ScreenEditorScreen() {
  const { screenId } = useLocalSearchParams<{ screenId: string }>();
  const router = useRouter();
  const query = useScreen(screenId);
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [busy, setBusy] = useState<string | null>(null);

  const screen = query.data?.screen;
  const slides = query.data?.slides ?? [];

  if (query.isLoading) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ProgressView />
      </Host>
    );
  }
  if (!screen) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ContentUnavailableView title="Экран не найден" systemImage="tv.slash" description={query.error?.message ?? 'Его могли удалить.'} />
      </Host>
    );
  }

  const slideshow = screen.kind === 'slideshow';
  const list = slideshow ? slides.filter((s) => s.kind === 'image') : slides;
  const status = deviceStatus(screen);
  const device = [screen.deviceModel, screen.appVersion && `Titan Menu ${screen.appVersion}`, screen.deviceIp].filter(Boolean).join(' · ');

  const run = async (action: () => Promise<void>, failure: string) => {
    try {
      await action();
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert(failure, errorText(error));
    }
  };

  const save = (patch: ScreenPatch) => {
    if (!isOwner) return;
    haptic.selection();
    void run(() => updateScreen(screen.id, patch), 'Не сохранилось');
  };

  const addImages = async () => {
    if (busy) return;
    setBusy('Загружаем…');
    try {
      const urls = await pickScreenImages(slideshow, (done, total) => setBusy(total > 1 ? `Загружаем ${done + 1} из ${total}…` : 'Загружаем…'));
      for (const url of urls) await createSlide(screen.id, { kind: 'image', imageUrl: url, durationSec: 10, transition: 'fade', fit: 'contain' });
      if (urls.length) haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert('Картинка не загрузилась', errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const addMyTitan = () => void run(() => createSlide(screen.id, myTitanSlide()), 'Карточка не добавилась');

  const unpair = () =>
    Alert.alert('Отвязать телевизор?', 'Приставка перестанет показывать этот экран и снова покажет код для подключения.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отвязать', style: 'destructive', onPress: () => void run(() => unpairScreen(screen.id), 'Не отвязался') },
    ]);

  const remove = () =>
    Alert.alert(`Удалить «${screen.name}»?`, 'Настройки и слайды удалятся, приставка вернётся к экрану подключения.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deleteScreen(screen.id);
            router.back();
          }, 'Экран не удалён'),
      },
    ]);

  const openSlide = (slide?: ScreenSlide, kind?: 'card') =>
    router.push({ pathname: '/manage/screens/slide', params: { screenId: screen.id, ...(slide ? { slideId: slide.id } : {}), ...(kind ? { kind } : {}) } });

  return (
    <>
      <Stack.Title>{screen.name}</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form
          modifiers={[
            refreshable(async () => {
              await query.refetch();
            }),
          ]}>
          <Section title="Телевизор" footer={<Text>{screen.paired ? 'Приставка показывает этот экран и отмечается раз в 20 секунд.' : 'Откройте Titan Menu на приставке — на экране появится код. Телефон найдёт её в той же Wi‑Fi сети.'}</Text>}>
            <LinkRow icon="tv" color={status.color} title={status.label} subtitle={device || undefined} />
            {isOwner && !screen.paired && (
              <ActionRow title="Подключить ТВ" icon="antenna.radiowaves.left.and.right" onPress={() => router.push({ pathname: '/manage/screens/connect', params: { screenId: screen.id } })} />
            )}
            <ActionRow title="Открыть экран" icon="eye" onPress={() => void WebBrowser.openBrowserAsync(screenPageUrl(screen.id))} />
            {isOwner && screen.paired && <ActionRow title="Отвязать ТВ" icon="link.badge.plus" destructive onPress={unpair} />}
          </Section>

          <Section title="Экран" footer={<Text>{KINDS.find((k) => k.key === screen.kind)?.note}</Text>}>
            {isOwner ? (
              <TextRow key={screen.name} label="Название" value={screen.name} maxLength={60} onCommit={(name) => name && save({ name })} />
            ) : (
              <LinkRow title="Название" value={screen.name} />
            )}
            <Picker label="Что показывает" selection={screen.kind} onSelectionChange={(next) => save({ kind: next as ScreenPatch['kind'] })} modifiers={[pickerStyle('menu')]}>
              {KINDS.map((k) => (
                <Text key={k.key} modifiers={[tag(k.key)]}>
                  {k.label}
                </Text>
              ))}
            </Picker>
            <Picker label="Как висит ТВ" selection={screen.rotation} onSelectionChange={(next) => save({ rotation: Number(next) as ScreenPatch['rotation'] })} modifiers={[pickerStyle('menu')]}>
              {ROTATIONS.map((r) => (
                <Text key={r.key} modifiers={[tag(r.key)]}>
                  {r.label}
                </Text>
              ))}
            </Picker>
          </Section>

          {slideshow ? (
            <Section
              title="Картинки"
              footer={<Text>{isOwner ? 'Показываются по очереди на весь экран. У каждой — своё время, анимация смены и вписывание.' : 'Картинки экрана настраивает владелец.'}</Text>}>
              {list.map((slide, i) => (
                <LinkRow
                  key={slide.id}
                  icon="photo"
                  color={slide.isActive ? '#FF9500' : '#8E8E93'}
                  title={slideTitle(slide, i)}
                  subtitle={slideSubtitle(slide, true)}
                  value={slide.isActive ? undefined : 'Скрыта'}
                  onPress={isOwner ? () => openSlide(slide) : undefined}
                />
              ))}
              {isOwner && <ActionRow title={busy ?? 'Добавить картинки'} icon="photo.badge.plus" disabled={!!busy} onPress={() => void addImages()} />}
            </Section>
          ) : (
            <>
              <Section title="Оформление" footer={<Text>Состав меню — кнопкой «На экране ТВ» у позиций в «Меню» и «Тарифах».</Text>}>
                <Picker label="Тема" selection={THEMES.some((t) => t.key === screen.theme) ? screen.theme : 'night'} onSelectionChange={(next) => save({ theme: String(next) })} modifiers={[pickerStyle('menu')]}>
                  {THEMES.map((t) => (
                    <Text key={t.key} modifiers={[tag(t.key)]}>
                      {t.name}
                    </Text>
                  ))}
                </Picker>
                <ActionRow title="Посмотреть тему на весь экран" icon="play.rectangle" onPress={() => void WebBrowser.openBrowserAsync(screenPageUrl(screen.id, screen.theme))} />
              </Section>

              <Section
                title="Реклама в ленте"
                footer={<Text>{isOwner ? 'Слайды по очереди сменяют ленту тарифов внизу экрана: панель переворачивается, меню остаётся на месте. Картинка лучше широкая, примерно 3:1.' : 'Рекламу на экране настраивает владелец.'}</Text>}>
                <Picker label="Лента тарифов" selection={screen.bandSec} onSelectionChange={(next) => save({ bandSec: Number(next) })} modifiers={[pickerStyle('menu')]}>
                  {withCurrent(BAND_DURATIONS, screen.bandSec).map((sec) => (
                    <Text key={sec} modifiers={[tag(sec)]}>
                      {`${sec} с`}
                    </Text>
                  ))}
                </Picker>
                {list.map((slide, i) => (
                  <LinkRow
                    key={slide.id}
                    icon={slide.kind === 'image' ? 'photo' : 'qrcode'}
                    color={slide.isActive ? (slide.kind === 'image' ? '#FF9500' : '#8B5CF6') : '#8E8E93'}
                    title={slideTitle(slide, i)}
                    subtitle={slideSubtitle(slide, false)}
                    value={slide.isActive ? undefined : 'Скрыт'}
                    onPress={isOwner ? () => openSlide(slide) : undefined}
                  />
                ))}
              </Section>
              {isOwner && (
                <Section>
                  <ActionRow title={busy ?? 'Добавить картинку'} icon="photo.badge.plus" disabled={!!busy} onPress={() => void addImages()} />
                  <ActionRow title="Добавить карточку с QR" icon="qrcode" disabled={!!busy} onPress={() => openSlide(undefined, 'card')} />
                  <ActionRow title="QR приложения My Titan" icon="iphone" disabled={!!busy} onPress={addMyTitan} />
                </Section>
              )}
            </>
          )}

          {isOwner && (
            <Section>
              <ActionRow title="Удалить экран" icon="trash" destructive onPress={remove} />
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
