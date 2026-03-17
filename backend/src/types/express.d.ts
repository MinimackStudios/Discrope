declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        status: "ONLINE" | "IDLE" | "DND" | "INVISIBLE";
      };
    }
  }
}

export {};
