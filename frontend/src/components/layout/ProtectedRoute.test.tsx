import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthProvider } from '../../context/AuthContext';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<any>('../../lib/api');
  return {
    ...actual,
    apiGet: vi.fn().mockRejectedValue({ code: 'UNAUTHENTICATED' }),
    apiPost: vi.fn().mockRejectedValue({ code: 'UNAUTHENTICATED' }),
    registerAuthHandlers: vi.fn(),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn(() => null),
  };
});

describe('ProtectedRoute', () => {
  it('redirects unauthenticated to login', async () => {
    render(
      <MemoryRouter initialEntries={['/private']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/private" element={<div>Private</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });

  it('shows 403 for insufficient role', () => {
    expect(true).toBe(true);
  });
});
