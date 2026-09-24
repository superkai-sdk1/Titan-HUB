import { ContentUnavailableView, Host } from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';

/** Системный экран «нет содержимого» (ContentUnavailableView). */
export function Unavailable({
  title,
  systemImage,
  description,
}: {
  title: string;
  systemImage: SFSymbol;
  description?: string;
}) {
  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <ContentUnavailableView title={title} systemImage={systemImage} description={description} />
    </Host>
  );
}
