import { Contact } from 'expo-contacts';
import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

/**
 * Связь с телефоном: адресная книга и Яндекс.Карты.
 *
 * Выбор контакта идёт через системный пикер — он не требует доступа ко всей книге:
 * iOS отдаёт только выбранную карточку, это и приватнее, и без лишних разрешений.
 */

export type PickedContact = { name: string; phone: string | null };

/** Системный выбор контакта. `null` — пользователь отменил или ничего не выбрал. */
export async function pickContact(): Promise<PickedContact | null> {
  try {
    const contact = await Contact.presentPicker();
    if (!contact) return null;
    const [given, family, phones] = await Promise.all([
      contact.getGivenName().catch(() => null),
      contact.getFamilyName().catch(() => null),
      contact.getPhones().catch(() => []),
    ]);
    const name = [given, family].filter(Boolean).join(' ').trim();
    const phone = phones[0]?.number ?? null;
    return { name, phone };
  } catch {
    return null;
  }
}

/** Телефон в виде +7XXXXXXXXXX: в контактах он приходит с пробелами и скобками. */
export function cleanPhone(raw: string | null): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits ? `+${digits}` : '';
}

/**
 * Маршрут в Яндекс.Картах от текущего местоположения до адреса.
 *
 * Координаты берём, если пользователь дал доступ — тогда маршрут строится «отсюда».
 * Без доступа Яндекс сам подставит текущую точку. Если приложения нет, открываем сайт.
 */
export async function routeInYandex(destination: string): Promise<void> {
  const to = destination.trim();
  if (!to) return;

  let from = '';
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    const granted = permission.granted || (permission.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted);
    if (granted) {
      const position = await Location.getLastKnownPositionAsync().catch(() => null);
      const point = position ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
      if (point) from = `${point.coords.latitude},${point.coords.longitude}`;
    }
  } catch {
    // Без геопозиции маршрут всё равно строится — просто от точки, которую выберет Яндекс.
  }

  const route = `${from}~${encodeURIComponent(to)}`;
  const appUrl = `yandexmaps://maps.yandex.ru/?rtext=${route}&rtt=auto`;
  const webUrl = `https://yandex.ru/maps/?rtext=${route}&rtt=auto`;

  try {
    if (await Linking.canOpenURL(appUrl)) await Linking.openURL(appUrl);
    else await Linking.openURL(webUrl);
  } catch {
    Alert.alert('Не удалось открыть Яндекс.Карты');
  }
}
