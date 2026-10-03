import { disconnectHa } from './home-assistant';
import { clearSmartHomeCache, queryClient } from './queries';
import { useSession } from './session';

/** Отвязать планшет от клуба: забыть клуб, кабинку, умный дом и разорвать связь с HA. */
export async function forgetClubCompletely() {
  disconnectHa();
  await clearSmartHomeCache();
  queryClient.clear();
  await useSession.getState().forgetClub();
}
