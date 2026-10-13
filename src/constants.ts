export const ROLES = {
  EMPLOYEE: 'Employee',
  MANAGER: 'Manager',
  ADMIN: 'Admin',
} as const;

export const INQUIRY_STATUS = {
  OPEN: 'Open',
  IN_PROGRESS: 'InProgress',
  CLOSED: 'Closed',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
export type InquiryStatus = (typeof INQUIRY_STATUS)[keyof typeof INQUIRY_STATUS];
export type BookingStatus = 'Active' | 'Cancelled';

export const MAX_BOOKING_HOURS = 8;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
