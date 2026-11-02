import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('White Box Testing: Authentication & Security Tokens (Bcrypt & JWT)', () => {
  const secret = 'dimsum_intan_super_secure_jwt_secret_key_2026';

  describe('White Box: Bcrypt Password & PIN Hashing Algorithm', () => {
    it('should correctly hash and verify password', async () => {
      const rawPassword = 'StrongOwnerPassword2026!';
      const hash = await bcrypt.hash(rawPassword, 10);

      expect(hash).not.toEqual(rawPassword);
      expect(hash.startsWith('$2')).toBe(true);

      const isMatch = await bcrypt.compare(rawPassword, hash);
      expect(isMatch).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const rawPassword = 'CorrectPassword';
      const hash = await bcrypt.hash(rawPassword, 10);

      const isMatch = await bcrypt.compare('WrongPassword', hash);
      expect(isMatch).toBe(false);
    });

    it('should generate distinct salt hashes for identical passwords', async () => {
      const password = 'identicalPassword';
      const hash1 = await bcrypt.hash(password, 10);
      const hash2 = await bcrypt.hash(password, 10);

      expect(hash1).not.toEqual(hash2);
      expect(await bcrypt.compare(password, hash1)).toBe(true);
      expect(await bcrypt.compare(password, hash2)).toBe(true);
    });
  });

  describe('White Box: JWT Token Sign, Payload & Verification', () => {
    it('should sign and verify valid JWT token payload', () => {
      const payload = {
        id: 'usr-12345',
        username: 'kasir_outlet1',
        role: 'KASIR',
        outletId: 'out-001',
        tenantId: 'tenant-abc',
      };

      const token = jwt.sign(payload, secret, { expiresIn: '1h' });
      expect(token).toBeDefined();

      const decoded = jwt.verify(token, secret) as any;
      expect(decoded.id).toBe(payload.id);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.outletId).toBe(payload.outletId);
      expect(decoded.tenantId).toBe(payload.tenantId);
    });

    it('should reject token signed with incorrect secret', () => {
      const token = jwt.sign({ id: 'u1' }, 'wrong-secret');

      expect(() => {
        jwt.verify(token, secret);
      }).toThrow();
    });

    it('should detect expired token', () => {
      const token = jwt.sign({ id: 'u1' }, secret, { expiresIn: '-1s' });

      expect(() => {
        jwt.verify(token, secret);
      }).toThrow(/jwt expired/);
    });
  });
});
