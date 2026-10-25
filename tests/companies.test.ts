import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompanyBody } from '../src/validators/companies.js';

test('company creation requires valid manager credentials', () => {
  const companyInput = {
    name: 'OfficeHub',
    manager: {
      name: 'Office Manager',
      email: 'manager@example.com',
      password: 'password123',
    },
  };

  assert.deepEqual(createCompanyBody.parse(companyInput), companyInput);
  assert.equal(createCompanyBody.safeParse({ name: 'OfficeHub' }).success, false);
  assert.equal(
    createCompanyBody.safeParse({
      ...companyInput,
      manager: { ...companyInput.manager, email: 'not-an-email' },
    }).success,
    false,
  );
  assert.equal(
    createCompanyBody.safeParse({
      ...companyInput,
      manager: { ...companyInput.manager, password: '123' },
    }).success,
    false,
  );
});
