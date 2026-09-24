// Кнопки и меню в шапке, работающие на обеих платформах.
//
// Иконки в Stack.Toolbar заданы именами SF Symbols. На Android expo-router их
// МОЛЧА ОТБРАСЫВАЕТ («Only ImageSourcePropType icons are rendered» в его типах) —
// кнопка остаётся на месте, но без изображения, и шапка выглядит пустой.
// Обёртки подставляют там картинку из шрифта Material Symbols по той же таблице,
// что и остальные иконки приложения.
import { Stack } from 'expo-router';
import { unstable_getMaterialSymbolSourceAsync, type AndroidSymbol } from 'expo-symbols';
import { useEffect, useState, type ComponentProps } from 'react';
import { Platform, type ImageSourcePropType } from 'react-native';

import { toMaterialSymbol } from '@/compat/android/sf-to-material';

const ICON_SIZE = 24;
const cache = new Map<string, ImageSourcePropType>();

/** Картинка Material-символа для Android; на iOS всегда undefined — там хватает имени SF. */
function useMaterialIcon(sf?: string): ImageSourcePropType | undefined {
  const [source, setSource] = useState<ImageSourcePropType | undefined>(() =>
    sf ? cache.get(sf) : undefined,
  );

  useEffect(() => {
    if (Platform.OS !== 'android' || !sf || cache.has(sf)) return;
    const material = toMaterialSymbol(sf);
    if (!material) return;
    let alive = true;
    // Таблица отдаёт имя строкой, а типы модуля описывают его перечислением.
    unstable_getMaterialSymbolSourceAsync(material as AndroidSymbol, ICON_SIZE, 'white')
      .then((image) => {
        if (!image) return;
        cache.set(sf, image as ImageSourcePropType);
        if (alive) setSource(image as ImageSourcePropType);
      })
      .catch(() => {
        /* без иконки кнопка всё равно работает */
      });
    return () => {
      alive = false;
    };
  }, [sf]);

  return Platform.OS === 'android' ? source : undefined;
}

type MenuProps = ComponentProps<typeof Stack.Toolbar.Menu>;
type MenuActionProps = ComponentProps<typeof Stack.Toolbar.MenuAction>;
type ButtonProps = ComponentProps<typeof Stack.Toolbar.Button>;

export function ToolbarMenu({ icon, ...rest }: MenuProps) {
  const android = useMaterialIcon(icon as string | undefined);
  // Тип пропа рассчитан на SF Symbol, но на Android компонент ждёт именно картинку.
  return <Stack.Toolbar.Menu {...rest} icon={(android ?? icon) as MenuProps['icon']} />;
}

export function ToolbarMenuAction({ icon, ...rest }: MenuActionProps) {
  const android = useMaterialIcon(icon as string | undefined);
  return <Stack.Toolbar.MenuAction {...rest} icon={(android ?? icon) as MenuActionProps['icon']} />;
}

export function ToolbarButton({ icon, ...rest }: ButtonProps) {
  const android = useMaterialIcon(icon as string | undefined);
  return <Stack.Toolbar.Button {...rest} icon={(android ?? icon) as ButtonProps['icon']} />;
}
