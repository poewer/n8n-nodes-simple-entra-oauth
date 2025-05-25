import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	IDataObject,
	NodeConnectionType,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { randomBytes } from 'node:crypto';
import { URLSearchParams } from 'node:url';

export class SimpleEntraOAuthNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Simple Entra OAuth',
		name: 'simpleEntraOAuth',
		group: ['transform'],
		version: 1,
		description: 'Simple OAuth flow - generates callback URL for Azure registration, then handles login',
		defaults: {
			name: 'Simple Entra OAuth',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'GET',
				responseMode: 'onReceived',
				path: '={{$parameter["customPath"] || "oauth"}}',
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Generate Setup Info',
						value: 'generateSetup',
						description: 'Generate callback URL and setup instructions for Azure',
					},
					{
						name: 'Create Login Link',
						value: 'createLoginLink',
						description: 'Create login link for user (after Azure setup)',
					},
				],
				default: 'generateSetup',
			},
			{
				displayName: 'Custom Webhook Path',
				name: 'customPath',
				type: 'string',
				default: 'oauth',
				placeholder: 'oauth, auth, microsoft-login, etc.',
				description: 'Custom path for webhook URL (instead of workflow ID)',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: 'default_user',
				required: true,
				description: 'Unique identifier for this user (will be part of callback URL)',
			},
			{
				displayName: 'n8n Instance Configuration',
				name: 'instanceConfig',
				type: 'collection',
				placeholder: 'Add Instance Config',
				default: {},
				options: [
					{
						displayName: 'Use Custom Domain',
						name: 'useCustomDomain',
						type: 'boolean',
						default: false,
						description: 'Enable to use custom domain instead of auto-detected webhook URL',
					},
					{
						displayName: 'Custom Domain',
						name: 'customDomain',
						type: 'string',
						default: 'https://your-n8n-instance.com',
						placeholder: 'https://n8n.example.com',
						displayOptions: {
							show: {
								useCustomDomain: [true],
							},
						},
						description: 'Your n8n instance domain (e.g., https://n8n.example.com)',
					},
				],
			},
			{
				displayName: 'Azure App Details',
				name: 'azureApp',
				type: 'collection',
				placeholder: 'Add Azure App Config',
				default: {},
				displayOptions: {
					show: {
						operation: ['createLoginLink'],
					},
				},
				options: [
					{
						displayName: 'Tenant ID',
						name: 'tenantId',
						type: 'string',
						default: '',
						required: false,
						description: 'Azure AD Tenant ID',
					},
					{
						displayName: 'Client ID',
						name: 'clientId',
						type: 'string',
						default: '',
						required: false,
						description: 'Application Client ID from Azure',
					},
				],
			},
			{
				displayName: 'Permissions Needed',
				name: 'permissions',
				type: 'multiOptions',
				options: [
					{
						name: 'User.Read (Basic profile)',
						value: 'User.Read',
					},
					{
						name: 'Mail.Read (Read emails)',
						value: 'Mail.Read',
					},
					{
						name: 'Mail.Send (Send emails)',
						value: 'Mail.Send',
					},
					{
						name: 'Calendars.Read (Read calendar)',
						value: 'Calendars.Read',
					},
					{
						name: 'Files.Read.All (Read files)',
						value: 'Files.Read.All',
					},
				],
				default: ['User.Read'],
				displayOptions: {
					show: {
						operation: ['createLoginLink'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject = {};

				switch (operation) {
					case 'generateSetup':
						responseData = await generateSetupInfo(this, i);
						break;
					
					case 'createLoginLink':
						responseData = await createLoginLink(this, i);
						break;
					
					default:
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation: ${operation}`,
							{ itemIndex: i }
						);
				}

				returnData.push({
					json: responseData,
					pairedItem: {
						item: i,
					},
				});

			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
							operation,
							userId: this.getNodeParameter('userId', i),
							timestamp: new Date().toISOString(),
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}

	webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const query = req.query as IDataObject;
		
		const code = query.code as string;
		const state = query.state as string;
		const error = query.error as string;
		const userId = query.userId as string;

		// Handle OAuth callback
		if (error) {
			const errorHtml = `
				<html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
					<h2 style="color: red;">Login Failed</h2>
					<p>Error: ${error}</p>
					<p>Description: ${query.error_description || 'Unknown error'}</p>
					<p>You can close this window.</p>
				</body></html>
			`;
			res.status(400).send(errorHtml);
			
			return Promise.resolve({
				workflowData: [
					[
						{
							json: {
								success: false,
								error,
								error_description: query.error_description,
								userId,
								timestamp: new Date().toISOString(),
							},
						},
					],
				],
			});
		}

		if (!code || !state) {
			const errorHtml = `
				<html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
					<h2 style="color: red;">Invalid Request</h2>
					<p>Missing authorization code or state parameter.</p>
					<p>You can close this window.</p>
				</body></html>
			`;
			res.status(400).send(errorHtml);
			
			return Promise.resolve({
				workflowData: [
					[
						{
							json: {
								success: false,
								error: 'missing_parameters',
								userId,
								timestamp: new Date().toISOString(),
							},
						},
					],
				],
			});
		}

		// Success - return data to continue workflow
		const successHtml = `
			<html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
				<h2 style="color: green;">✓ Login Successful!</h2>
				<p>Processing your authentication...</p>
				<p>You can close this window.</p>
			</body></html>
		`;
		res.status(200).send(successHtml);

		return Promise.resolve({
			workflowData: [
				[
					{
						json: {
							success: true,
							code,
							state,
							userId,
							timestamp: new Date().toISOString(),
							next_step: 'Use the code and state to exchange for tokens in next node',
						},
					},
				],
			],
		});
	}
}

// Helper functions outside the class
async function generateSetupInfo(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	try {
		const userId = context.getNodeParameter('userId', itemIndex) as string || 'default_user';
		const customPath = context.getNodeParameter('customPath', itemIndex) as string || 'oauth';
		const instanceConfig = context.getNodeParameter('instanceConfig', itemIndex) as IDataObject;
		
		let callbackUrl: string;
		let webhookUrl: string;
		
		if (instanceConfig.useCustomDomain) {
			// Use custom domain configuration
			const customDomain = instanceConfig.customDomain as string || 'https://your-n8n-instance.com';
			webhookUrl = `${customDomain}/webhook/${customPath}`;
			callbackUrl = `${webhookUrl}?userId=${userId}`;
		} else {
			// Fallback: construct URL from available information
			webhookUrl = `https://YOUR_N8N_DOMAIN/webhook/${customPath}`;
			callbackUrl = `${webhookUrl}?userId=${userId}`;
		}

		return {
			userId,
			customPath,
			callbackUrl,
			webhookUrl,
			configuration: {
				usingCustomDomain: instanceConfig.useCustomDomain || false,
				customDomain: instanceConfig.customDomain || 'not configured',
				customPath: customPath
			},
			setupInstructions: {
				step1: "Go to Azure Portal → App registrations → Your App → Authentication",
				step2: `Add this Redirect URI: ${callbackUrl}`,
				step3: instanceConfig.useCustomDomain ? "URL is ready to use!" : "Replace YOUR_N8N_DOMAIN with your actual n8n domain",
				step4: "Platform type: Web",
				step5: "Save the configuration",
				step6: "Then use 'Create Login Link' operation with your Azure app details"
			},
			azurePortalUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
			note: `This callback URL uses custom path: ${customPath} and is unique for user: ${userId}`,
			nextStep: "After adding the redirect URI in Azure, use the 'Create Login Link' operation",
			ready: instanceConfig.useCustomDomain ? true : false
		};
	} catch (error: any) {
		return {
			error: 'Failed to generate setup info',
			details: error.message,
			userId: 'unknown'
		};
	}
}

async function createLoginLink(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	try {
		const userId = context.getNodeParameter('userId', itemIndex) as string || 'default_user';
		const customPath = context.getNodeParameter('customPath', itemIndex) as string || 'oauth';
		const instanceConfig = context.getNodeParameter('instanceConfig', itemIndex) as IDataObject;
		const azureApp = context.getNodeParameter('azureApp', itemIndex) as IDataObject;
		const permissions = context.getNodeParameter('permissions', itemIndex) as string[];

		const tenantId = azureApp.tenantId as string;
		const clientId = azureApp.clientId as string;

		// Validate required fields for Create Login Link operation
		if (!tenantId || !clientId) {
			return {
				error: 'Missing required Azure configuration',
				message: 'Tenant ID and Client ID are required for Create Login Link operation',
				instructions: 'Please fill in the Azure App Details section with your Tenant ID and Client ID from Azure Portal'
			};
		}

		let callbackUrl: string;
		let webhookUrl: string;
		
		if (instanceConfig.useCustomDomain) {
			// Use custom domain configuration
			const customDomain = instanceConfig.customDomain as string || 'https://your-n8n-instance.com';
			webhookUrl = `${customDomain}/webhook/${customPath}`;
			callbackUrl = `${webhookUrl}?userId=${userId}`;
		} else {
			// Fallback: construct URL from available information  
			webhookUrl = `https://YOUR_N8N_DOMAIN/webhook/${customPath}`;
			callbackUrl = `${webhookUrl}?userId=${userId}`;
		}

		// Generate secure state
		const state = randomBytes(16).toString('hex');

		// Build scopes with Graph API prefix
		const scopes = permissions.map(p => `https://graph.microsoft.com/${p}`);
		scopes.push('offline_access'); // For refresh tokens

		// Create authorization URL
		const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
		const params = new URLSearchParams({
			client_id: clientId,
			response_type: 'code',
			redirect_uri: callbackUrl,
			scope: scopes.join(' '),
			state: `${state}_${userId}`,
			prompt: 'consent',
		});

		const loginUrl = `${authUrl}?${params.toString()}`;

		return {
			userId,
			customPath,
			loginUrl,
			callbackUrl,
			webhookUrl,
			configuration: {
				usingCustomDomain: instanceConfig.useCustomDomain || false,
				customDomain: instanceConfig.customDomain || 'not configured',
				customPath: customPath
			},
			azure: {
				tenantId,
				clientId
			},
			state: `${state}_${userId}`,
			permissions: scopes,
			instructions: [
				"1. Copy the loginUrl below",
				"2. Send this URL to the user who needs to authenticate", 
				"3. User clicks the URL and logs in with their Microsoft account",
				"4. User grants the requested permissions",
				"5. User will be redirected back to your webhook",
				"6. The webhook will receive the authorization code",
				"7. Use the Token Exchange node to convert the code to access tokens"
			],
			message: instanceConfig.useCustomDomain ? "Login URL is ready to use!" : "Configure custom domain or replace YOUR_N8N_DOMAIN in URLs",
			expiresIn: "10 minutes",
			ready: instanceConfig.useCustomDomain ? true : false
		};
	} catch (error: any) {
		return {
			error: 'Failed to create login link',
			details: error.message,
			userId: 'unknown'
		};
	}
}