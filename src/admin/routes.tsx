import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { authMiddleware, adminMiddleware } from "../auth/middleware";
import {
  listAllMembers,
  setMemberRole,
  countAdminsExcluding,
  findMemberById,
} from "../members/service";
import {
  AdminMembersPage,
  AdminMembersList,
} from "../views/pages/admin-members.tsx";

const adminRoutes = new Hono();

adminRoutes.use("/admin/*", authMiddleware);
adminRoutes.use("/admin/*", adminMiddleware);

function getLocale(c: { req: { raw: Request } }): string {
  const cookie = getCookie(c as any, "locale");
  return cookie === "ja" ? "ja" : "en";
}

adminRoutes.get("/admin/members", async (c) => {
  const { sub: memberId, name: displayName } = c.get("jwtPayload");
  const locale = getLocale(c);
  const members = await listAllMembers();
  return c.html(
    <AdminMembersPage
      members={members}
      currentMemberId={memberId}
      displayName={displayName}
      locale={locale}
    />,
  );
});

adminRoutes.post("/admin/members/:id/promote", async (c) => {
  const targetId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");
  const locale = getLocale(c);

  const target = await findMemberById(targetId);
  if (!target) return c.text("Not found", 404);

  await setMemberRole(targetId, "admin");

  const members = await listAllMembers();
  return c.html(
    <AdminMembersList
      members={members}
      currentMemberId={memberId}
      locale={locale}
    />,
  );
});

adminRoutes.post("/admin/members/:id/demote", async (c) => {
  const targetId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");
  const locale = getLocale(c);

  const target = await findMemberById(targetId);
  if (!target) return c.text("Not found", 404);

  // Ensure at least one admin remains after the demotion. This also
  // protects the lone admin from removing themselves.
  const remaining = await countAdminsExcluding(targetId);
  if (remaining < 1) {
    return c.text("At least one admin must remain", 400);
  }

  await setMemberRole(targetId, "user");

  const members = await listAllMembers();
  return c.html(
    <AdminMembersList
      members={members}
      currentMemberId={memberId}
      locale={locale}
    />,
  );
});

export default adminRoutes;
