export function buildServiceInstallApiPath(locale: string, slug: string) {
  const params = new URLSearchParams({
    locale,
    slug,
  });

  return `/api/services/install?${params.toString()}`;
}

export function buildWhiteboardInstallUrl(locale: string, slug: string) {
  const params = new URLSearchParams({
    manifest_url: buildServiceInstallApiPath(locale, slug),
  });

  return `/${locale}/whiteboard?${params.toString()}`;
}
