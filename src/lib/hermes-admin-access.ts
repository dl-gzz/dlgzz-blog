import 'server-only';

interface AdminUser {
  email?: string | null;
  role?: string | null;
}

export function canAccessHermesAdmin(user?: AdminUser | null) {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const email = user.email?.trim().toLowerCase();
  if (!email) return false;

  return getHermesAdminEmails().has(email);
}

function getHermesAdminEmails() {
  return new Set(
    (process.env.HERMES_ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}
