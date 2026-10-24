import type { Role } from './permissions';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      authSessionId?: string;
      requestId: string;
    }
  }
}

export {};
