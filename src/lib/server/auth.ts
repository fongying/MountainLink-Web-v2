// src/lib/server/auth.ts
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天
export const SESSION_COOKIE_NAME = 'ml_sid';

type User = { id: number; username: string; is_admin: number };

function run(sql: string, params: any[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function getOne<T>(sql: string, params: any[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function getAll<T>(sql: string, params: any[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });
}

export async function countUsers(): Promise<number> {
  const row = await getOne<{ c: number }>('SELECT COUNT(1) as c FROM users');
  return row?.c ?? 0;
}


export async function createUser(username: string, password: string, isAdmin = 0) {
  const hash = bcrypt.hashSync(password, 12);
  await run('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)', [username, hash, isAdmin]);
}

export async function verifyUser(username: string, password: string): Promise<User | null> {
  const row = await getOne<{ id: number; username: string; password_hash: string; is_admin: number}>(
    'SELECT id, username, password_hash, is_admin FROM users WHERE username = ?',
    [username]
  );
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, username: row.username, is_admin: row.is_admin };
}

export async function createSession(userId: number) {
  const sid = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [sid, userId, expiresAt]);
  return { sid, expiresAt };
}

export async function getUserBySessionId(sid: string): Promise<User | null> {
  const now = Math.floor(Date.now() / 1000);
  await run('DELETE FROM sessions WHERE expires_at < ?', [now]);

  const row = await getOne<User>(
    `SELECT u.id as id, u.username as username, u.is_admin as is_admin
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at >= ?`,
    [sid, now]
  );

  return row ?? null;
}

export async function listUsers(): Promise<User[]> {
  const rows = await getAll<User>('SELECT id, username, is_admin FROM users ORDER BY username ASC');
  return rows ?? [];
}

export async function invalidateSession(sid: string) {
  await run('DELETE FROM sessions WHERE id = ?', [sid]);
}
