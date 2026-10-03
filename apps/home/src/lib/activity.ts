// Последнее касание экрана: по нему киоск возвращается на главный экран, если гость
// ушёл посреди меню, и включает заставку в простое.
let last = Date.now();

export const markActivity = () => {
  last = Date.now();
};

export const idleFor = () => Date.now() - last;
