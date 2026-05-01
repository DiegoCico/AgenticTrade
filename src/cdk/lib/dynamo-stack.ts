import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export interface DynamoStackProps extends cdk.StackProps {
  stage: string;       // prod | beta | dev
  serviceName?: string;
}

export class DynamoStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoStackProps) {
    super(scope, id, props);

    const serviceName = props.serviceName ?? "agentictrade";

    this.table = new dynamodb.Table(this, "AgentictradeTable", {
      tableName: `${serviceName}-${props.stage}`,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },

      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      pointInTimeRecovery: props.stage === "prod",

      removalPolicy:
        props.stage === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });
  }
}
