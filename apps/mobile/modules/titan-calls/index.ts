// «Звонки» и уведомления персоналу.
// iOS: PushKit + CallKit (ios/TitanCallManager.swift), обычные push — через expo-notifications.
// Android: постоянная связь с клубом без Google-сервисов (android/…/StaffService.kt) —
// и уведомления, и «звонок» на весь экран приходят по ней.
import { requireOptionalNativeModule } from 'expo';

type Subscription = { remove: () => void };

/** Куда вести после принятого звонка или нажатого уведомления (Android передаёт и notificationId). */
export type AnsweredCall = { kind: string; checkId: string; spaceId: string; notificationId?: string };

interface NativeCalls {
  getVoipToken(): string | null;
  consumePendingCall(): AnsweredCall | null;
  addListener(event: 'onVoipToken', listener: (e: { token: string }) => void): Subscription;
  addListener(event: 'onCallAnswered', listener: (e: AnsweredCall) => void): Subscription;
  // Только Android.
  start?(origin: string, token: string, disabledTypes: string[]): void;
  stop?(): void;
  getStatus?(): string;
  canUseFullScreenIntent?(): boolean;
  openFullScreenIntentSettings?(): void;
  isIgnoringBatteryOptimizations?(): boolean;
  requestIgnoreBatteryOptimizations?(): void;
  firstTime?(key: string): boolean;
}

export const StaffCalls = requireOptionalNativeModule<NativeCalls>('TitanCalls');
