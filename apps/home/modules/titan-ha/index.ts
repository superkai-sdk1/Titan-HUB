// Нативное соединение с Home Assistant (Kotlin, android/…/titanha): его держит
// foreground-сервис HaService, экран только читает снимок и шлёт команды.
import { requireOptionalNativeModule } from 'expo';

type Subscription = { remove: () => void };

interface NativeHa {
  getSnapshot(): string;
  configure(url: string, token: string, entityIds: string[]): void;
  stop(): void;
  reconnect(): void;
  callService(domain: string, service: string, entityId: string, dataJson: string): Promise<void>;
  getStates(): Promise<string>;
  addListener(event: 'onChange', listener: (e: { snapshot: string }) => void): Subscription;
}

export const NativeHomeAssistant = requireOptionalNativeModule<NativeHa>('TitanHa');
