export const colors = {
  bg: "#0b1020",
  panel: "#151b2e",
  border: "#28304d",
  text: "#e6e9f2",
  muted: "#8b93ad",
  brand: "#4f7cff",
  green: "#2bb673",
  amber: "#e0a325",
  red: "#e0524d",
};

export const statusColor: Record<string, string> = {
  REQUESTED: colors.amber,
  ASSIGNED: colors.brand,
  EN_ROUTE: colors.brand,
  IN_PROGRESS: colors.brand,
  COMPLETED: colors.green,
  CANCELLED: colors.muted,
};
