import { UsersPageClient } from '@/components/admin/users-page';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { notFound } from 'next/navigation';

/**
 * Users page
 *
 * This page is used to manage users for the admin,
 * it is protected and only accessible to the admin role
 */
export default async function UsersPage() {
  if (!canAccessHermesAdmin((await getSession())?.user)) notFound();
  return <UsersPageClient />;
}
