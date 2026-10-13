import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestStore = { requestId: string; userId?: number };

// Holds { requestId, userId } for the lifetime of a request, so every log line
// written anywhere (services, repositories) is automatically correlated.
export const requestContext = new AsyncLocalStorage<RequestStore>();
