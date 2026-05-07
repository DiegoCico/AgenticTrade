import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";

import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwIntegrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as scheduler from "aws-cdk-lib/aws-scheduler";

import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

type AlpacaAgentId = "conservative" | "neutral" | "aggressive";
type AlpacaAgentSecrets = Record<AlpacaAgentId, secretsmanager.ISecret>;

export interface ApiStackProps extends cdk.StackProps {
  stage: {
    name: string;                    // prod | beta | dev
    nodeEnv: string;
    lambda: { memorySize: number; timeout: cdk.Duration };
    cors: {
      allowCredentials: boolean;
      allowHeaders: string[];
      allowMethods: apigwv2.CorsHttpMethod[];
      allowOrigins: string[];
      maxAge?: cdk.Duration;
    };
  };
  ddbTable: dynamodb.Table;
  serviceName?: string;
  alpacaSecrets: AlpacaAgentSecrets;
  llmSecret: secretsmanager.Secret;
}

export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigwv2.HttpApi;
  public readonly apiFn: lambda.Function;
  public readonly tradingCronFn: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const stage = props.stage;
    const serviceName = props.serviceName ?? "agentictrade-api";

    const alpacaSecrets = props.alpacaSecrets;
    const llmSecret = props.llmSecret;
    const lambdaEnvironment = {
      NODE_OPTIONS: "--enable-source-maps",
      NODE_ENV: stage.nodeEnv,
      STAGE: stage.name,
      SERVICE_NAME: serviceName,
      TABLE_NAME: props.ddbTable.tableName,
      APP_REGION: this.region,
      DYNAMODB_TABLE_NAME: props.ddbTable.tableName,
      ALPACA_SECRET_ARN: alpacaSecrets.neutral.secretArn,
      ALPACA_CONSERVATIVE_SECRET_ARN: alpacaSecrets.conservative.secretArn,
      ALPACA_NEUTRAL_SECRET_ARN: alpacaSecrets.neutral.secretArn,
      ALPACA_AGGRESSIVE_SECRET_ARN: alpacaSecrets.aggressive.secretArn,
      LLM_SECRET_ARN: llmSecret.secretArn,
      DEMO_MODE: stage.name === "dev" ? "true" : "false",
    };

    // ===== Lambda (tRPC Handler) =====
    this.apiFn = new NodejsFunction(this, "TrpcLambda", {
      functionName: `${serviceName}-${stage.name}-trpc`,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.resolve(__dirname, "../../api/src/handler.ts"),
      handler: "handler",
      memorySize: stage.lambda.memorySize,
      timeout: stage.lambda.timeout,

      bundling: {
        target: "node20",
        format: OutputFormat.CJS,
        minify: true,
        sourceMap: true,
        externalModules: ["aws-sdk"],        // only dependency needed
      },

      environment: lambdaEnvironment,

      // ===== 2-Week Log Retention =====
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });

    // ===== Lambda (Scheduled Trading Evaluation) =====
    this.tradingCronFn = new NodejsFunction(this, "TradingCronLambda", {
      functionName: `${serviceName}-${stage.name}-trading-cron`,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.resolve(__dirname, "../../api/src/scheduled-trading.ts"),
      handler: "handler",
      memorySize: stage.lambda.memorySize,
      timeout: stage.lambda.timeout,

      bundling: {
        target: "node20",
        format: OutputFormat.CJS,
        minify: true,
        sourceMap: true,
        externalModules: ["aws-sdk"],
      },

      environment: lambdaEnvironment,
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });

    // ===== DDB Permissions =====
    props.ddbTable.grantReadWriteData(this.apiFn);
    props.ddbTable.grantReadWriteData(this.tradingCronFn);

    // ===== Secrets Manager Permissions =====
    Object.values(alpacaSecrets).forEach((secret) => secret.grantRead(this.apiFn));
    llmSecret.grantRead(this.apiFn);
    Object.values(alpacaSecrets).forEach((secret) => secret.grantRead(this.tradingCronFn));
    llmSecret.grantRead(this.tradingCronFn);

    // ===== Schedule: Monday-Friday, 30 minutes after market open =====
    const schedulerRole = new iam.Role(this, "TradingCronSchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });

    schedulerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [this.tradingCronFn.functionArn],
      })
    );

    new scheduler.CfnSchedule(this, "TradingCronSchedule", {
      name: `${serviceName}-${stage.name}-trading-cron`,
      description: "Runs the AgenticTrade neutral AI evaluation Monday-Friday at 10:00 AM and 3:00 PM America/New_York.",
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: "cron(0 10,15 ? * MON-FRI *)",
      scheduleExpressionTimezone: "America/New_York",
      target: {
        arn: this.tradingCronFn.functionArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({
          source: "agentictrade.scheduler",
          job: "trading-evaluation",
        }),
      },
    });

    new scheduler.CfnSchedule(this, "TradingCronMiddaySchedule", {
      name: `${serviceName}-${stage.name}-trading-cron-midday`,
      description: "Runs the AgenticTrade neutral AI evaluation Monday-Friday at 12:30 PM America/New_York.",
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: "cron(30 12 ? * MON-FRI *)",
      scheduleExpressionTimezone: "America/New_York",
      target: {
        arn: this.tradingCronFn.functionArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({
          source: "agentictrade.scheduler",
          job: "trading-evaluation",
        }),
      },
    });

    // ===== API Gateway (HTTP API v2) =====
    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `${serviceName}-${stage.name}`,
      corsPreflight: {
        allowOrigins: stage.cors.allowOrigins,
        allowHeaders: stage.cors.allowHeaders,
        allowMethods: stage.cors.allowMethods,
        allowCredentials: stage.cors.allowCredentials,
        maxAge: stage.cors.maxAge,
      },
    });

    const lambdaIntegration = new apigwIntegrations.HttpLambdaIntegration(
      "LambdaIntegration",
      this.apiFn
    );

    // ===== Routes =====

    // /trpc/*
    new apigwv2.HttpRoute(this, "TrpcProxy", {
      httpApi: this.httpApi,
      routeKey: apigwv2.HttpRouteKey.with(
        "/trpc/{proxy+}",
        apigwv2.HttpMethod.ANY
      ),
      integration: lambdaIntegration,
    });

    // /health
    new apigwv2.HttpRoute(this, "HealthRoute", {
      httpApi: this.httpApi,
      routeKey: apigwv2.HttpRouteKey.with(
        "/health",
        apigwv2.HttpMethod.GET
      ),
      integration: lambdaIntegration,
    });

    // /hello (optional but useful)
    new apigwv2.HttpRoute(this, "HelloRoute", {
      httpApi: this.httpApi,
      routeKey: apigwv2.HttpRouteKey.with(
        "/hello",
        apigwv2.HttpMethod.GET
      ),
      integration: lambdaIntegration,
    });

    // ===== Outputs =====
    new cdk.CfnOutput(this, "HttpApiInvokeUrl", {
      value: `https://${this.httpApi.apiId}.execute-api.${this.region}.amazonaws.com`,
    });

    new cdk.CfnOutput(this, "FunctionName", {
      value: this.apiFn.functionName,
    });

    new cdk.CfnOutput(this, "TradingCronFunctionName", {
      value: this.tradingCronFn.functionName,
    });

    new cdk.CfnOutput(this, "TableName", {
      value: props.ddbTable.tableName,
    });
  }
}
