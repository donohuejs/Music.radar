export function getDateRange(option, customStart, customEnd) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (option === "custom") {
    const customStartDate = new Date(`${customStart}T00:00:00`);
    const customEndDate = new Date(`${customEnd}T23:59:59.999`);
    if (
      !customStart ||
      !customEnd ||
      Number.isNaN(customStartDate.getTime()) ||
      Number.isNaN(customEndDate.getTime()) ||
      customEndDate < customStartDate
    ) {
      throw new Error("Choose a valid custom date range.");
    }
    return {
      startDate: customStartDate.toISOString(),
      endDate: customEndDate.toISOString(),
    };
  } else if (option === "tonight") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (option === "tomorrow") {
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(23, 59, 59, 999);
  } else if (option === "weekend") {
    const day = now.getDay();
    const daysUntilFriday = (5 - day + 7) % 7;
    start.setDate(now.getDate() + daysUntilFriday);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 2);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}
