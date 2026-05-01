import { App } from "aws-cdk-lib";

export interface StageConfig {
  name: string;                    // prod | beta | dev
  nodeEnv: string;                 // production | development
  lambda: {
    memorySize: number;
    timeoutSeconds: number;
  };
  tags?: Record<string, string>;
}

/**
 * Reads stage from:
 *   1) CDK context: -c stage=prod
 *   2) ENV: STAGE=prod
 * Defaults to "dev".
 */
export function resolveStage(app: App): StageConfig {
  const ctxStage = app.node.tryGetContext("stage");
  const envStage = process.env.STAGE;
  const stage = (ctxStage ?? envStage ?? "dev").toLowerCase();

  const isProd = stage === "prod";
  const isBeta = stage === "beta";

  return {
    name: stage,

    nodeEnv: isProd ? "production" : "development",

    lambda: {
      memorySize: isProd ? 1024 : 512,
      timeoutSeconds: isProd ? 30 : 20,
    },

    tags: {
      project: "agentictrade",
      stage,
    },
  };
}
