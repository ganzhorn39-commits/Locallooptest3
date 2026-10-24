type T = (k: string) => string;

// "Anna ist dabei" / "Anna und Ben sind dabei" / "Anna und 3 weitere, denen du folgst, sind dabei"
export function friendsGoingText(names: string[], total: number, t: T): string {
  const n = names.filter(Boolean);
  if (!total || !n.length) return "";
  if (total === 1) return t("friends_going_one").replace("{a}", n[0]);
  if (total === 2 && n.length >= 2) return t("friends_going_two").replace("{a}", n[0]).replace("{b}", n[1]);
  return t("friends_going_more").replace("{a}", n[0]).replace("{n}", String(total - 1));
}
