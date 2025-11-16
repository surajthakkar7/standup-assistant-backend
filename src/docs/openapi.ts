// src/docs/openapi.ts
export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Standup Assistant API",
    version: "1.0.0",
    description: "Daily standup backend with teams, auth, and standups (with soft/hard delete).",
  },
  servers: [{ url: "http://localhost:4000" }],
  tags: [
    { name: "Health" }, { name: "Auth" }, { name: "Teams" }, { name: "Standups" }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
    },
    schemas: {
      UserPublic: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string", format: "email" }
        }
      },
      Team: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          code: { type: "string" },
          members: { type: "array", items: { type: "string" } }
        }
      },
      Standup: {
        type: "object",
        properties: {
          _id: { type: "string" },
          userId: { type: "string" },
          teamId: { type: "string" },
          date: { type: "string", example: "2025-11-08" },
          yesterday: { type: "string" },
          today: { type: "string" },
          blockers: { type: "string" },
          // soft delete metadata:
          isDeleted: { type: "boolean", example: false },
          deletedAt: { type: "string", format: "date-time", nullable: true },
          deletedBy: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AuthRegisterRequest: {
        type: "object",
        required: ["name","email","password"],
        properties: {
          name: { type: "string" },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6 }
        }
      },
      AuthLoginRequest: {
        type: "object",
        required: ["email","password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6 }
        }
      },
      AuthResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: { $ref: "#/components/schemas/UserPublic" }
        }
      },
      TeamCreateRequest: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } }
      },
      TeamJoinRequest: {
        type: "object",
        required: ["code"],
        properties: { code: { type: "string" } }
      },
      StandupCreateRequest: {
        type: "object",
        required: ["teamId","yesterday","today"],
        properties: {
          teamId: { type: "string" },
          yesterday: { type: "string" },
          today: { type: "string" },
          blockers: { type: "string" }
        }
      },
      StandupUpdateRequest: {
        type: "object",
        properties: {
          yesterday: { type: "string" },
          today: { type: "string" },
          blockers: { type: "string" }
        }
      }
    }
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", properties: { ok: { type: "boolean" } } }
              }
            }
          }
        }
      }
    },

    // ---------- Auth ----------
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AuthRegisterRequest" } } }
        },
        responses: {
          201: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
          409: { description: "Email in use" }
        }
      }
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AuthLoginRequest" } } }
        },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
          401: { description: "Invalid credentials" }
        }
      }
    },

    // ---------- Teams ----------
    "/api/teams": {
      post: {
        tags: ["Teams"],
        summary: "Create team",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TeamCreateRequest" } } } },
        responses: {
          201: {
            description: "Created",
            content: { "application/json": { schema: { type: "object", properties: { team: { $ref: "#/components/schemas/Team" } } } } }
          }
        }
      }
    },
    "/api/teams/join": {
      post: {
        tags: ["Teams"],
        summary: "Join team by code",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TeamJoinRequest" } } } },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { team: { $ref: "#/components/schemas/Team" } } } } } },
          404: { description: "Team not found" },
          400: { description: "Team full" }
        }
      }
    },
    "/api/teams/{id}/members": {
      get: {
        tags: ["Teams"],
        summary: "List team members",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", properties: { members: { type: "array", items: { $ref: "#/components/schemas/UserPublic" } } } }
              }
            }
          },
          404: { description: "Not found" }
        }
      }
    },

    // ---------- Standups ----------
    "/api/standups": {
      post: {
        tags: ["Standups"],
        summary: "Create today's standup",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/StandupCreateRequest" } } } },
        responses: {
          201: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Standup" } } } },
          409: { description: "Already submitted today" }
        }
      }
    },
    "/api/standups/me": {
      get: {
        tags: ["Standups"],
        summary: "Get my standups",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "from", in: "query", schema: { type: "string", example: "2025-11-01" } },
          { name: "to", in: "query", schema: { type: "string", example: "2025-11-14" } },
          { name: "teamId", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "includeDeleted", in: "query", schema: { type: "boolean" }, description: "Include soft-deleted standups (optional)" }
        ],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Standup" } } } } }
        }
      }
    },
    "/api/standups/team/{teamId}": {
      get: {
        tags: ["Standups"],
        summary: "Get team standups by date",
        description: "Admins can include deleted items using includeDeleted=true.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "teamId", in: "path", required: true, schema: { type: "string" } },
          { name: "date", in: "query", schema: { type: "string", example: "2025-11-08" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200 } },
          { name: "includeDeleted", in: "query", schema: { type: "boolean" }, description: "Admins only" }
        ],
        responses: { 200: { description: "OK" } }
      }
    },
    "/api/standups/{id}": {
      get: {
        tags: ["Standups"],
        summary: "Get standup by id",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Standup" } } } },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      },
      patch: {
        tags: ["Standups"],
        summary: "Update today’s standup",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/StandupUpdateRequest" } } } },
        responses: {
          200: { description: "OK" },
          400: { description: "Only today allowed or already deleted" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      },
      delete: {
        tags: ["Standups"],
        summary: "Soft delete today’s standup (author or admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Soft-deleted" },
          400: { description: "Only today allowed" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      }
    },
    "/api/standups/{id}/restore": {
      post: {
        tags: ["Standups"],
        summary: "Restore a soft-deleted standup (author or admin; today only)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Restored" },
          400: { description: "Only today allowed or not deleted" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      }
    },
    "/api/standups/{id}/hard": {
      delete: {
        tags: ["Standups"],
        summary: "Hard delete standup (admin only; today only)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Hard-deleted" },
          400: { description: "Only today allowed" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      }
    }
  }
} as const;
