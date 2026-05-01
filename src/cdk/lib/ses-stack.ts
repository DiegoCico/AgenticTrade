import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ses from "aws-cdk-lib/aws-ses";
import * as iam from "aws-cdk-lib/aws-iam";

export interface SesStackProps extends cdk.StackProps {
  stage: string;
  serviceName?: string;
  fromEmail: string;
}

export class SesStack extends cdk.Stack {
  public readonly fromEmail: string;

  constructor(scope: Construct, id: string, props: SesStackProps) {
    super(scope, id, props);

    const serviceName = props.serviceName ?? "agentictrade";

    // Verify sender email
    new ses.EmailIdentity(this, "FromEmailIdentity", {
      identity: ses.Identity.email(props.fromEmail),
    });

    // IAM policy to send email
    new iam.ManagedPolicy(this, "SesSendPolicy", {
      managedPolicyName: `${serviceName}-${props.stage}-ses-send`,
      statements: [
        new iam.PolicyStatement({
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        }),
      ],
    });

    this.fromEmail = props.fromEmail;

    new cdk.CfnOutput(this, "SesFromEmail", {
      value: props.fromEmail,
    });
  }
}
