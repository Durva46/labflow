import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validateBody } from '../../middleware/validate';
import { loginLimiter } from '../../middleware/rateLimit';
import { csrfProtection, getCsrfToken } from '../../middleware/csrf';
import { createSession, clearSessionCookies, requireAuth, setSessionCookies } from '../../middleware/auth';
import { authenticate, changePassword, destroySession, meResponse } from './service';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

router.get('/csrf', csrfProtection, getCsrfToken);

router.post(
  '/login',
  loginLimiter,
  csrfProtection,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await authenticate(email, password, {
      ip: req.ip,
      requestId: req.requestId,
      userAgent: req.get('user-agent'),
    });
    const session = await createSession(user.id, req);
    setSessionCookies(res, session);
    res.json({ data: meResponse({ ...user }) });
  }),
);

router.post(
  '/logout',
  csrfProtection,
  asyncHandler(async (req, res) => {
    await destroySession(req.authSessionId, req);
    clearSessionCookies(res);
    res.status(204).send();
  }),
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ data: meResponse(req.user!) });
});

router.post(
  '/change-password',
  requireAuth,
  csrfProtection,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    await changePassword(req.user!, currentPassword, newPassword, {
      requestId: req.requestId,
      ip: req.ip,
      sessionId: req.authSessionId,
    });
    res.status(204).send();
  }),
);

export default router;
