// Online = renovou o "visto_em" há menos de 30 s (os ESPs e os brokers renovam a cada 10 s).
export const ONLINE_MS = 30000;
export const estaOnline = (item, agora) =>
  !!item && item.ativo !== false && typeof item.visto_em === "number" && agora - item.visto_em < ONLINE_MS;
