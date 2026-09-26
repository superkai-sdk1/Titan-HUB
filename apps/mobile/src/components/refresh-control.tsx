import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext } from 'react';
import { Platform, RefreshControl, type RefreshControlProps } from 'react-native';

import { accentHex } from '@/lib/theme';

/**
 * RefreshControl, который на Android виден. Шапка там прозрачная (components/header-glass),
 * и стандартный индикатор появлялся за ней — у верхнего края прокрутки. Сдвигаем его на
 * высоту шапки и красим в акцент (tintColor — только iOS, на Android нужен `colors`).
 */
export function AppRefreshControl(props: RefreshControlProps) {
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const android = Platform.OS === 'android';
  return (
    <RefreshControl
      {...props}
      progressViewOffset={props.progressViewOffset ?? (android && headerHeight > 0 ? headerHeight : undefined)}
      colors={props.colors ?? (android ? [accentHex.light] : undefined)}
    />
  );
}
