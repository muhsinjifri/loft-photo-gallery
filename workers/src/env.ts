export interface Env {
  ENV: "dev" | "prod";
  ALLOWED_EMAIL: string;
  BUCKET: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;
}

export type AppVariables = {
  userEmail: string;
};
