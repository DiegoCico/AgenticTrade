import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

interface DnsStackProps extends cdk.StackProps {
  domainName: string;
}

export class DnsStack extends cdk.Stack {
  public readonly zone: route53.IHostedZone;
  public readonly webCert: acm.ICertificate;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    this.zone = new route53.HostedZone(this, "HostedZone", {
      zoneName: props.domainName,
    });

    this.webCert = new acm.DnsValidatedCertificate(this, "WebCert", {
      domainName: props.domainName,
      subjectAlternativeNames: [`www.${props.domainName}`],
      hostedZone: this.zone,
      region: "us-east-1",
    });
  }
}
