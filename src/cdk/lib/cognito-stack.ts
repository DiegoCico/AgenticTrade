import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as logs from "aws-cdk-lib/aws-logs";

export interface CognitoStackProps extends cdk.StackProps {
  stage: string;
  serviceName?: string;
  webUrl?: string;
  ddbTable?: cdk.aws_dynamodb.Table;
}

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    const serviceName = props.serviceName ?? "agentictrade";
    const stage = props.stage;

    // ===== Pre-signup Lambda Trigger =====
    const preSignupTrigger = new NodejsFunction(this, "PreSignupTrigger", {
      functionName: `${serviceName}-${stage}-pre-signup`,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.resolve(__dirname, "../../api/src/cognito/pre-signup.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        target: "node20",
        format: OutputFormat.CJS,
        minify: true,
        sourceMap: true,
        externalModules: ["aws-sdk"],
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        STAGE: stage,
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });

    // ===== Post-confirmation Lambda Trigger =====
    const postConfirmationTrigger = new NodejsFunction(this, "PostConfirmationTrigger", {
      functionName: `${serviceName}-${stage}-post-confirmation`,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.resolve(__dirname, "../../api/src/cognito/post-confirmation.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        target: "node20",
        format: OutputFormat.CJS,
        minify: true,
        sourceMap: true,
        externalModules: ["aws-sdk"],
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        STAGE: stage,
        TABLE_NAME: props.ddbTable?.tableName || '',
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });

    // Grant DynamoDB permissions to post-confirmation trigger
    if (props.ddbTable) {
      props.ddbTable.grantReadWriteData(postConfirmationTrigger);
    }

    // ===== User Pool =====
    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${serviceName}-${stage}-users`,
      
      // Sign-in configuration
      signInAliases: {
        email: true,
        username: false,
        phone: false,
      },
      
      // Auto-verified attributes
      autoVerify: {
        email: true,
      },
      
      // Required attributes
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
      },
      
      // Custom attributes
      customAttributes: {
        'plan_count': new cognito.NumberAttribute({ min: 0, max: 100, mutable: true }),
        'subscription_tier': new cognito.StringAttribute({ minLen: 1, maxLen: 20, mutable: true }),
      },
      
      // Password policy
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      
      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // Self sign-up
      selfSignUpEnabled: true,
      
      // User verification
      userVerification: {
        emailSubject: `Welcome to ${serviceName}! Verify your email`,
        emailBody: 'Hello {username}, Welcome to our Financial Planner! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      
      // User invitation (for admin-created users)
      userInvitation: {
        emailSubject: `You've been invited to ${serviceName}`,
        emailBody: 'Hello {username}, you have been invited to join our Financial Planner. Your temporary password is {####}',
      },
      
      // Lambda triggers
      lambdaTriggers: {
        preSignUp: preSignupTrigger,
        postConfirmation: postConfirmationTrigger,
      },
      
      // Deletion protection
      removalPolicy: stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      
      // Device tracking
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: false,
      },
      
      // MFA configuration
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
    });

    // ===== User Pool Client =====
    this.userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      userPoolClientName: `${serviceName}-${stage}-client`,
      
      // Auth flows
      authFlows: {
        userPassword: true, 
        custom: false,
        userSrp: false,
      },

      
      // OAuth configuration
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false, // Disable for security
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          "http://localhost:5173/auth/callback",
          ...(props.webUrl ? [`${props.webUrl}/auth/callback`] : []),
        ],
        logoutUrls: [
          "http://localhost:5173/auth/logout",
          ...(props.webUrl ? [`${props.webUrl}/auth/logout`] : []),
        ],
      },
      
      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      
      // Prevent user existence errors
      preventUserExistenceErrors: true,
      
      // Read/write attributes
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          givenName: true,
          familyName: true,
        })
        .withCustomAttributes('plan_count', 'subscription_tier'),
      
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
        })
        .withCustomAttributes('plan_count', 'subscription_tier'),
      
      // Generate secret (needed for server-side auth)
      generateSecret: false, 
    });

    // ===== User Pool Domain =====
    const userPoolDomain = this.userPool.addDomain("Domain", {
      cognitoDomain: {
        domainPrefix: `${serviceName}-${stage}-auth`,
      },
    });


    // ===== Identity Pool =====
    this.identityPool = new cognito.CfnIdentityPool(this, "IdentityPool", {
      identityPoolName: `${serviceName}_${stage}_identity_pool`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: false,
        },
      ],
    });

    // ===== IAM Roles for Identity Pool =====
    const authenticatedRole = new cdk.aws_iam.Role(this, "AuthenticatedRole", {
      assumedBy: new cdk.aws_iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      inlinePolicies: {
        CognitoIdentityPoolPolicy: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "mobileanalytics:PutEvents",
                "cognito-sync:*",
                "cognito-identity:*",
              ],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    // Attach role to identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, "IdentityPoolRoleAttachment", {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // ===== Outputs =====
    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      exportName: `${serviceName}-${stage}-UserPoolId`,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${serviceName}-${stage}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, "IdentityPoolId", {
      value: this.identityPool.ref,
      exportName: `${serviceName}-${stage}-IdentityPoolId`,
    });

    new cdk.CfnOutput(this, "UserPoolDomain", {
      value: userPoolDomain.domainName,
      exportName: `${serviceName}-${stage}-UserPoolDomain`,
    });

    new cdk.CfnOutput(this, "AuthUrl", {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      exportName: `${serviceName}-${stage}-AuthUrl`,
    });
  }
}