import type { SFSymbol } from 'sf-symbols-typescript';

/**
 * Разделы «Управления» — как ManageMenu в вебе (apps/web/src/components/manage/ManageMenu.tsx).
 * Раздел виден, если роль входит в `roles`; сотруднику он скрывается, только если
 * у него явно `permissions[perm] === false`. Владелец видит всё.
 */

type NamedColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray' | 'mint' | 'teal' | 'cyan' | 'indigo' | 'brown';

export type ManageSectionKey =
  | 'menu'
  | 'inventory'
  | 'pricing'
  | 'clients'
  | 'customers'
  | 'balances'
  | 'loyalty'
  | 'collections'
  | 'staff'
  | 'shifts'
  | 'salary'
  | 'settings'
  | 'polls'
  | 'about';

export type ManageSection = {
  key: ManageSectionKey;
  title: string;
  icon: SFSymbol;
  color: NamedColor;
  roles: ('owner' | 'staff')[];
  perm?: string;
  /** Подпись и символ для сотрудника, если отличаются (Пользователи → Мой профиль). */
  staffTitle?: string;
  staffIcon?: SFSymbol;
};

export const MANAGE_GROUPS: { title: string; items: ManageSection[] }[] = [
  {
    title: 'Меню и склад',
    items: [
      { key: 'menu', title: 'Меню', icon: 'menucard', color: 'orange', roles: ['owner', 'staff'], perm: 'menu' },
      { key: 'inventory', title: 'Склад', icon: 'shippingbox', color: 'brown', roles: ['owner', 'staff'], perm: 'inventory' },
      { key: 'pricing', title: 'Тарифы и аренда', icon: 'tag', color: 'teal', roles: ['owner', 'staff'] },
    ],
  },
  {
    title: 'Клиенты',
    items: [
      { key: 'clients', title: 'Клиенты', icon: 'person.2', color: 'blue', roles: ['owner', 'staff'], perm: 'clients' },
      { key: 'customers', title: 'Заказчики', icon: 'briefcase', color: 'indigo', roles: ['owner', 'staff'] },
      { key: 'balances', title: 'Депозиты и долги', icon: 'wallet.bifold', color: 'green', roles: ['owner', 'staff'], perm: 'debtors' },
      { key: 'loyalty', title: 'Лояльность', icon: 'gift', color: 'pink', roles: ['owner', 'staff'] },
      { key: 'collections', title: 'Сбор средств', icon: 'banknote', color: 'mint', roles: ['owner', 'staff'], perm: 'debtors' },
    ],
  },
  {
    title: 'Персонал и смены',
    items: [
      {
        key: 'staff',
        title: 'Пользователи',
        staffTitle: 'Мой профиль',
        icon: 'person.badge.key',
        staffIcon: 'person.crop.circle',
        color: 'gray',
        roles: ['owner', 'staff'],
      },
      { key: 'shifts', title: 'Смены', icon: 'clock', color: 'purple', roles: ['owner', 'staff'] },
      { key: 'salary', title: 'Зарплата', icon: 'rublesign', color: 'cyan', roles: ['owner'], perm: 'salary' },
    ],
  },
  {
    title: 'Система',
    items: [
      { key: 'settings', title: 'Настройки', icon: 'gearshape.2', color: 'gray', roles: ['owner'] },
      { key: 'polls', title: 'Опросы', icon: 'checklist', color: 'red', roles: ['owner'] },
      { key: 'about', title: 'О системе', icon: 'info.circle', color: 'gray', roles: ['owner'] },
    ],
  },
];

export function visibleManageGroups(role: string, permissions: Record<string, boolean> | null) {
  const isOwner = role === 'owner';
  return MANAGE_GROUPS.map((group) => ({
    title: group.title,
    items: group.items
      .filter((item) => item.roles.includes(isOwner ? 'owner' : 'staff'))
      .filter((item) => isOwner || !item.perm || permissions?.[item.perm] !== false)
      .map((item) => ({
        ...item,
        title: !isOwner && item.staffTitle ? item.staffTitle : item.title,
        icon: !isOwner && item.staffIcon ? item.staffIcon : item.icon,
      })),
  })).filter((group) => group.items.length > 0);
}

export function findManageSection(key: string): ManageSection | undefined {
  return MANAGE_GROUPS.flatMap((g) => g.items).find((item) => item.key === key);
}
