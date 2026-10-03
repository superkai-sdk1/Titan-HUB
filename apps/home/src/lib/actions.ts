// Действия гостя, доступные с нескольких экранов.
import { api, errorText } from './api';
import { toast } from './flow';
import { haptic } from './haptics';

let lastCall = 0;

/** Позвать администратора (работает и без открытого счёта). Не чаще раза в 30 секунд. */
export async function callStaff() {
  if (Date.now() - lastCall < 30_000) {
    toast('Администратор уже знает — сейчас подойдёт', 'info');
    return;
  }
  try {
    await api.post('/notifications/staff-call', {});
    lastCall = Date.now();
    haptic.success();
    toast('Администратор уже идёт к вам');
  } catch (e) {
    toast(errorText(e), 'error');
  }
}

/** Попросить счёт: персонал получит уведомление с суммой. */
export async function requestBill(checkId: string) {
  try {
    await api.post('/notifications/request-bill', { checkId });
    haptic.success();
    toast('Администратор принесёт счёт');
  } catch (e) {
    toast(errorText(e), 'error');
  }
}
