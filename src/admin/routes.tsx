import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { authMiddleware, adminMiddleware } from "../auth/middleware";
import { listAllUsers, setUserRole, countAdminsExcluding, findUserById } from "../users/service";
import { AdminUsersPage, AdminUsersList } from "../views/pages/admin-users.tsx";

const adminRoutes = new Hono();

adminRoutes.use("/admin/*", authMiddleware);
adminRoutes.use("/admin/*", adminMiddleware);

function getLocale(c: { req: { raw: Request } }): string {
  const cookie = getCookie(c as any, "locale");
  return cookie === "ja" ? "ja" : "en";
}

function getTheme(c: { req: { raw: Request } }): string {
  const cookie = getCookie(c as any, "theme");
  return cookie === "light" ? "light" : "dark";
}

adminRoutes.get("/admin/users", async (c) => {
  const { sub: userId, name: displayName } = c.get("jwtPayload");
  const locale = getLocale(c);
  const theme = getTheme(c);
  const users = await listAllUsers();
  return c.html(
    <AdminUsersPage
      users={users}
      currentUserId={userId}
      displayName={displayName}
      locale={locale}
      theme={theme}
    />,
  );
});

adminRoutes.post("/admin/users/:id/promote", async (c) => {
  const targetId = c.req.param("id");
  const { sub: userId } = c.get("jwtPayload");
  const locale = getLocale(c);

  const target = await findUserById(targetId);
  if (!target) return c.text("Not found", 404);

  await setUserRole(targetId, "admin");

  const users = await listAllUsers();
  return c.html(<AdminUsersList users={users} currentUserId={userId} locale={locale} />);
});

adminRoutes.post("/admin/users/:id/demote", async (c) => {
  const targetId = c.req.param("id");
  const { sub: userId } = c.get("jwtPayload");
  const locale = getLocale(c);

  const target = await findUserById(targetId);
  if (!target) return c.text("Not found", 404);

  // Ensure at least one admin remains after the demotion. This also
  // protects the lone admin from removing themselves.
  const remaining = await countAdminsExcluding(targetId);
  if (remaining < 1) {
    return c.text("At least one admin must remain", 400);
  }

  await setUserRole(targetId, "user");

  const users = await listAllUsers();
  return c.html(<AdminUsersList users={users} currentUserId={userId} locale={locale} />);
});

export default adminRoutes;
