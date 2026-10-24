import { pool } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import type { Booking } from '../types/domain.js';
import * as bookingsRepo from './bookingsRepository.js';

export type EmployeeDashboard = {
  nextMeeting: Booking | null;
  meetingsThisWeek: number;
  upcomingMeetings: number;
  openInquiries: number;
};

export type CompanyDashboard = {
  nextMeeting: { subject: string; date: string; startTime: string; roomName: string } | null;
  employees: { active: number; blocked: number };
  meetingsThisWeek: number;
  topRooms: { roomName: string; bookings: number }[];
  recentEmployees: { id: number; name: string; joinedAt: Date }[];
};

export type BuildingDashboard = {
  companies: number;
  employees: number;
  rooms: number;
  occupancyToday: { booked: number; free: number; inUseNow: number };
  openInquiries: number;
  inProgressInquiries: number;
};

// All "this week" / "today" boundaries are computed in the configured timezone
// ($1 is always the timezone). Weeks start on Sunday.
const LOCAL_WEEK = `(date_trunc('week', (now() AT TIME ZONE $1::text) + interval '1 day') - interval '1 day')`;
const WEEK_FROM = `(${LOCAL_WEEK} AT TIME ZONE $1::text)`;
const WEEK_TO = `((${LOCAL_WEEK} + interval '7 days') AT TIME ZONE $1::text)`;
const LOCAL_DAY = `date_trunc('day', now() AT TIME ZONE $1::text)`;
const DAY_FROM = `(${LOCAL_DAY} AT TIME ZONE $1::text)`;
const DAY_TO = `((${LOCAL_DAY} + interval '1 day') AT TIME ZONE $1::text)`;

export async function employeeStats(userId: number, timezone: string, db: Db = pool): Promise<EmployeeDashboard> {
  const [nextMeeting, meetings, inquiries] = await Promise.all([
    bookingsRepo.findNextForUser(userId, db),
    db.query(
      `SELECT COUNT(*) FILTER (
                WHERE start_time >= ${WEEK_FROM} AND start_time < ${WEEK_TO}
              )::int AS "thisWeek",
              COUNT(*) FILTER (WHERE start_time > now())::int AS upcoming
       FROM bookings
       WHERE status = 'Active'
         AND (user_id = $2 OR EXISTS (
           SELECT 1 FROM booking_participants bp
           WHERE bp.booking_id = bookings.id AND bp.user_id = $2
         ))`,
      [timezone, userId],
    ),
    db.query(`SELECT COUNT(*)::int AS n FROM inquiries WHERE user_id = $1 AND status = 'Open'`, [userId]),
  ]);
  const meetingCounts = meetings.rows[0] as { thisWeek: number; upcoming: number };
  return {
    nextMeeting,
    meetingsThisWeek: meetingCounts.thisWeek,
    upcomingMeetings: meetingCounts.upcoming,
    openInquiries: (inquiries.rows[0] as { n: number }).n,
  };
}

export async function companyStats(
  companyId: number | null,
  timezone: string,
  db: Db = pool,
): Promise<CompanyDashboard> {
  const [nextMeeting, people, week, topRooms, recent] = await Promise.all([
    db.query<NonNullable<CompanyDashboard['nextMeeting']>>(
      `SELECT b.subject,
              to_char(b.start_time AT TIME ZONE $1::text, 'YYYY-MM-DD') AS date,
              to_char(b.start_time AT TIME ZONE $1::text, 'HH24:MI') AS "startTime",
              r.name AS "roomName"
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN rooms r ON r.id = b.room_id
       WHERE b.status = 'Active' AND b.start_time > now()
         AND ($2::int IS NULL OR u.company_id = $2)
       ORDER BY b.start_time, b.id
       LIMIT 1`,
      [timezone, companyId],
    ),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE NOT is_blocked)::int AS active,
              COUNT(*) FILTER (WHERE is_blocked)::int AS blocked
       FROM users WHERE ($1::int IS NULL OR company_id = $1) AND role <> 'Admin'`,
      [companyId],
    ),
    db.query(
      `SELECT COUNT(*)::int AS n FROM bookings b JOIN users u ON u.id = b.user_id
       WHERE ($2::int IS NULL OR u.company_id = $2) AND b.status = 'Active'
         AND b.start_time >= ${WEEK_FROM} AND b.start_time < ${WEEK_TO}`,
      [timezone, companyId],
    ),
    db.query(
      `SELECT r.name AS "roomName", COUNT(*)::int AS bookings
       FROM bookings b JOIN users u ON u.id = b.user_id JOIN rooms r ON r.id = b.room_id
       WHERE ($1::int IS NULL OR u.company_id = $1)
         AND b.status = 'Active' AND b.start_time >= now() - interval '30 days'
       GROUP BY r.id, r.name ORDER BY bookings DESC, r.name LIMIT 5`,
      [companyId],
    ),
    db.query(
      `SELECT id, name, created_at AS "joinedAt" FROM users
       WHERE ($1::int IS NULL OR company_id = $1)
         AND role <> 'Admin' ORDER BY created_at DESC, id DESC LIMIT 5`,
      [companyId],
    ),
  ]);
  return {
    nextMeeting: nextMeeting.rows[0] ?? null,
    employees: people.rows[0] as unknown as CompanyDashboard['employees'],
    meetingsThisWeek: (week.rows[0] as { n: number }).n,
    topRooms: topRooms.rows as unknown as CompanyDashboard['topRooms'],
    recentEmployees: recent.rows as unknown as CompanyDashboard['recentEmployees'],
  };
}

export async function buildingStats(timezone: string, db: Db = pool): Promise<BuildingDashboard> {
  const [totals, occupancy, inquiries] = await Promise.all([
    db.query(
      `SELECT (SELECT COUNT(*) FROM companies)::int AS companies,
              (SELECT COUNT(*) FROM users WHERE role <> 'Admin')::int AS employees,
              (SELECT COUNT(*) FROM rooms)::int AS rooms`,
    ),
    db.query(
      `SELECT COUNT(DISTINCT room_id)::int AS booked,
              COUNT(DISTINCT room_id) FILTER (WHERE start_time <= now() AND end_time > now())::int AS "inUseNow"
       FROM bookings WHERE status = 'Active' AND start_time < ${DAY_TO} AND end_time > ${DAY_FROM}`,
      [timezone],
    ),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'Open')::int AS open,
              COUNT(*) FILTER (WHERE status = 'InProgress')::int AS "inProgress"
       FROM inquiries`,
    ),
  ]);
  const { companies, employees, rooms } = totals.rows[0] as unknown as {
    companies: number;
    employees: number;
    rooms: number;
  };
  const { booked, inUseNow } = occupancy.rows[0] as unknown as { booked: number; inUseNow: number };
  const counts = inquiries.rows[0] as unknown as { open: number; inProgress: number };
  return {
    companies,
    employees,
    rooms,
    occupancyToday: { booked, free: Math.max(rooms - booked, 0), inUseNow },
    openInquiries: counts.open,
    inProgressInquiries: counts.inProgress,
  };
}
