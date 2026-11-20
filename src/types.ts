export const PRODUCT_CATEGORIES = ['Quail Egg', 'Egg Pickle', 'Nuts'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export interface UserSession {
  userId: string;
  username: string;
  role: 'admin' | 'team';
  displayRole: string;
  shopId: string | null;
  accountType: 'admin' | 'team' | 'shop';
}

export interface Shop {
  id: string;
  name: string;
  category: ProductCategory;
  legacyCategory?: string;
  status: 'active' | 'inactive';
  description: string;
  address: string;
  phone: string;
  image: string;
  username?: string;
  password?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  shopId: string;
  shopName: string;
  customerName: string;
  date: string;
  productName: ProductCategory;
  quantity: number;
  givenQuantity: number;
  price: number;
  total: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CategoryCounts = Record<ProductCategory, number>;

export interface TeamAccount {
  id: string;
  name: string;
  username: string;
  password: string;
  active: boolean;
  updatedAt: string;
}

export interface ShopAccountSummary {
  id: string;
  name: string;
  category: ProductCategory;
  status: 'active' | 'inactive';
  username: string;
  password: string;
  updatedAt: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  detail: string;
}

export interface AdminAccountsPayload {
  admin: {
    id: 'admin';
    username: string;
    displayName: string;
    updatedAt: string;
  };
  teams: TeamAccount[];
  shops: ShopAccountSummary[];
  activityLog: ActivityEntry[];
}

export interface AppBuildStatus {
  appName: string;
  version: string;
  apkAvailable: boolean;
  apkSizeBytes: number | null;
  apkUrl: string | null;
  capacitorConfigured: boolean;
  androidProjectReady: boolean;
  iosProjectReady: boolean;
}
