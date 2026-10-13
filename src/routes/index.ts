import { Router } from 'express';
import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { ROLES } from '../constants.js';
import * as authCtl from '../controllers/authController.js';
import * as bookingsCtl from '../controllers/bookingsController.js';
import * as companiesCtl from '../controllers/companiesController.js';
import * as dashboardCtl from '../controllers/dashboardController.js';
import * as employeesCtl from '../controllers/employeesController.js';
import * as inquiriesCtl from '../controllers/inquiriesController.js';
import * as profileCtl from '../controllers/profileController.js';
import * as roomsCtl from '../controllers/roomsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const { EMPLOYEE, MANAGER, ADMIN } = ROLES;

const staff = authorize(EMPLOYEE, MANAGER); // roles that attend meetings and file inquiries
const people = authorize(MANAGER, ADMIN); // roles that manage employees
const admin = authorize(ADMIN);

const router = Router();

const limiter = (windowMs: number, limit: number, message: string, skipSuccessfulRequests = false): RequestHandler =>
  rateLimit({ windowMs, limit, skipSuccessfulRequests, standardHeaders: 'draft-7', legacyHeaders: false, message: { message } });

router.use(limiter(60_000, 300, 'Too many requests, please slow down'));

// ---- Public ---------------------------------------------------------------
router.post(
  '/auth/login',
  limiter(15 * 60_000, 10, 'Too many failed login attempts, try again later', true),
  authCtl.login,
);

// ---- Everything below requires a valid token ------------------------------
router.use(authenticate);

router.get('/auth/me', authCtl.me);

router.get('/profile', profileCtl.get);
router.put('/profile', profileCtl.update);
router.put('/profile/password', profileCtl.changePassword);

// Rooms (static paths are declared before "/:id")
router.get('/rooms', roomsCtl.list);
router.get('/rooms/available', roomsCtl.listAvailable);
router.get('/rooms/:id', roomsCtl.get);
router.get('/rooms/:id/bookings', bookingsCtl.listForRoom);
router.post('/rooms', admin, roomsCtl.create);
router.put('/rooms/:id', admin, roomsCtl.update);
router.delete('/rooms/:id', admin, roomsCtl.remove);

// Bookings
router.get('/bookings/mine', staff, bookingsCtl.listMine);
router.get('/bookings', people, bookingsCtl.list);
router.post('/bookings', staff, bookingsCtl.create);
router.delete('/bookings/:id', bookingsCtl.cancel); // owner or admin (checked in the service)

// Employees (company manager: own company; admin: all)
router.get('/employees', people, employeesCtl.list);
router.post('/employees', people, employeesCtl.create);
router.get('/employees/:id', people, employeesCtl.get);
router.put('/employees/:id', people, employeesCtl.update);
router.patch('/employees/:id/block', people, employeesCtl.block);
router.patch('/employees/:id/unblock', people, employeesCtl.unblock);
router.patch('/employees/:id/role', people, employeesCtl.setRole);

// Companies
router.get('/companies', admin, companiesCtl.list);
router.get('/companies/mine', authorize(MANAGER), companiesCtl.mine);
router.post('/companies', admin, companiesCtl.create);
router.put('/companies/:id', admin, companiesCtl.update);

// Inquiries
router.get('/inquiries/mine', staff, inquiriesCtl.listMine);
router.post('/inquiries', staff, inquiriesCtl.create);
router.get('/inquiries', admin, inquiriesCtl.listAll);
router.get('/inquiries/:id', inquiriesCtl.get); // owner or admin (checked in the service)
router.patch('/inquiries/:id', admin, inquiriesCtl.handle);

// Dashboards
router.get('/dashboard/employee', authorize(EMPLOYEE), dashboardCtl.employee);
router.get('/dashboard/company', authorize(MANAGER), dashboardCtl.company);
router.get('/dashboard/building', admin, dashboardCtl.building);

export default router;
