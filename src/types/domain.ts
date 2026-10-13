import type { BookingStatus, InquiryStatus, Role } from '../constants.js';

export type User = {
  id: number;
  companyId: number | null;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  isBlocked: boolean;
  createdAt: Date;
};

export type UserWithPassword = User & { passwordHash: string };

export type Company = {
  id: number;
  name: string;
  floor: number | null;
  phone: string | null;
  createdAt: Date;
};

export type Room = {
  id: number;
  name: string;
  capacity: number;
  floor: number;
  equipment: string[];
  createdAt: Date;
};

// subject/userName are nullable because other people's bookings are redacted
// in the room calendar view.
export type Booking = {
  id: number;
  roomId: number;
  roomName: string;
  userId: number;
  userName: string | null;
  subject: string | null;
  start: Date;
  end: Date;
  status: BookingStatus;
  createdAt: Date;
};

export type Inquiry = {
  id: number;
  userId: number;
  userName: string;
  subject: string;
  content: string;
  status: InquiryStatus;
  reply: string | null;
  handledBy: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PageParams = { page: number; pageSize: number };
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
