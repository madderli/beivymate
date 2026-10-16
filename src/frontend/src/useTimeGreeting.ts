import { useEffect, useState } from "react";

export function useTimeGreeting() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = setInterval(() => setHour(new Date().getHours()), 60000);
    return () => clearInterval(timer);
  }, []);
  return hour >= 5 && hour < 12
    ? ["Good morning", "早上好"]
    : hour >= 12 && hour < 18
      ? ["Good afternoon", "下午好"]
      : ["Good evening", "晚上好"];
}
