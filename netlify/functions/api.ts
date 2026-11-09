import type { Handler, HandlerResponse } from "@netlify/functions";
import serverless from "serverless-http";
import { app, ensureDatabaseInitialized } from "../../dist/server/src/index.js";

const expressHandler = serverless(app, {
  basePath: "/.netlify/functions/api",
});

export const handler: Handler = async (event, context) => {
  await ensureDatabaseInitialized();
  return await expressHandler(event, context) as HandlerResponse;
};
