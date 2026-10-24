import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createBookingBody, listAllBookingsQuery } from '../src/validators/bookings.js';

const bookingInput = {
  roomId: 1,
  subject: 'Planning',
  date: '2030-12-03',
  startTime: '09:00',
  endTime: '10:00',
};

test('booking validator accepts optional, valid, unique participant IDs', () => {
  assert.deepEqual(createBookingBody.parse(bookingInput).participantIds, []);
  assert.deepEqual(
    createBookingBody.parse({ ...bookingInput, participantIds: [2, 3] }).participantIds,
    [2, 3],
  );
  assert.equal(createBookingBody.safeParse({ ...bookingInput, participantIds: [2, 2] }).success, false);
  assert.equal(createBookingBody.safeParse({ ...bookingInput, participantIds: [0] }).success, false);
  assert.equal(createBookingBody.safeParse({ ...bookingInput, participantIds: ['2'] }).success, false);
});

test('all-bookings query does not apply room, date, or employee filters', () => {
  assert.deepEqual(listAllBookingsQuery.parse({ page: '1', pageSize: '100' }), {
    page: 1,
    pageSize: 100,
  });
  assert.deepEqual(
    listAllBookingsQuery.parse({
      roomId: '123',
      from: '2030-01-01T00:00:00Z',
      to: '2030-01-02T00:00:00Z',
      employeeId: '456',
      page: '1',
      pageSize: '100',
    }),
    {
      page: 1,
      pageSize: 100,
    },
  );
});

