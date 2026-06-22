import { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "./auth.service";

const SmsSendBody = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "无效的手机号"),
});

const RegisterBody = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "无效的手机号"),
  smsCode: z.string().length(6, "验证码为6位数字"),
  displayName: z.string().max(32).optional(),
});

const LoginBody = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "无效的手机号"),
  smsCode: z.string().length(6).optional(),
  password: z.string().min(6).optional(),
});

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService) {
  // Send SMS verification code
  app.post("/api/auth/sms/send", async (request) => {
    const body = SmsSendBody.parse(request.body);
    const result = auth.sendSms(body.phone);
    // Only return mockCode in development/test
    const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    return {
      success: result.success,
      ...(result.mockCode && isDev ? { mockCode: result.mockCode } : {}),
    };
  });

  // Register with phone + SMS code
  app.post("/api/auth/register", async (request, reply) => {
    const body = RegisterBody.parse(request.body);
    const { user, tokens } = await auth.register(body);
    return reply.code(201).send({
      user: { id: user.id, phone: user.phone, displayName: user.displayName },
      tokens,
    });
  });

  // Login with phone + SMS code or phone + password
  app.post("/api/auth/login", async (request, reply) => {
    const body = LoginBody.parse(request.body);
    if (!body.smsCode && !body.password) {
      return reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "请提供验证码或密码" },
      });
    }
    const { user, tokens } = await auth.login(body);
    return {
      user: { id: user.id, phone: user.phone, displayName: user.displayName },
      tokens,
    };
  });

  // Logout
  app.post("/api/auth/logout", async (request) => {
    const header = request.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      await auth.logout(header.slice(7));
    }
    return { ok: true };
  });

  // Get current session
  app.get("/api/auth/session", async (request, reply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "未登录" } });
    }
    const session = auth.validateSession(header.slice(7));
    return session;
  });
}
