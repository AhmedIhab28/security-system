type AlertHandler = (payload: Record<string, unknown>) => void;

let socket: WebSocket | null = null;
const handlers: Set<AlertHandler> = new Set();

export function connectAlerts(onAlert: AlertHandler) {
  handlers.add(onAlert);

  if (socket && socket.readyState === WebSocket.OPEN) return;

  const token = localStorage.getItem("token");
  if (!token) return;

  const wsBase = (import.meta.env.VITE_API_URL || "http://localhost:8000")
    .replace("http", "ws");

  socket = new WebSocket(`${wsBase}/ws/alerts?token=${token}`);

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handlers.forEach((h) => h(data));
    } catch {}
  };

  socket.onclose = () => {
    // Reconnect after 3 seconds
    setTimeout(() => connectAlerts(() => {}), 3000);
  };
}

export function disconnectAlerts(handler: AlertHandler) {
  handlers.delete(handler);
  if (handlers.size === 0 && socket) {
    socket.close();
    socket = null;
  }
}
