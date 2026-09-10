export type Message = {
  role: "user" | "assistant";
  content: string;
  json?: any; // ★ structured output 用
};
