export function isPastCalendarDate(timestamp: number): boolean {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

export function getDisabledScheduleTimes(timestamp: number) {
  const selectedDate = new Date(timestamp);
  const now = new Date();
  const isToday =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getDate() === now.getDate();

  if (!isToday) return {};

  return {
    isHourDisabled: (hour: number) => hour < now.getHours(),
    isMinuteDisabled: (minute: number, hour: number | null) =>
      hour === null ||
      hour < now.getHours() ||
      (hour === now.getHours() && minute <= now.getMinutes()),
  };
}
