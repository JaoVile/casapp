import * as bcrypt from 'bcryptjs';

export class HashUtil {
  static async hash(value: string): Promise<string> {
    return bcrypt.hash(value, 12);
  }

  static async compare(value: string, hash: string): Promise<boolean> {
    return bcrypt.compare(value, hash);
  }
}