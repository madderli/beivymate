import { taskGreetingFor } from "./task-greetings";
import { useEffect, useState } from "react";

function useLocalMinutes() {
  const read = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  const [minutes, setMinutes] = useState(read);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      setMinutes(read());
      timer = setTimeout(update, 60000 - (Date.now() % 60000));
    };
    update();
    return () => clearTimeout(timer);
  }, []);
  return minutes;
}

export function useTimeGreeting() {
  const minutes = useLocalMinutes();
  return minutes >= 300 && minutes < 720
    ? ["Good morning", "早上好"]
    : minutes >= 720 && minutes < 1080
      ? ["Good afternoon", "下午好"]
      : ["Good evening", "晚上好"];
}

export function useWorkspaceGreeting() {
  const minutes = useLocalMinutes();
  if (minutes < 420)
    return "凌晨好！这个时刻也别忘了照顾自己，我们按自己的节奏推进。";
  if (minutes < 690) return "早上好！新的一天，我们从最需要关注的工作开始。";
  if (minutes < 780)
    return "中午好！忙碌之余也记得休息，我们一起梳理接下来的工作。";
  if (minutes < 1080) return "下午好！继续稳稳推进，把今天的目标一点点完成。";
  return "晚上好！辛苦了一天，我们把接下来的工作有序安排好。";
}

export function useTaskGreeting() {
  useLocalMinutes();
  return taskGreetingFor(new Date());
}
