import { Platform } from 'react-native';

/**
 * Общие опции шторок (`presentation: 'formSheet'`).
 *
 * Android: react-native-screens по умолчанию (`sheetCornerRadius: -1`) рисует шторку
 * с прямыми углами — на iOS то же значение значит «системное скругление». Поэтому
 * скругление задаём явно, в тон шторкам iPhone.
 */
export const sheetOptions = Platform.OS === 'android' ? { sheetCornerRadius: 28 } : {};
