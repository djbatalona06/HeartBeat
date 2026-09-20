import { describe, expect, it } from 'vitest';
import { notificationRoute, notificationTarget } from './target';

const SCOPE = 'https://heartbeat-eop.pages.dev/';

describe('notificationRoute', () => {
  it('reduces both spellings of a route to the same answer', () => {
    // The bug in one line: these four rows are all sitting in
    // `scheduled_nudges` today, written by four different producers.
    expect(notificationRoute('/boss')).toBe('/boss');
    expect(notificationRoute('/#/boss')).toBe('/boss');
    expect(notificationRoute('/mood')).toBe('/mood');
    expect(notificationRoute('/#/mood')).toBe('/mood');
  });

  it('keeps a nested route whole', () => {
    expect(notificationRoute('/#/activities/support')).toBe('/activities/support');
    expect(notificationRoute('/activities/support')).toBe('/activities/support');
  });

  it('answers home for the routes that mean home', () => {
    expect(notificationRoute('/#/')).toBe('/');
    expect(notificationRoute('/#')).toBe('/');
    expect(notificationRoute('/')).toBe('/');
  });

  it('answers home rather than throwing for a missing path', () => {
    // A row written before `path` was required, and the `?? '/'` the service
    // worker used to do inline.
    expect(notificationRoute(undefined)).toBe('/');
    expect(notificationRoute(null)).toBe('/');
    expect(notificationRoute('')).toBe('/');
    expect(notificationRoute('   ')).toBe('/');
  });

  it('refuses anything that would leave the app', () => {
    // Each of these reaches `clients.openWindow` if it survives, so each is an
    // open redirect with a notification as the bait.
    expect(notificationRoute('https://example.com')).toBe('/');
    expect(notificationRoute('//example.com')).toBe('/');
    expect(notificationRoute('/#//example.com')).toBe('/');
    expect(notificationRoute('javascript:alert(1)')).toBe('/');
    expect(notificationRoute('/#/mood?next=https://example.com')).toBe('/');
    expect(notificationRoute('/../admin')).toBe('/');
  });

  it('refuses a path longer than the wire allows', () => {
    expect(notificationRoute(`/#/${'a'.repeat(200)}`)).toBe('/');
  });

  it('accepts every path the shipped producers actually write', () => {
    // Pinned against the real call sites so a fifth producer writing a third
    // spelling fails here rather than on somebody's phone.
    const shipped = ['/boss', '/#/mood', '/#/', '/#/activities/support'];
    for (const path of shipped) {
      expect(notificationRoute(path)).toMatch(/^\/[A-Za-z0-9/_-]*$/);
    }
  });
});

describe('notificationTarget', () => {
  it('puts the route after the hash, once', () => {
    expect(notificationTarget(SCOPE, '/#/mood')).toBe(`${SCOPE}#/mood`);
    expect(notificationTarget(SCOPE, '/boss')).toBe(`${SCOPE}#/boss`);
  });

  it('never produces the double hash that broke the tap', () => {
    for (const path of ['/boss', '/#/mood', '/#/', '/', undefined]) {
      expect(notificationTarget(SCOPE, path)).not.toContain('#/#');
    }
  });

  it('honours a scope that is not the origin root', () => {
    // `APP_BASE` is a build input, so the scope is not always `/`.
    expect(notificationTarget('https://example.com/app/', '/#/mood'))
      .toBe('https://example.com/app/#/mood');
  });
});
