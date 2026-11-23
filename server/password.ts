import { randomBytes, scryptSync } from 'node:crypto';

export const seededDemoPassword = 'ZuriDemo!2026';

export function passwordHash(password:string, salt=randomBytes(16).toString('hex')) {
  return salt+':'+scryptSync(password,salt,64).toString('hex');
}
