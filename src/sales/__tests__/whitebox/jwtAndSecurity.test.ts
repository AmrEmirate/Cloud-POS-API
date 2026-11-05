import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken, JwtPayload } from '../../utils/jwt';
import { config } from '../../config/env';

describe('White Box Testing: jwt.ts & Bcrypt Security', () => {
  describe('Bcrypt Password Hashing Algorithm', () => {
    it('should hash a password and verify correctly', async () => {
      const password = 'Protek2026!Secure';
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);

      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true);

      const isMatch = await bcrypt.compare(password, hash);
      expect(isMatch).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'CorrectPassword123';
      const wrongPassword = 'WrongPassword456';
      const hash = await bcrypt.hash(password, 10);

      const isMatch = await bcrypt.compare(wrongPassword, hash);
      expect(isMatch).toBe(false);
    });

    it('should produce distinct hashes for identical plain passwords due to random salt', async () => {
      const password = 'SamePassword';
      const hash1 = await bcrypt.hash(password, 10);
      const hash2 = await bcrypt.hash(password, 10);

      expect(hash1).not.toBe(hash2);
      expect(await bcrypt.compare(password, hash1)).toBe(true);
      expect(await bcrypt.compare(password, hash2)).toBe(true);
    });
  });

  describe('JWT Token Sign & Verification Branches', () => {
    const samplePayload: JwtPayload = {
      userId: 'sales-uuid-1234',
      email: 'sales@protek.id',
      role: 'SALES',
    };

    it('should sign and verify valid token with proper payload decoding', () => {
      const token = signToken(samplePayload);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const decoded = verifyToken(token);
      expect(decoded.userId).toBe(samplePayload.userId);
      expect(decoded.email).toBe(samplePayload.email);
      expect(decoded.role).toBe(samplePayload.role);
    });

    it('should throw error when token is signed with a different secret', () => {
      const forgedToken = jwt.sign(samplePayload, 'wrong_unauthorized_secret_key');
      expect(() => {
        verifyToken(forgedToken);
      }).toThrow();
    });

    it('should throw error when token has expired', () => {
      const expiredToken = jwt.sign(samplePayload, config.jwtSecret, {
        expiresIn: '0s',
      });
      expect(() => {
        verifyToken(expiredToken);
      }).toThrow();
    });
  });
});

