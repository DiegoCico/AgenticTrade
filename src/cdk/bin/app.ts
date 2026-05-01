import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { resolveStage } from "../stage";

import { ApiStack } from "../lib/api-stack";
import { WebStack } from "../lib/web-stack";
import { DynamoStack } from "../lib/dynamo-stack";
import { AlpacaSecretsStack } from "../lib/alpaca-secrets-stack";
import { LlmSecretsStack } from "../lib/llm-secrets-stack";
import { DnsStack } from "../lib/dns-stack";

const app = new cdk.App();

// Stage config (prod | beta)
const cfg = resolveStage(app) as {
  name: string;
  nodeEnv?: string;
  lambda?: { memorySize?: number; timeoutSeconds?: number };
  tags?: Record<string, string>;
};

const account =
  process.env.CDK_DEFAULT_ACCOUNT ??
  process.env.AWS_ACCOUNT_ID ??
  "739275464934";

const region =
  process.env.CDK_DEFAULT_REGION ??
  process.env.AWS_REGION ??
  "us-east-1";

console.log(
  `[App] stage=${cfg.name} account=${account} region=${region}`
);

// ---------------- DynamoDB ----------------
const dynamo = new DynamoStack(app, `AgentictradeDynamo-${cfg.name}`, {
  env: { account, region },
  stage: cfg.name,
  serviceName: "agentictrade",
});

// ---------------- ALPACA SECRETS ----------------
const alpacaSecrets = new AlpacaSecretsStack(app, `AgentictradeAlpacaSecrets-${cfg.name}`, {
  env: { account, region },
  stage: cfg.name,
  serviceName: "agentictrade-api",
});

// ---------------- LLM SECRETS ----------------
const llmSecrets = new LlmSecretsStack(app, `AgentictradeLlmSecrets-${cfg.name}`, {
  env: { account, region },
  stage: cfg.name,
  serviceName: "agentictrade-api",
});

// ---------------- API STACK ----------------
const api = new ApiStack(app, `AgentictradeApi-${cfg.name}`, {
  env: { account, region },
  serviceName: "agentictrade-api",

  stage: {
    name: cfg.name,
    nodeEnv:
      cfg.nodeEnv ??
      (cfg.name === "prod" ? "production" : "development"),
    lambda: {
      memorySize: cfg.lambda?.memorySize ?? 512,
      timeout: cdk.Duration.seconds(
        cfg.lambda?.timeoutSeconds ?? 20
      ),
    },
    cors: {
      allowCredentials: true,
      allowHeaders: ["content-type", "authorization", "x-requested-with"],
      allowMethods: [
        apigwv2.CorsHttpMethod.GET,
        apigwv2.CorsHttpMethod.POST,
        apigwv2.CorsHttpMethod.PUT,
        apigwv2.CorsHttpMethod.PATCH,
        apigwv2.CorsHttpMethod.DELETE,
        apigwv2.CorsHttpMethod.OPTIONS,
      ],
      allowOrigins: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
      ],
      maxAge: cdk.Duration.hours(12),
    },
  },

  ddbTable: dynamo.table,
  alpacaSecret: alpacaSecrets.alpacaSecret,
  llmSecret: llmSecrets.llmSecret,
});

// ---------------- WEB STACK ----------------
const apiEndpoint = api.httpApi.apiEndpoint;
const apiDomainName = cdk.Fn.select(
  2,
  cdk.Fn.split("/", apiEndpoint)
);

const domainName = "agentictrade.online";

const dns = new DnsStack(app, `AgentictradeDns-${cfg.name}`, {
  env: { account, region: "us-east-1" },
  domainName,
});

const web = new WebStack(app, `AgentictradeWeb-${cfg.name}`, {
  env: { account, region },
  stage: { name: cfg.name },
  serviceName: "agentictrade-web",
  frontendBuildPath: "../../frontend/dist",
  apiDomainName,
  apiPaths: ["/trpc/*", "/health", "/hello"],

  domainName,
  hostedZone: dns.zone,
  certificate: dns.webCert,
});

web.addDependency(dns);

// ---------------- TAGGING ----------------
if (cfg.tags) {
  [dynamo, api, web, alpacaSecrets, llmSecrets, dns].forEach((stack) => {
    Object.entries(cfg.tags!).forEach(([k, v]) => {
      cdk.Tags.of(stack).add(k, v);
    });
  });
}
