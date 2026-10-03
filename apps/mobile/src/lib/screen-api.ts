import { useQuery } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

import { api } from './api';
import { queryClient } from './query';
import { useClubKey } from './queries';
import { useSession } from './session';

/**
 * Titan Menu — меню клуба на экране ТВ (`https://<клуб>/menu`, плеер AbleSign).
 * Отсюда настраиваются тема экрана и реклама: слайды, которые по очереди сменяют
 * ленту «Игровой вечер / Кабинки» внизу экрана (панель переворачивается, меню на месте).
 * Изменения доходят до ТВ за ~20 секунд — экран сам перечитывает меню.
 */

export const SCREEN_THEMES: { key: string; name: string }[] = [
  { key: 'night', name: 'Ночь' },
  { key: 'neon', name: 'Неон' },
  { key: 'deco', name: 'Ар-деко' },
  { key: 'synth', name: 'Синтвейв' },
  { key: 'avant', name: 'Конструктивизм' },
  { key: 'dossier', name: 'Досье' },
  { key: 'halloween', name: 'Хеллоуин' },
];
/** Ключи настроек клуба: тема экрана и сколько секунд показывается лента тарифов. */
export const THEME_SETTING = 'menu_screen_theme';
export const BAND_SETTING = 'menu_screen_band_sec';
export const SLIDE_DURATIONS = [5, 8, 10, 15, 20, 30];
export const BAND_DURATIONS = [10, 15, 20, 30, 45, 60];

/** Адрес экрана клуба, например `https://kbr.titanpos.ru/menu`. */
export function screenUrl(theme?: string): string {
  const host = useSession.getState().club?.host ?? 'titanpos.ru';
  return `https://${host}/menu${theme ? `?theme=${theme}` : ''}`;
}

export type ScreenSlide = {
  id: string;
  kind: 'image' | 'card';
  imageUrl: string | null;
  title: string | null;
  body: string | null;
  linkUrl: string | null;
  durationSec: number;
  isActive: boolean;
  sortOrder: number;
};

export type SlideInput = {
  kind: 'image' | 'card';
  imageUrl?: string | null;
  title?: string | null;
  body?: string | null;
  linkUrl?: string | null;
  durationSec?: number;
  isActive?: boolean;
};

const slidesKey = (club: string) => [club, 'menu', 'slides'];
const refresh = () => void queryClient.invalidateQueries({ queryKey: slidesKey(useSession.getState().club?.host ?? 'none') });

/** Слайды по порядку показа, включая выключенные. Читают владелец и сотрудники. */
export function useScreenSlides() {
  const club = useClubKey();
  return useQuery({
    queryKey: slidesKey(club),
    queryFn: () => api.get<{ slides: ScreenSlide[] }>('/menu/slides').then((r) => r.slides),
    staleTime: 30_000,
  });
}

/** Правит только владелец. */
export async function createSlide(input: SlideInput): Promise<void> {
  await api.post('/menu/slides', input);
  refresh();
}

export async function updateSlide(id: string, patch: Partial<SlideInput>): Promise<void> {
  await api.patch(`/menu/slides/${id}`, patch);
  refresh();
}

export async function deleteSlide(id: string): Promise<void> {
  await api.delete(`/menu/slides/${id}`);
  refresh();
}

export async function reorderSlides(items: { id: string; sortOrder: number }[]): Promise<void> {
  await api.patch('/menu/slides/reorder', { items });
  refresh();
}

/** Карточка-приглашение в клиентское приложение My Titan (веб-версия на поддомене клуба). */
export function myTitanSlide(): SlideInput {
  const host = useSession.getState().club?.host ?? 'titanpos.ru';
  return {
    kind: 'card',
    title: 'My Titan — твой клуб в телефоне',
    body: 'Баланс, бонусы и запись на игры. Наведи камеру на QR',
    linkUrl: `https://${host}/residents`,
    durationSec: 10,
  };
}

/**
 * Картинка для рекламы: выбор из галереи без обрезки (на iOS системная обрезка только
 * квадратная — баннер испортится), затем уменьшение до 1920 px по ширине и JPEG.
 * Снимок с камеры весит 2–3 МБ: API принимает до 1 МБ, а слабому ТВ-плееру тяжело
 * декодировать 12 Мп. `null` — человек отменил выбор или не дал доступ.
 */
export async function pickAdImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Нужен доступ к фото', 'Разрешите доступ в настройках телефона.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Открыть настройки', onPress: () => void Linking.openSettings() },
    ]);
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  if ((asset.width ?? 0) > 1920) context.resize({ width: 1920 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });

  const form = new FormData();
  form.append('file', { uri: saved.uri, name: 'slide.jpg', type: 'image/jpeg' } as unknown as Blob);
  const { url } = await api.post<{ url: string }>('/upload/image', form);
  return url;
}
