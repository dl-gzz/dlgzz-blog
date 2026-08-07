import { CoursewareBackendClient } from '@/components/courseware/CoursewareBackendClient';
import { routing } from '@/i18n/routing';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import type { Locale } from 'next-intl';
import { notFound, redirect } from 'next/navigation';

export default async function TeacherCoursewarePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const session = await getSession();
  const { locale } = await params;

  if (!session?.user?.id) {
    redirect(
      locale === routing.defaultLocale ? '/auth/login' : `/${locale}/auth/login`
    );
  }

  if (!canAccessHermesAdmin(session.user)) {
    notFound();
  }

  return <CoursewareBackendClient />;
}
