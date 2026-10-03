// Формы ответов API клуба, которые использует киоск (см. apps/api/src/modules/pos).

export interface CheckItemRow {
  checkItem: { id: string; quantity: number; priceAtTime: string };
  item: { id: string; name: string; price: string; category?: string | null } | null;
  modifiers?: { id: string; priceAtTime: string }[];
}

export interface PendingOrder {
  id: string;
  status: string;
  items: { itemId: string; name: string; quantity: number; price: string }[];
  createdAt: string;
}

export interface Check {
  id: string;
  status: 'open' | 'closed' | 'cancelled';
  totalAmount: string;
  discountTotal?: string | null;
  eventBaseAmount?: string | null;
  staffCompId?: string | null;
  items: CheckItemRow[];
  pendingOrders?: PendingOrder[];
  guestName?: string | null;
  spaceId?: string | null;
  spaceStartAt?: string | null;
  spaceEndAt?: string | null;
  spaceHourlyRate?: string | null;
  closedAt?: string | null;
  createdAt: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isTabletVisible?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  price: string;
  category: string | null;
  isActive: boolean;
  isTabletVisible: boolean;
  isTop?: boolean;
  stockQuantity: number;
  trackStock: boolean;
  searchTags?: string[];
  sortOrder?: number;
}

export interface ClubEvent {
  id: string;
  title: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface ChatMessage {
  id: string;
  sender: 'guest' | 'staff';
  text: string;
  createdAt: string;
  readAt: string | null;
}

export interface SmartDevice {
  entityId: string;
  name: string;
}

export interface SmartRoom {
  lights: SmartDevice[];
  climate: SmartDevice | null;
}

export interface SmartHomeConfig {
  connection: { url: string; token: string } | null;
  room: SmartRoom;
}
