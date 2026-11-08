/** The QR menu of one bar (and zone), as its QR code opens it. */
export function menuHref(
  locale: string,
  menu: { venueSlug: string; barId: string; zoneId?: string },
) {
  const query = new URLSearchParams({
    bar: menu.barId,
    ...(menu.zoneId ? { zone: menu.zoneId } : {}),
  });
  return `/${locale}/v/${encodeURIComponent(menu.venueSlug)}?${query}`;
}