const testDatabaseUrl = process.env.OFFICEHUB_TEST_DATABASE_URL;
if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET ??= 'officehub-integration-test-secret-32-chars';

  const [
    { pool },
    { migrate },
    bookingsService,
    dashboardRepository,
    bookingsRepository,
    usersRepository,
    errors,
    { env },
  ] =
    await Promise.all([
      import('../src/db/pool.js'),
      import('../src/db/migrate.js'),
      import('../src/services/bookingsService.js'),
      import('../src/repositories/dashboardRepository.js'),
      import('../src/repositories/bookingsRepository.js'),
      import('../src/repositories/usersRepository.js'),
      import('../src/utils/errors.js'),
      import('../src/config/env.js'),
    ]);

  test('booking participant persistence, eligibility, capacity, overlap, and visibility', async () => {
    const suffix = randomUUID();
    let companyId: number | undefined;
    let otherCompanyId: number | undefined;
    let roomIds: number[] = [];
    let userIds: number[] = [];

    try {
      await migrate();
      const company = await pool.query<{ id: number }>(
        `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
        [`Booking test ${suffix}`],
      );
      companyId = company.rows[0].id;
      const otherCompany = await pool.query<{ id: number }>(
        `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
        [`Booking test other ${suffix}`],
      );
      otherCompanyId = otherCompany.rows[0].id;

      const insertUser = async (
        name: string,
        company: number,
        isBlocked = false,
      ): Promise<{ id: number; name: string }> => {
        const result = await pool.query<{ id: number }>(
          `INSERT INTO users (company_id, name, email, password_hash, role, is_blocked)
           VALUES ($1, $2, $3, 'test-hash', 'Employee', $4) RETURNING id`,
          [company, name, `${suffix}-${name.replaceAll(' ', '-')}@test.invalid`, isBlocked],
        );
        userIds.push(result.rows[0].id);
        return { id: result.rows[0].id, name };
      };

      const organizer = await insertUser('Organizer', companyId);
      const participant = await insertUser('Participant', companyId);
      const blockedParticipant = await insertUser('Blocked participant', companyId, true);
      const crossCompanyParticipant = await insertUser('Other company participant', otherCompanyId);
      const unrelated = await insertUser('Unrelated employee', companyId);
      const adminResult = await pool.query<{ id: number }>(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, 'test-hash', 'Admin') RETURNING id`,
        ['Test Admin', `${suffix}-admin@test.invalid`],
      );
      const adminId = adminResult.rows[0].id;
      userIds.push(adminId);
      const roomResult = await pool.query<{ id: number }>(
        `INSERT INTO rooms (name, capacity) VALUES ($1, 4), ($2, 2) RETURNING id`,
        [`Booking test room ${suffix}`, `Booking test small room ${suffix}`],
      );
      roomIds = roomResult.rows.map(({ id }) => id);

      const organizerUser = await usersRepository.findById(organizer.id);
      const participantUser = await usersRepository.findById(participant.id);
      const unrelatedUser = await usersRepository.findById(unrelated.id);
      const adminUser = await usersRepository.findById(adminId);
      assert.ok(organizerUser);
      assert.ok(participantUser);
      assert.ok(unrelatedUser);
      assert.ok(adminUser);

      const date = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const request = {
        roomId: roomIds[0],
        subject: 'Participant integration test',
        date,
        startTime: '10:00',
        endTime: '11:00',
        participantIds: [participant.id, organizer.id],
      };
      const created = await bookingsService.create(organizerUser, request);
      assert.deepEqual(
        created.participants.map(({ id }) => id).sort((a, b) => a - b),
        [organizer.id, participant.id].sort((a, b) => a - b),
      );

      const stored = await bookingsRepository.findById(created.id);
      assert.ok(stored);
      assert.deepEqual(
        stored.participants.map(({ id }) => id).sort((a, b) => a - b),
        [organizer.id, participant.id].sort((a, b) => a - b),
      );

      for (const invalidId of [blockedParticipant.id, crossCompanyParticipant.id, 2_147_483_647]) {
        await assert.rejects(
          bookingsService.create(organizerUser, { ...request, participantIds: [invalidId] }),
          (error: unknown) => error instanceof errors.AppError && error.status === 400,
        );
      }

      await assert.rejects(
        bookingsService.create(organizerUser, {
          ...request,
          roomId: roomIds[1],
          participantIds: [participant.id, unrelated.id],
        }),
        (error: unknown) => error instanceof errors.AppError && error.status === 400,
      );

      await assert.rejects(
        bookingsService.create(organizerUser, { ...request, participantIds: [] }),
        (error: unknown) => error instanceof errors.AppError && error.status === 409,
      );

      const query = { upcoming: false, page: 1, pageSize: 100 };
      const organizerBookings = await bookingsService.listMine(organizer.id, query);
      const participantBookings = await bookingsService.listMine(participant.id, query);
      const unrelatedBookings = await bookingsService.listMine(unrelated.id, query);
      assert.ok(organizerBookings.items.some(({ id }) => id === created.id));
      assert.ok(participantBookings.items.some(({ id }) => id === created.id));
      assert.ok(!unrelatedBookings.items.some(({ id }) => id === created.id));

      const companyDashboard = await dashboardRepository.companyStats(companyId, env.APP_TIMEZONE);
      assert.deepEqual(companyDashboard.nextMeeting, {
        subject: request.subject,
        date,
        startTime: request.startTime,
        roomName: created.roomName,
      });
      const companyWithoutMeetings = await dashboardRepository.companyStats(otherCompanyId, env.APP_TIMEZONE);
      assert.equal(companyWithoutMeetings.nextMeeting, null);

      const adminBooking = await bookingsService.create(adminUser, {
        ...request,
        startTime: '12:00',
        endTime: '13:00',
        participantIds: [participant.id, crossCompanyParticipant.id, adminId],
      });
      assert.deepEqual(
        adminBooking.participants.map(({ id }) => id).sort((a, b) => a - b),
        [adminId, participant.id, crossCompanyParticipant.id].sort((a, b) => a - b),
      );
      const adminBookings = await bookingsService.listMine(adminId, query);
      assert.ok(adminBookings.items.some(({ id }) => id === adminBooking.id));

      const adminDashboard = await dashboardRepository.companyStats(null, env.APP_TIMEZONE);
      assert.ok(adminDashboard.nextMeeting);

      const secondRoomBooking = await bookingsService.create(organizerUser, {
        ...request,
        roomId: roomIds[1],
        startTime: '14:00',
        endTime: '15:00',
        participantIds: [],
      });
      const allBookings = await bookingsService.listAllForAdmin(adminUser, { page: 1, pageSize: 100 });
      assert.ok(allBookings.items.some(({ id }) => id === adminBooking.id));
      assert.ok(allBookings.items.some(({ id }) => id === secondRoomBooking.id));
      assert.notEqual(adminBooking.roomId, secondRoomBooking.roomId);

      const privateRoomBookings = await bookingsService.listForRoom(unrelatedUser, roomIds[0], {
        page: 1,
        pageSize: 100,
      });
      const hidden = privateRoomBookings.items.find(({ id }) => id === created.id);
      assert.ok(hidden);
      assert.equal(hidden.subject, null);
      assert.deepEqual(hidden.participants, []);

      await assert.rejects(
        bookingsService.cancel(participantUser, created.id),
        (error: unknown) => error instanceof errors.AppError && error.status === 403,
      );

      assert.equal(env.NODE_ENV, 'test');
    } finally {
      if (roomIds.length) {
        await pool.query('DELETE FROM rooms WHERE id = ANY($1::int[])', [roomIds]);
      }
      if (userIds.length) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
      }
      if (companyId !== undefined) {
        await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
      }
      if (otherCompanyId !== undefined) {
        await pool.query('DELETE FROM companies WHERE id = $1', [otherCompanyId]);
      }
      await pool.end();
    }
  });
} else {
  test('booking integration tests require OFFICEHUB_TEST_DATABASE_URL', { skip: true }, () => {});
}
