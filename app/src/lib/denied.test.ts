import { describe, expect, it } from 'vitest';
import { denied, deniedMessage } from './denied';

describe('denied', () => {
  it('refuse une erreur de la base', () => {
    const res = { error: { message: 'new row violates row-level security policy' }, data: null };
    expect(denied(res)).toBe(true);
    expect(deniedMessage(res)).toBe('new row violates row-level security policy');
  });
  it('refuse une écriture qui ne touche aucune ligne (RLS silencieuse)', () => {
    const res = { error: null, data: [] };
    expect(denied(res)).toBe(true);
    expect(deniedMessage(res)).toMatch(/droits insuffisants/);
  });
  it('accepte une écriture qui touche au moins une ligne', () => {
    expect(denied({ error: null, data: [{ id: 'f1' }] })).toBe(false);
  });
});
