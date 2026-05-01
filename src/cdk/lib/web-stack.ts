import * as fs from "fs";
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as targets from "aws-cdk-lib/aws-route53-targets";

export interface WebStackProps extends cdk.StackProps {
  stage: { name: string };
  serviceName?: string;
  frontendBuildPath?: string;
  apiDomainName?: string;
  apiPaths?: string[];

  hostedZone?: route53.IHostedZone;
  certificate?: acm.ICertificate;
  domainName?: string;
}

export class WebStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly webUrl: string;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const stageName = props.stage.name;
    const serviceName = props.serviceName ?? "agentictrade-web";

    // ===== S3 Bucket (Frontend) =====
    this.bucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy:
        stageName === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: stageName !== "prod",
    });

    // ===== CloudFront OAI =====
    const oai = new cloudfront.OriginAccessIdentity(this, "OAI", {
      comment: `${serviceName}-${stageName}-oai`,
    });

    this.bucket.grantRead(oai);

    const s3Origin = new origins.S3Origin(this.bucket, {
      originAccessIdentity: oai,
    });

    // ======== cache policy ========
    const apiCachePolicy = new cloudfront.CachePolicy(this, "ApiCachePolicy", {
      cachePolicyName: `${serviceName}-${stageName}-api-cache`,

      // MUST be > 0
      defaultTtl: cdk.Duration.seconds(1),
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(1),

      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        "Authorization"
      ),
      cookieBehavior: cloudfront.CacheCookieBehavior.all(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
    });

    // ===== API Origin =====
    const apiDomainName = props.apiDomainName;
    const apiPaths =
      props.apiPaths?.length
        ? props.apiPaths
        : ["/trpc/*", "/health", "/hello"];

    const additionalBehaviors: Record<string, cloudfront.BehaviorOptions> = {};

    if (apiDomainName) {
      const apiOrigin = new origins.HttpOrigin(apiDomainName, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });

      const apiRequestPolicy = new cloudfront.OriginRequestPolicy(
        this,
        "ApiRequestPolicy",
        {
          cookieBehavior:
            cloudfront.OriginRequestCookieBehavior.all(),
          queryStringBehavior:
            cloudfront.OriginRequestQueryStringBehavior.all(),
          headerBehavior:
            cloudfront.OriginRequestHeaderBehavior.allowList(
              "Origin",
              "Referer",
              "Accept",
              "Accept-Language",
              "Content-Type"
            ),
        }
      );

      for (const pattern of apiPaths) {
        additionalBehaviors[pattern] = {
          origin: apiOrigin,
          allowedMethods:
            cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy:apiCachePolicy,
          originRequestPolicy: apiRequestPolicy,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        };
      }
    }

    // ROUTE NAME
    const domainNames =
      props.domainName
        ? [props.domainName, `www.${props.domainName}`]
        : undefined;

    // ===== CloudFront Distribution  =====
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `${serviceName}-${stageName}`,
      defaultRootObject: "index.html",

      domainNames,
      certificate: props.certificate,

      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy:
          cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors,
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(1),
        },
      ],
    });

    if (props.hostedZone && props.domainName) {
      new route53.ARecord(this, "RootAlias", {
        zone: props.hostedZone,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution)
        ),
      });

      new route53.ARecord(this, "WwwAlias", {
        zone: props.hostedZone,
        recordName: "www",
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution)
        ),
      });
    }

    if (props.domainName && !props.certificate) {
      throw new Error("domainName provided without ACM certificate");
    }

    // ===== Deploy Frontend =====
    if (props.frontendBuildPath) {
      const resolved = path.resolve(
        __dirname,
        props.frontendBuildPath
      );

      if (fs.existsSync(resolved)) {
        new s3deploy.BucketDeployment(
          this,
          "DeployFrontend",
          {
            sources: [
              s3deploy.Source.asset(resolved),
            ],
            destinationBucket: this.bucket,
            distribution: this.distribution,
            distributionPaths: ["/*"],
            prune: true,
          }
        );
      } else {
        console.warn(
          `[WebStack] Skipping — directory not found: ${resolved}`
        );
      }
    }

    // ===== Outputs =====
    new cdk.CfnOutput(this, "SiteUrl", {
      value: `https://${this.distribution.distributionDomainName}`,
    });

    new cdk.CfnOutput(this, "ApiDomainName", {
      value: apiDomainName ?? "none",
    });

    this.webUrl = `https://${this.distribution.distributionDomainName}`;
  }
}