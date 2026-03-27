import { Router, Request, Response } from "express";
import AgentExecuteLogsAPI from "../../routes/agent-execute-logs.api";
import { IExecutionLog } from "../../interface/IExecutionLog.interface";
import { executionLogStore } from "../../services/execution-log-store.service";

describe("AgentExecuteLogsAPI", () => {
  let router: Router;
  let postHandler: (req: Request, res: Response) => void;
  let getHandler: (req: Request, res: Response) => void;

  beforeEach(() => {
    executionLogStore.clear();
    router = {
      post: jest.fn((path, handler) => {
        if (path === "/agent/execute/logs") {
          postHandler = handler;
        }
      }),
      get: jest.fn((path, handler) => {
        if (path === "/agent/execute/:execId") {
          getHandler = handler;
        }
      }),
    } as unknown as Router;

    new AgentExecuteLogsAPI(router);
  });

  describe("POST /agent/execute/logs", () => {
    test("rejects payload without execId", () => {
      const req = {
        body: {
          entries: [
            { ts: "2024-01-01T10:00:00Z", level: "info", message: "test" },
          ],
        },
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      postHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Payload invalido" });
    });

    test("rejects payload without entries", () => {
      const req = {
        body: {
          execId: "test-123",
          ok: true,
        },
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      postHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Payload invalido" });
    });

    test("rejects payload with empty entries", () => {
      const req = {
        body: {
          execId: "test-123",
          ok: true,
          entries: [],
        },
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      postHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Payload invalido" });
    });

    test("rejects entries without timestamp", () => {
      const req = {
        body: {
          execId: "test-123",
          ok: true,
          entries: [{ level: "info", message: "sem timestamp" }],
        },
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      postHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Entries invalidas" });
    });

    test("accepts valid payload", () => {
      const req = {
        body: {
          execId: "test-valid-001",
          ok: true,
          entries: [
            {
              ts: "2024-01-01T10:00:00Z",
              level: "info",
              message: "Log valido",
              status: "RUNNING",
            },
          ],
        } as IExecutionLog,
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;

      postHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    test("stores multiple logs for the same execId", () => {
      const req1 = {
        body: {
          execId: "test-multi-001",
          ok: true,
          entries: [
            {
              ts: "2024-01-01T10:00:00Z",
              level: "info",
              message: "Primeiro log",
            },
          ],
        } as IExecutionLog,
      } as Request;

      const req2 = {
        body: {
          execId: "test-multi-001",
          ok: true,
          entries: [
            {
              ts: "2024-01-01T10:01:00Z",
              level: "info",
              message: "Segundo log",
            },
          ],
        } as IExecutionLog,
      } as Request;

      const res1 = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;

      const res2 = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;

      postHandler(req1, res1);
      postHandler(req2, res2);

      expect(res1.status).toHaveBeenCalledWith(204);
      expect(res2.status).toHaveBeenCalledWith(204);
    });

    test("updates ok field", () => {
      const req1 = {
        body: {
          execId: "test-ok-update",
          ok: true,
          entries: [
            { ts: "2024-01-01T10:00:00Z", level: "info", message: "ok true" },
          ],
        } as IExecutionLog,
      } as Request;

      const req2 = {
        body: {
          execId: "test-ok-update",
          ok: false,
          entries: [
            { ts: "2024-01-01T10:01:00Z", level: "error", message: "ok false" },
          ],
        } as IExecutionLog,
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;

      postHandler(req1, res);
      postHandler(req2, res);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    test("shares the same store used by agent callback flow", () => {
      executionLogStore.append({
        execId: "test-shared-store",
        ok: true,
        entries: [
          {
            ts: "2024-01-01T10:00:00Z",
            level: "info",
            message: "Persistido pelo service",
            status: "RUNNING",
          },
        ],
      });

      const getReq = {
        params: { execId: "test-shared-store" },
      } as unknown as Request;

      const getRes = {
        json: jest.fn(),
      } as unknown as Response;

      getHandler(getReq, getRes);

      expect(getRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          execId: "test-shared-store",
          count: 1,
          status: "RUNNING",
        }),
      );
    });
  });

  describe("GET /agent/execute/:execId", () => {
    test("returns 404 for unknown execId", () => {
      const req = {
        params: { execId: "nao-existe" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      getHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "execId nao encontrado" });
    });

    test("returns logs for a valid execId", () => {
      const postReq = {
        body: {
          execId: "test-get-001",
          ok: true,
          entries: [
            {
              ts: "2024-01-01T10:00:00Z",
              level: "info",
              message: "Test log",
              status: "RUNNING",
            },
          ],
        } as IExecutionLog,
      } as Request;

      const postRes = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;

      postHandler(postReq, postRes);

      const getReq = {
        params: { execId: "test-get-001" },
      } as unknown as Request;

      const getRes = {
        json: jest.fn(),
      } as unknown as Response;

      getHandler(getReq, getRes);

      expect(getRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          execId: "test-get-001",
          status: "RUNNING",
          count: 1,
          entries: expect.any(Array),
        }),
      );
    });

    test("defaults status to RUNNING when none is present", () => {
      const postReq = {
        body: {
          execId: "test-default-status",
          ok: true,
          entries: [
            {
              ts: "2024-01-01T10:00:00Z",
              level: "info",
              message: "Sem status",
            },
          ],
        } as IExecutionLog,
      } as Request;

      const postRes = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;

      postHandler(postReq, postRes);

      const getReq = {
        params: { execId: "test-default-status" },
      } as unknown as Request;

      const getRes = {
        json: jest.fn(),
      } as unknown as Response;

      getHandler(getReq, getRes);

      expect(getRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "RUNNING",
        }),
      );
    });

    test("returns the latest valid status", () => {
      const postReq = {
        body: {
          execId: "test-last-status",
          ok: true,
          entries: [
            {
              ts: "2024-01-01T10:00:00Z",
              status: "RUNNING",
              level: "info",
              message: "1",
            },
            {
              ts: "2024-01-01T10:01:00Z",
              status: "PENDING",
              level: "info",
              message: "2",
            },
            {
              ts: "2024-01-01T10:02:00Z",
              status: "DONE",
              level: "info",
              message: "3",
            },
          ],
        } as IExecutionLog,
      } as Request;

      const postRes = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;

      postHandler(postReq, postRes);

      const getReq = {
        params: { execId: "test-last-status" },
      } as unknown as Request;

      const getRes = {
        json: jest.fn(),
      } as unknown as Response;

      getHandler(getReq, getRes);

      expect(getRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "DONE",
        }),
      );
    });

    test("formats entries correctly", () => {
      const postReq = {
        body: {
          execId: "test-format",
          ok: true,
          entries: [
            {
              ts: "2024-01-01T10:00:00Z",
              level: "info",
              message: "Test message",
              status: "RUNNING",
            },
          ],
        } as IExecutionLog,
      } as Request;

      const postRes = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;

      postHandler(postReq, postRes);

      const getReq = {
        params: { execId: "test-format" },
      } as unknown as Request;

      const getRes = {
        json: jest.fn(),
      } as unknown as Response;

      getHandler(getReq, getRes);

      expect(getRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({
              ts: "2024-01-01T10:00:00Z",
              level: "info",
              message: "Test message",
              status: "RUNNING",
              raw: expect.any(String),
            }),
          ]),
        }),
      );
    });

    test("includes entry count", () => {
      const postReq = {
        body: {
          execId: "test-count",
          ok: true,
          entries: [
            { ts: "2024-01-01T10:00:00Z", level: "info", message: "1" },
            { ts: "2024-01-01T10:01:00Z", level: "info", message: "2" },
            { ts: "2024-01-01T10:02:00Z", level: "info", message: "3" },
          ],
        } as IExecutionLog,
      } as Request;

      const postRes = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;

      postHandler(postReq, postRes);

      const getReq = {
        params: { execId: "test-count" },
      } as unknown as Request;

      const getRes = {
        json: jest.fn(),
      } as unknown as Response;

      getHandler(getReq, getRes);

      expect(getRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 3,
        }),
      );
    });
  });
});
