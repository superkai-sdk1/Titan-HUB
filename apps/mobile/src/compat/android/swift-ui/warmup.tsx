import { ChartIsland, DateIsland } from './islands';

const noop = () => {};

/**
 * Нативные вставки, которые встречаются чаще всего, — для прогрева при запуске
 * (components/swiftui-warmup.tsx): графики аналитики и календарь панели выбора даты.
 */
export function IslandsWarmup() {
  return (
    <>
      <DateIsland selection={new Date(0)} displayedComponents={['date', 'hourAndMinute']} onDateChange={noop} />
      <ChartIsland type="bar" data={[{ x: 1, y: 1 }]} height={40} />
      <ChartIsland type="line" data={[{ x: 1, y: 1 }, { x: 2, y: 2 }]} height={40} />
      <ChartIsland type="pie" data={[{ x: 'a', y: 1 }]} height={40} />
    </>
  );
}
