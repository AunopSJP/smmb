import { NotFoundException } from '@nestjs/common';
import { AppError } from '../common/http-exception.filter.js';
import type { RequiredRole } from './auth.decorators.js';
import type { Access } from './access.service.js';
import { checkRoles, needsPush } from './roles.guard.js';

const access = (roles: RequiredRole[], agency?: Partial<NonNullable<Access['agency']>>): Access => ({
  roles: new Set(roles),
  levels: {},
  agency: agency
    ? { id: 'a', name: 'A', type: 'police', agencyStatus: 'approved', membershipStatus: 'active', isHead: false, ...agency }
    : null,
});

const codeOf = (fn: () => void): string | undefined => {
  try {
    fn();
    return 'allowed';
  } catch (err) {
    if (err instanceof AppError) return err.code;
    if (err instanceof NotFoundException) return '404';
    throw err;
  }
};

describe('checkRoles', () => {
  it('allows when any required role is present', () => {
    expect(codeOf(() => checkRoles(['owner'], access(['owner', 'officer'])))).toBe('allowed');
    expect(codeOf(() => checkRoles(['officer', 'head'], access(['officer'])))).toBe('allowed');
  });

  it('missing role → 404 (does not reveal the route)', () => {
    expect(codeOf(() => checkRoles(['admin'], access(['owner'])))).toBe('404');
    expect(codeOf(() => checkRoles(['owner'], access([])))).toBe('404');
  });

  it('owner who is also a pending officer: owner routes work, officer routes say pending', () => {
    const a = access(['owner'], { membershipStatus: 'pending' });
    expect(codeOf(() => checkRoles(['owner'], a))).toBe('allowed');
    expect(codeOf(() => checkRoles(['officer'], a))).toBe('ACCOUNT_PENDING');
  });

  it('head of an agency still waiting for admin → ACCOUNT_PENDING', () => {
    expect(codeOf(() => checkRoles(['head'], access([], { agencyStatus: 'pending', isHead: true })))).toBe(
      'ACCOUNT_PENDING',
    );
  });

  it('rejected membership or agency → ACCOUNT_REJECTED', () => {
    expect(codeOf(() => checkRoles(['officer'], access([], { membershipStatus: 'rejected' })))).toBe(
      'ACCOUNT_REJECTED',
    );
    expect(codeOf(() => checkRoles(['officer'], access([], { agencyStatus: 'rejected' })))).toBe('ACCOUNT_REJECTED');
  });

  it('active officer who is not head → 404 on head routes', () => {
    expect(codeOf(() => checkRoles(['head'], access(['officer'], {})))).toBe('404');
  });

  it('pending status does not leak onto non-agency routes', () => {
    expect(codeOf(() => checkRoles(['admin'], access([], { membershipStatus: 'pending' })))).toBe('404');
  });
});

describe('needsPush', () => {
  it('officer-only routes need push', () => {
    expect(needsPush(['officer'], access(['officer']))).toBe(true);
    expect(needsPush(['officer', 'head'], access(['officer', 'head']))).toBe(true);
  });

  it('routes the user reaches through another role do not', () => {
    expect(needsPush(['owner'], access(['owner', 'officer']))).toBe(false);
    expect(needsPush(['owner', 'officer'], access(['owner', 'officer']))).toBe(false);
    expect(needsPush(['admin'], access(['admin']))).toBe(false);
  });
});
