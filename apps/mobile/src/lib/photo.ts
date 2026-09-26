import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

import { api, ApiError } from './api';

/**
 * Фото профилей: выбор из галереи или съёмка, затем загрузка в хранилище клуба.
 * Сервер принимает изображения до 2 МБ (`POST /upload/image`, multipart `file`)
 * и сверяет тип по байтам, поэтому отдаём то, что вернул системный выбор.
 */

/** Квадрат 1:1 и сжатие — иначе снимок с камеры не пролезет в лимит 2 МБ. */
const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.5,
};

export async function uploadImage(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const type = asset.mimeType ?? 'image/jpeg';
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    name: asset.fileName ?? `photo.${type.split('/')[1] ?? 'jpg'}`,
    type,
  } as unknown as Blob);
  const { url } = await api.post<{ url: string }>('/upload/image', form);
  return url;
}

/**
 * Показывает системный выбор «Снять / Из галереи», отдаёт ссылку на загруженное фото.
 * `null` — пользователь отменил; ошибки показываем сами и тоже отдаём `null`.
 */
export function pickAndUploadPhoto(title: string, onDone: (url: string) => void, onBusy?: (busy: boolean) => void): void {
  const run = async (source: 'camera' | 'library') => {
    const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(source === 'camera' ? 'Нужен доступ к камере' : 'Нужен доступ к фото', 'Разрешите доступ в настройках телефона.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть настройки', onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(PICK_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    onBusy?.(true);
    try {
      onDone(await uploadImage(asset));
    } catch (error) {
      Alert.alert('Фото не загрузилось', error instanceof ApiError ? error.message : String(error));
    } finally {
      onBusy?.(false);
    }
  };

  Alert.alert(title, undefined, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Снять', onPress: () => void run('camera') },
    { text: 'Из галереи', onPress: () => void run('library') },
  ]);
}
