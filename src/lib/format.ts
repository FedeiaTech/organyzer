export const formatDateTime = (lang: string, date: Date | number) =>
  new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
