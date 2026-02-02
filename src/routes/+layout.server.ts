// src/routes/+layout.server.ts
export const load = async ({ locals }: { locals: App.Locals }) => {
  return { user: locals.user };
};
