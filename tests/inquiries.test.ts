import assert from 'node:assert/strict';
import test from 'node:test';
import { handleInquiryBody } from '../src/validators/inquiries.js';

test('handling an inquiry does not require a reply', () => {
  assert.deepEqual(handleInquiryBody.parse({ status: 'Closed' }), { status: 'Closed' });
  assert.deepEqual(handleInquiryBody.parse({ status: 'Closed', reply: '' }), { status: 'Closed', reply: undefined });
  assert.deepEqual(handleInquiryBody.parse({ status: 'InProgress', reply: '  Follow-up needed  ' }), {
    status: 'InProgress',
    reply: 'Follow-up needed',
  });
});
