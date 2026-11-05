const settings = { timeZone: "Asia/Shanghai" };
export function todayKey(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: settings.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    return ["year", "month", "day"]
        .map((key) => parts.find((part) => part.type === key)!.value)
        .join("-");
}

export function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function fromDateKey(value: string): Date {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
}

export function formatDate(value: string): string {
    return new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "long",
    }).format(fromDateKey(value));
}
