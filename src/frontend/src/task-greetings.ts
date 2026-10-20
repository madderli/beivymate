/** Friendly copy rotates by the user's local calendar day, never by API refresh. */
const periods = [
  {
    until: 420,
    name: "凌晨好",
    messages: [
      "这个时刻也别忘了照顾自己，有需要我们慢慢来。",
      "四下安静，适合把思路理一理，按自己的节奏来就好。",
      "如果还有想推进的事，我在这里陪你一起梳理。",
      "先把重要的事情记下来，也给自己留一点休息的时间。",
    ],
  },
  {
    until: 690,
    name: "早上好",
    messages: [
      "新的一天，先挑一件最想推进的事吧。",
      "很高兴又见到你，我们一起把今天的工作安排得清楚一点。",
      "给今天一个从容的开始，一件一件来就好。",
      "新的开始不必着急，我陪你先理清今天的重点。",
    ],
  },
  {
    until: 780,
    name: "中午好",
    messages: [
      "到了午间，给自己一点喘息的时间，工作可以从容安排。",
      "先照顾好自己，我们再一起梳理接下来的事情。",
      "趁这个间隙整理一下思路，让接下来的工作更轻松。",
      "忙碌之余也记得好好吃饭，接下来的事我们一起安排。",
    ],
  },
  {
    until: 1080,
    name: "下午好",
    messages: [
      "让我们找回节奏，一件一件把事情做好。",
      "不妨先选一个小目标，给下午一点顺畅的开始。",
      "工作不必一口气完成，我们把注意力放在下一步。",
      "继续按自己的节奏推进，有需要我会陪你一起梳理。",
    ],
  },
  {
    until: 1440,
    name: "晚上好",
    messages: [
      "让我们把接下来的工作安排得轻松一些。",
      "夜色渐深，不妨先理清重点，把节奏放稳一些。",
      "辛苦啦，我们一起看看接下来最需要关注的事情。",
      "给一天留一点收尾的时间，也给自己留一点放松的空间。",
    ],
  },
];
const clearMessages = [
  "当前没有未完成任务，可以从容安排接下来的时间。",
  "太棒了，目前没有遗留任务，给自己一点轻松的时间吧。",
  "待办已经清空，接下来可以开始新的目标，也可以歇一歇。",
  "现在没有需要继续处理的任务，按自己的心意安排接下来吧。",
];

export function taskGreetingFor(date: Date) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const period = periods.find((p) => minutes < p.until)!;
  const day = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000,
  );
  const index = day % period.messages.length;
  return {
    opening: `${period.name}！${period.messages[index]}`,
    empty: clearMessages[index],
  };
}
